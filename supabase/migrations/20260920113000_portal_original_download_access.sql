begin;

create table if not exists public.portal_raw_download_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  portal_id uuid not null references public.client_portals(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status text not null default 'PENDING' check (status in ('PENDING','GRANTED','RESERVED','CONSUMED')),
  requested_at timestamptz not null default clock_timestamp(),
  granted_at timestamptz,
  granted_by uuid,
  consumed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.portal_raw_download_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  portal_id uuid not null references public.client_portals(id) on delete cascade,
  request_id uuid references public.portal_raw_download_requests(id) on delete set null,
  status text not null default 'STARTED' check (status in ('STARTED','COMPLETED','FAILED')),
  started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 minutes'),
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp()
);

create unique index if not exists portal_raw_download_requests_one_open_idx
  on public.portal_raw_download_requests (portal_id)
  where status in ('PENDING','GRANTED','RESERVED');
create index if not exists portal_raw_download_requests_workspace_status_idx
  on public.portal_raw_download_requests (workspace_id,status,requested_at);
create index if not exists portal_raw_download_attempts_portal_window_idx
  on public.portal_raw_download_attempts (portal_id,status,completed_at,started_at);

alter table public.portal_raw_download_requests enable row level security;
alter table public.portal_raw_download_attempts enable row level security;
revoke all on public.portal_raw_download_requests, public.portal_raw_download_attempts from public, anon, authenticated;
grant all on public.portal_raw_download_requests, public.portal_raw_download_attempts to service_role;

create or replace function public.release_expired_portal_raw_downloads(p_portal uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.portal_raw_download_requests r
  set status = 'GRANTED', updated_at = clock_timestamp()
  where r.portal_id = p_portal and r.status = 'RESERVED'
    and exists (
      select 1 from public.portal_raw_download_attempts a
      where a.request_id = r.id and a.status = 'STARTED' and a.expires_at <= clock_timestamp()
    );
  update public.portal_raw_download_attempts
  set status = 'FAILED', updated_at = clock_timestamp()
  where portal_id = p_portal and status = 'STARTED' and expires_at <= clock_timestamp();
end;
$$;

create or replace function public.portal_raw_download_state(p_workspace uuid, p_public_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  portal public.client_portals%rowtype;
  completed_count integer;
  active_count integer;
  open_request public.portal_raw_download_requests%rowtype;
  next_at timestamptz;
begin
  select cp.* into portal
  from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace;
  if not found or portal.status <> 'active' or (portal.expires_at is not null and portal.expires_at <= clock_timestamp()) then
    raise exception 'Portal is unavailable';
  end if;
  perform public.release_expired_portal_raw_downloads(portal.id);
  select count(*)::integer, min(completed_at + interval '7 days')
    into completed_count, next_at
  from public.portal_raw_download_attempts
  where portal_id = portal.id and request_id is null and status = 'COMPLETED'
    and completed_at > clock_timestamp() - interval '7 days';
  select count(*)::integer into active_count
  from public.portal_raw_download_attempts
  where portal_id = portal.id and request_id is null and status = 'STARTED' and expires_at > clock_timestamp();
  select * into open_request from public.portal_raw_download_requests
  where portal_id = portal.id and status in ('PENDING','GRANTED','RESERVED')
  order by requested_at desc limit 1;
  return jsonb_build_object(
    'allowed', completed_count + active_count < 2 or coalesce(open_request.status = 'GRANTED', false),
    'completedInWindow', completed_count,
    'activeDownloads', active_count,
    'limit', 2,
    'requestStatus', coalesce(open_request.status, 'AVAILABLE'),
    'nextAvailableAt', case when completed_count >= 2 then next_at else null end
  );
end;
$$;

create or replace function public.request_portal_raw_download(p_workspace uuid, p_public_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  portal public.client_portals%rowtype;
  state jsonb;
  created public.portal_raw_download_requests%rowtype;
begin
  if char_length(btrim(coalesce(p_reason,''))) < 5 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason between 5 and 500 characters is required';
  end if;
  select cp.* into portal from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace for update of cp;
  if not found then raise exception 'Portal is unavailable'; end if;
  state := public.portal_raw_download_state(p_workspace, p_public_id);
  if (state->>'completedInWindow')::integer < 2 then raise exception 'Download access is still available'; end if;
  insert into public.portal_raw_download_requests(workspace_id,booking_id,portal_id,reason)
  values (portal.workspace_id,portal.booking_id,portal.id,btrim(p_reason)) returning * into created;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
  values (portal.workspace_id,'client',p_public_id::text,'RAW_DOWNLOAD_ACCESS_REQUESTED',portal.booking_id,
    jsonb_build_object('requestId',created.id,'reason',created.reason));
  return jsonb_build_object('id',created.id,'status',created.status,'requestedAt',created.requested_at);
exception when unique_violation then
  raise exception 'A download request is already waiting for the studio';
end;
$$;

create or replace function public.begin_portal_raw_download(p_workspace uuid, p_public_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  portal public.client_portals%rowtype;
  completed_count integer;
  active_count integer;
  access_request public.portal_raw_download_requests%rowtype;
  attempt public.portal_raw_download_attempts%rowtype;
begin
  select cp.* into portal from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace for update of cp;
  if not found or portal.status <> 'active' or (portal.expires_at is not null and portal.expires_at <= clock_timestamp()) then
    raise exception 'Portal is unavailable';
  end if;
  if not exists (select 1 from public.photo_selections s where s.workspace_id=p_workspace and s.booking_id=portal.booking_id and s.status='SUBMITTED') then
    raise exception 'Selection must be submitted first';
  end if;
  perform public.release_expired_portal_raw_downloads(portal.id);
  select count(*)::integer into completed_count from public.portal_raw_download_attempts
  where portal_id=portal.id and request_id is null and status='COMPLETED'
    and completed_at > clock_timestamp() - interval '7 days';
  select count(*)::integer into active_count from public.portal_raw_download_attempts
  where portal_id=portal.id and request_id is null and status='STARTED' and expires_at > clock_timestamp();
  if completed_count + active_count < 2 then
    insert into public.portal_raw_download_attempts(workspace_id,booking_id,portal_id)
    values(portal.workspace_id,portal.booking_id,portal.id) returning * into attempt;
  else
    select * into access_request from public.portal_raw_download_requests
    where portal_id=portal.id and status='GRANTED' order by granted_at asc limit 1 for update skip locked;
    if not found then raise exception 'DOWNLOAD_LIMIT_REACHED'; end if;
    update public.portal_raw_download_requests set status='RESERVED',updated_at=clock_timestamp()
      where id=access_request.id;
    insert into public.portal_raw_download_attempts(workspace_id,booking_id,portal_id,request_id)
    values(portal.workspace_id,portal.booking_id,portal.id,access_request.id) returning * into attempt;
  end if;
  return jsonb_build_object('attemptId',attempt.id,'expiresAt',attempt.expires_at);
end;
$$;

create or replace function public.finish_portal_raw_download(p_attempt uuid, p_success boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare attempt public.portal_raw_download_attempts%rowtype;
begin
  select * into attempt from public.portal_raw_download_attempts where id=p_attempt for update;
  if not found or attempt.status <> 'STARTED' then return; end if;
  update public.portal_raw_download_attempts
  set status=case when p_success then 'COMPLETED' else 'FAILED' end,
      completed_at=case when p_success then clock_timestamp() else null end,updated_at=clock_timestamp()
  where id=attempt.id;
  if attempt.request_id is not null then
    update public.portal_raw_download_requests
    set status=case when p_success then 'CONSUMED' else 'GRANTED' end,
        consumed_at=case when p_success then clock_timestamp() else null end,updated_at=clock_timestamp()
    where id=attempt.request_id and status='RESERVED';
  end if;
  if p_success then
    insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
    values(attempt.workspace_id,'client',null,'RAW_ORIGINALS_DOWNLOADED',attempt.booking_id,
      jsonb_build_object('attemptId',attempt.id,'grantedRequestId',attempt.request_id));
  end if;
end;
$$;

create or replace function public.grant_portal_raw_download(p_workspace uuid, p_request uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare request_row public.portal_raw_download_requests%rowtype;
begin
  select * into request_row from public.portal_raw_download_requests
  where id=p_request and workspace_id=p_workspace for update;
  if not found then raise exception 'Download request not found'; end if;
  if request_row.status <> 'PENDING' then raise exception 'Download request is no longer pending'; end if;
  update public.portal_raw_download_requests set status='GRANTED',granted_at=clock_timestamp(),granted_by=p_actor,updated_at=clock_timestamp()
  where id=request_row.id returning * into request_row;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
  values(p_workspace,'staff',p_actor::text,'RAW_DOWNLOAD_ACCESS_GRANTED',request_row.booking_id,
    jsonb_build_object('requestId',request_row.id,'reason',request_row.reason));
  return jsonb_build_object('id',request_row.id,'status',request_row.status,'grantedAt',request_row.granted_at);
end;
$$;

revoke all on function public.release_expired_portal_raw_downloads(uuid) from public, anon, authenticated;
revoke all on function public.portal_raw_download_state(uuid,uuid) from public, anon, authenticated;
revoke all on function public.request_portal_raw_download(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.begin_portal_raw_download(uuid,uuid) from public, anon, authenticated;
revoke all on function public.finish_portal_raw_download(uuid,boolean) from public, anon, authenticated;
revoke all on function public.grant_portal_raw_download(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.portal_raw_download_state(uuid,uuid) to service_role;
grant execute on function public.request_portal_raw_download(uuid,uuid,text) to service_role;
grant execute on function public.begin_portal_raw_download(uuid,uuid) to service_role;
grant execute on function public.finish_portal_raw_download(uuid,boolean) to service_role;
grant execute on function public.grant_portal_raw_download(uuid,uuid,uuid) to service_role;

commit;
