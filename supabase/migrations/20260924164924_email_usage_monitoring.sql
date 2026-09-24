begin;

-- One accepted provider message should count once even when an idempotent
-- request is retried after an interrupted response.
alter table public.email_logs
  add column if not exists provider_id text;

create unique index if not exists email_logs_provider_id_unique
  on public.email_logs(provider_id);

create table if not exists public.email_usage_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  monthly_limit integer not null default 3000 check (monthly_limit in (3000, 50000)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint email_usage_settings_plan_limit_check check (
    (plan = 'free' and monthly_limit = 3000)
    or (plan = 'pro' and monthly_limit = 50000)
  )
);

alter table public.email_usage_settings enable row level security;
revoke all on table public.email_usage_settings from public, anon, authenticated;
grant all on table public.email_usage_settings to service_role;

comment on table public.email_usage_settings is
  'Workspace Resend plan used to compare accepted email logs with the configured allowance.';

-- Preserve reminder logging while attaching the provider id used by the
-- counter to deduplicate accepted retries.
create or replace function public.finish_shoot_reminder(
  p_id uuid,
  p_claim uuid,
  p_status text,
  p_provider_id text default null,
  p_error text default null,
  p_subject text default null,
  p_html text default null
)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.shoot_reminder_deliveries;
begin
  if p_status not in ('sent','failed','skipped') then raise exception 'Invalid delivery status'; end if;
  select * into job from public.shoot_reminder_deliveries
    where id=p_id and claim_token=p_claim and status='sending' for update;
  if not found then return; end if;
  update public.shoot_reminder_deliveries set status=p_status,provider_id=p_provider_id,
    sent_at=case when p_status='sent' then now() else null end,last_error=left(p_error,500),
    next_attempt_at=now()+interval '5 minutes',locked_until=null where id=job.id;
  if p_status='sent' then
    insert into public.email_logs(booking_id,recipient_email,subject,body,status,provider_id)
      values(job.payload->>'bookingId',job.payload->>'customerEmail',p_subject,p_html,'SENT',p_provider_id)
      on conflict (provider_id) do nothing;
  end if;
end;
$$;

revoke all on function public.finish_shoot_reminder(uuid,uuid,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.finish_shoot_reminder(uuid,uuid,text,text,text,text,text)
  to service_role;

notify pgrst, 'reload schema';
commit;
