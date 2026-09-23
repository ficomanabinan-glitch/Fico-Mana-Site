begin;

-- Every started original-photo transfer reserves one of the two rolling-week
-- slots until the worker reports success/failure or the six-hour lease expires.
-- This allows one immediate retry when one slot remains, but rapid clicks cannot
-- supersede active streams and create unlimited R2 egress.
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
  where portal_id = portal.id and request_id is null and status = 'STARTED'
    and expires_at > clock_timestamp();
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
  if not exists (
    select 1 from public.photo_selections s
    where s.workspace_id = p_workspace and s.booking_id = portal.booking_id and s.status = 'SUBMITTED'
  ) then
    raise exception 'Selection must be submitted first';
  end if;

  perform public.release_expired_portal_raw_downloads(portal.id);
  select count(*)::integer into completed_count
  from public.portal_raw_download_attempts
  where portal_id = portal.id and request_id is null and status = 'COMPLETED'
    and completed_at > clock_timestamp() - interval '7 days';
  select count(*)::integer into active_count
  from public.portal_raw_download_attempts
  where portal_id = portal.id and request_id is null and status = 'STARTED'
    and expires_at > clock_timestamp();

  if completed_count + active_count < 2 then
    insert into public.portal_raw_download_attempts(workspace_id,booking_id,portal_id,expires_at)
    values(portal.workspace_id,portal.booking_id,portal.id,clock_timestamp() + interval '6 hours') returning * into attempt;
  else
    select * into access_request from public.portal_raw_download_requests
    where portal_id = portal.id and status = 'GRANTED'
    order by granted_at asc limit 1 for update skip locked;
    if not found then raise exception 'DOWNLOAD_LIMIT_REACHED'; end if;
    update public.portal_raw_download_requests
    set status = 'RESERVED', updated_at = clock_timestamp()
    where id = access_request.id;
    insert into public.portal_raw_download_attempts(workspace_id,booking_id,portal_id,request_id,expires_at)
    values(portal.workspace_id,portal.booking_id,portal.id,access_request.id,clock_timestamp() + interval '6 hours') returning * into attempt;
  end if;

  return jsonb_build_object('attemptId',attempt.id,'expiresAt',attempt.expires_at);
end;
$$;

revoke all on function public.portal_raw_download_state(uuid,uuid) from public, anon, authenticated;
revoke all on function public.begin_portal_raw_download(uuid,uuid) from public, anon, authenticated;
grant execute on function public.portal_raw_download_state(uuid,uuid) to service_role;
grant execute on function public.begin_portal_raw_download(uuid,uuid) to service_role;

commit;
