begin;

-- Access is through authenticated staff/server routes or an unguessable client link.
-- No client role may enumerate invitations, send emails, or claim queue jobs.
create table if not exists public.shoot_invitations (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  schedule_key text not null unique,
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  shoot_date date not null,
  booking_time text not null,
  recipient_email text not null,
  response text not null default 'pending' check (response in ('pending','confirmed','declined')),
  response_note text not null default '' check (length(response_note) <= 500),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create table if not exists public.shoot_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.shoot_invitations(id) on delete cascade,
  kind text not null check (kind in ('day_before','shoot_day')),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  claim_token uuid,
  payload jsonb not null,
  provider_id text,
  sent_at timestamptz,
  last_error text,
  unique(invitation_id, kind)
);
create index if not exists shoot_reminder_due_idx on public.shoot_reminder_deliveries(due_date, status, next_attempt_at);
create index if not exists shoot_invitations_date_idx on public.shoot_invitations(shoot_date, booking_id);
create table if not exists public.shoot_reminder_settings (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  worker_secret_hash text,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_result jsonb
);
insert into public.shoot_reminder_settings(id) values (1) on conflict do nothing;
alter table public.shoot_invitations enable row level security;
alter table public.shoot_reminder_deliveries enable row level security;
alter table public.shoot_reminder_settings enable row level security;
revoke all on public.shoot_invitations, public.shoot_reminder_deliveries, public.shoot_reminder_settings from public, anon, authenticated;
grant all on public.shoot_invitations, public.shoot_reminder_deliveries, public.shoot_reminder_settings to service_role;

-- Changing the recipient or any schedule field invalidates old RSVP links.
create or replace function public.shoot_schedule_key(p_booking public.bookings)
returns text language sql stable set search_path = public, extensions, pg_temp as $$
  select encode(extensions.digest(concat_ws('|', p_booking.id, p_booking.booking_date::text,
    p_booking.booking_time, coalesce(p_booking.arrival_time,''), coalesce(p_booking.shoot_time,''),
    lower(trim(p_booking.customer_email))), 'sha256'), 'hex');
$$;

create or replace function public.authorize_shoot_reminder_worker(p_secret_hash text)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.shoot_reminder_settings
    where id = 1 and worker_secret_hash is not null and worker_secret_hash = p_secret_hash);
$$;

create or replace function public.claim_shoot_reminders(p_limit integer default 40)
returns setof public.shoot_reminder_deliveries
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  local_now timestamp := now() at time zone 'Asia/Manila';
begin
  if not exists(select 1 from public.shoot_reminder_settings where id=1 and enabled) then return; end if;
  -- Starts at 06:00 with catch-up/retries until 08:00, never sends overnight.
  if local_now::time < time '06:00' or local_now::time >= time '08:00' then return; end if;
  update public.shoot_reminder_settings set last_started_at=now() where id=1;
  insert into public.shoot_invitations(booking_id, workspace_id, schedule_key, shoot_date, booking_time, recipient_email, expires_at)
    select b.id, b.workspace_id, public.shoot_schedule_key(b), b.booking_date, coalesce(b.booking_time,'Contact the studio'),
      lower(trim(b.customer_email)), (b.booking_date + 1)::timestamp at time zone 'Asia/Manila'
    from public.bookings b join public.workspaces w on w.id=b.workspace_id
    where b.booking_status='Confirmed' and w.status='active'
      and b.booking_date in (local_now::date, local_now::date+1)
      and b.customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(trim(b.customer_email)) not like '%@%.local'
      and lower(trim(b.customer_email)) <> 'imported@ficomana.studio'
    on conflict(schedule_key) do nothing;

  insert into public.shoot_reminder_deliveries(invitation_id, kind, due_date, payload)
    select i.id, case when b.booking_date=local_now::date then 'shoot_day' else 'day_before' end,
      local_now::date, jsonb_build_object('bookingId',b.id,'customerName',coalesce(b.customer_name,'there'),
        'customerEmail',i.recipient_email,'packageName',coalesce(b.package_name,'Studio session'),'shootDate',b.booking_date::text,
        'bookingTime',coalesce(b.booking_time,'Contact the studio'),'arrivalTime',coalesce(b.arrival_time,''),
        'shootTime',coalesce(b.shoot_time,''),'token',i.token)
    from public.shoot_invitations i join public.bookings b on b.id=i.booking_id
    where b.booking_status='Confirmed' and i.schedule_key=public.shoot_schedule_key(b)
      and b.booking_date in (local_now::date,local_now::date+1) and i.response <> 'declined'
      and (b.booking_date=local_now::date+1 or exists (
        select 1 from public.shoot_reminder_deliveries first_email
        where first_email.invitation_id=i.id and first_email.kind='day_before' and first_email.status='sent'
      ))
    on conflict(invitation_id,kind) do nothing;

  update public.shoot_reminder_deliveries d set status='skipped', last_error='Booking changed, client declined, or delivery window ended.'
    from public.shoot_invitations i, public.bookings b
    where i.id=d.invitation_id and b.id=i.booking_id and d.status in ('pending','failed','sending')
      and (d.locked_until is null or d.locked_until < now())
      and (b.booking_status <> 'Confirmed' or i.schedule_key <> public.shoot_schedule_key(b)
        or i.response='declined' or d.due_date < local_now::date
        or d.first_attempt_at < now()-interval '23 hours');

  return query
    with due as (
      select d.id from public.shoot_reminder_deliveries d
      where d.due_date=local_now::date and d.next_attempt_at<=now() and d.attempts<5
        and (d.first_attempt_at is null or d.first_attempt_at > now()-interval '23 hours')
        and (d.status in ('pending','failed') or (d.status='sending' and d.locked_until < now()))
      order by d.next_attempt_at,d.id limit greatest(1,least(p_limit,40)) for update skip locked
    ) update public.shoot_reminder_deliveries d set status='sending', attempts=attempts+1,
      first_attempt_at=coalesce(first_attempt_at,now()),locked_until=now()+interval '3 minutes',claim_token=gen_random_uuid()
      from due where d.id=due.id returning d.*;
end;
$$;

create or replace function public.shoot_reminder_is_current(p_id uuid, p_claim uuid)
returns boolean language sql security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.shoot_reminder_deliveries d
    join public.shoot_invitations i on i.id=d.invitation_id join public.bookings b on b.id=i.booking_id
    where d.id=p_id and d.claim_token=p_claim and d.status='sending' and d.locked_until>now()
      and i.response<>'declined' and i.expires_at>now() and b.booking_status='Confirmed'
      and (d.kind='day_before' or exists(select 1 from public.shoot_reminder_deliveries first_email
        where first_email.invitation_id=i.id and first_email.kind='day_before' and first_email.status='sent'))
      and i.schedule_key=public.shoot_schedule_key(b)
      and exists(select 1 from public.workspaces w where w.id=b.workspace_id and w.status='active')
      and exists(select 1 from public.shoot_reminder_settings where id=1 and enabled));
$$;

create or replace function public.finish_shoot_reminder(p_id uuid,p_claim uuid,p_status text,p_provider_id text default null,p_error text default null,p_subject text default null,p_html text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.shoot_reminder_deliveries;
begin
  if p_status not in ('sent','failed','skipped') then raise exception 'Invalid delivery status'; end if;
  select * into job from public.shoot_reminder_deliveries where id=p_id and claim_token=p_claim and status='sending' for update;
  if not found then return; end if;
  update public.shoot_reminder_deliveries set status=p_status,provider_id=p_provider_id,
    sent_at=case when p_status='sent' then now() else null end,last_error=left(p_error,500),
    next_attempt_at=now()+interval '5 minutes',locked_until=null where id=job.id;
  if p_status='sent' then
    insert into public.email_logs(booking_id,recipient_email,subject,body,status)
      values(job.payload->>'bookingId',job.payload->>'customerEmail',p_subject,p_html,'SENT');
  end if;
end;
$$;

-- GET only reads. A POST from the response page performs the actual change.
create or replace function public.get_shoot_invitation(p_token text)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('customerName',b.customer_name,'bookingId',b.id,'packageName',b.package_name,
    'shootDate',i.shoot_date,'bookingTime',b.booking_time,'arrivalTime',coalesce(b.arrival_time,b.booking_time),
    'response',i.response,'responseNote',i.response_note,'respondedAt',i.responded_at)
  from public.shoot_invitations i join public.bookings b on b.id=i.booking_id
  where i.token=p_token and i.expires_at>now() and b.booking_status='Confirmed'
    and i.schedule_key=public.shoot_schedule_key(b);
$$;

create or replace function public.respond_to_shoot(p_token text,p_response text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare invitation public.shoot_invitations; booking public.bookings;
begin
  if p_response not in ('confirmed','declined') or length(p_note)>500 then raise exception 'Invalid response'; end if;
  select b.* into booking from public.bookings b join public.shoot_invitations i on i.booking_id=b.id
    where i.token=p_token for update of b;
  select * into invitation from public.shoot_invitations where token=p_token for update;
  if invitation.id is null or invitation.expires_at<=now() or booking.booking_status<>'Confirmed'
    or invitation.schedule_key<>public.shoot_schedule_key(booking) then return null; end if;
  update public.shoot_invitations set response=p_response,response_note=trim(p_note),responded_at=now() where id=invitation.id;
  return public.get_shoot_invitation(p_token);
end;
$$;

-- Staff listing is workspace-scoped and never returns the private response token.
create or replace function public.list_shoot_attendance(p_workspace uuid,p_from date,p_to date)
returns setof jsonb language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('bookingId',b.id,'customerName',b.customer_name,'email',b.customer_email,
    'shootDate',b.booking_date,'bookingTime',b.booking_time,'packageName',b.package_name,
    'response',coalesce(i.response,'pending'),'responseNote',coalesce(i.response_note,''),'respondedAt',i.responded_at,
    'dayBeforeStatus',first_email.status,'dayBeforeSentAt',first_email.sent_at,'dayBeforeError',first_email.last_error,
    'morningStatus',morning.status,'morningSentAt',morning.sent_at,'morningError',morning.last_error)
  from public.bookings b
    left join public.shoot_invitations i on i.booking_id=b.id and i.schedule_key=public.shoot_schedule_key(b)
    left join public.shoot_reminder_deliveries first_email on first_email.invitation_id=i.id and first_email.kind='day_before'
    left join public.shoot_reminder_deliveries morning on morning.invitation_id=i.id and morning.kind='shoot_day'
  where b.workspace_id=p_workspace and b.booking_status='Confirmed'
    and b.booking_date between p_from and least(p_to,p_from+31)
  order by b.booking_date,b.booking_time,b.customer_name,b.id limit 2001;
$$;
revoke all on function public.list_shoot_attendance(uuid,date,date) from public,anon,authenticated;
grant execute on function public.list_shoot_attendance(uuid,date,date) to service_role;

revoke all on function public.shoot_schedule_key(public.bookings),public.authorize_shoot_reminder_worker(text),
  public.claim_shoot_reminders(integer),public.shoot_reminder_is_current(uuid,uuid),
  public.finish_shoot_reminder(uuid,uuid,text,text,text,text,text),public.get_shoot_invitation(text),
  public.respond_to_shoot(text,text,text) from public,anon,authenticated;
grant execute on function public.shoot_schedule_key(public.bookings),public.authorize_shoot_reminder_worker(text),
  public.claim_shoot_reminders(integer),public.shoot_reminder_is_current(uuid,uuid),
  public.finish_shoot_reminder(uuid,uuid,text,text,text,text,text),public.get_shoot_invitation(text),
  public.respond_to_shoot(text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
