begin;

-- Client originals are included twice for the lifetime of the portal. Staff can
-- still grant one additional download at a time through the existing request
-- workflow. A longer reservation lets slow connections finish a large archive.
alter table public.portal_raw_download_attempts
  alter column expires_at set default (clock_timestamp() + interval '6 hours');

create table if not exists public.private_download_manifests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  portal_id uuid references public.client_portals(id) on delete cascade,
  raw_attempt_id uuid unique references public.portal_raw_download_attempts(id) on delete cascade,
  kind text not null check (kind in ('PORTAL_ORIGINALS','PORTAL_DELIVERABLES')),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  file_name text not null check (char_length(file_name) between 1 and 180),
  entries jsonb not null check (
    jsonb_typeof(entries) = 'array'
    and jsonb_array_length(entries) between 1 and 2000
  ),
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETED','FAILED')),
  expires_at timestamptz not null default (clock_timestamp() + interval '6 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (kind = 'PORTAL_ORIGINALS' and raw_attempt_id is not null)
    or (kind = 'PORTAL_DELIVERABLES' and raw_attempt_id is null)
  )
);

create index if not exists private_download_manifests_expiry_idx
  on public.private_download_manifests (status, expires_at);

alter table public.private_download_manifests enable row level security;
revoke all on public.private_download_manifests from public, anon, authenticated;
grant all on public.private_download_manifests to service_role;

create or replace function public.portal_raw_download_state(p_workspace uuid, p_public_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  portal public.client_portals%rowtype;
  completed_count integer;
  active_count integer;
  open_request public.portal_raw_download_requests%rowtype;
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
  select count(*)::integer into completed_count
  from public.portal_raw_download_attempts
  where portal_id = portal.id and request_id is null and status = 'COMPLETED';
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
    'nextAvailableAt', null
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
  if not exists (select 1 from public.photo_selections s where s.workspace_id=p_workspace and s.booking_id=portal.booking_id and s.status='SUBMITTED') then
    raise exception 'Selection must be submitted first';
  end if;
  perform public.release_expired_portal_raw_downloads(portal.id);
  select count(*)::integer into completed_count from public.portal_raw_download_attempts
  where portal_id=portal.id and request_id is null and status='COMPLETED';
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

-- The Cloudflare Worker uses an unguessable, short-lived capability token. It
-- receives only the R2 object keys for this one archive; the tables remain
-- inaccessible to browser roles.
create or replace function public.resolve_private_download_manifest(p_manifest uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  manifest public.private_download_manifests%rowtype;
  portal public.client_portals%rowtype;
begin
  select m.* into manifest
  from public.private_download_manifests m
  join public.workspaces w on w.id=m.workspace_id and w.slug='fico-mana' and w.status='active'
  where m.id=p_manifest and m.token_hash=p_token_hash and m.status='PENDING'
    and m.expires_at > clock_timestamp();
  if not found then raise exception 'Download link is unavailable'; end if;
  if manifest.portal_id is not null then
    select * into portal from public.client_portals where id=manifest.portal_id;
    if not found or portal.status <> 'active' or (portal.expires_at is not null and portal.expires_at <= clock_timestamp()) then
      raise exception 'Portal is unavailable';
    end if;
  end if;
  return jsonb_build_object('id',manifest.id,'fileName',manifest.file_name,'entries',manifest.entries);
end;
$$;

create or replace function public.complete_private_download_manifest(
  p_manifest uuid,
  p_token_hash text,
  p_success boolean
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  manifest public.private_download_manifests%rowtype;
  portal public.client_portals%rowtype;
begin
  select * into manifest from public.private_download_manifests
  where id=p_manifest and token_hash=p_token_hash for update;
  if not found or manifest.status <> 'PENDING' then return false; end if;
  update public.private_download_manifests
  set status=case when p_success then 'COMPLETED' else 'FAILED' end,
      completed_at=case when p_success then clock_timestamp() else null end,
      updated_at=clock_timestamp()
  where id=manifest.id;
  if manifest.raw_attempt_id is not null then
    perform public.finish_portal_raw_download(manifest.raw_attempt_id,p_success);
  elsif p_success and manifest.kind='PORTAL_DELIVERABLES' then
    select * into portal from public.client_portals where id=manifest.portal_id;
    if found then perform public.record_portal_first_download(manifest.workspace_id,portal.public_id); end if;
  end if;
  return true;
end;
$$;

revoke all on function public.portal_raw_download_state(uuid,uuid) from public, anon, authenticated;
revoke all on function public.begin_portal_raw_download(uuid,uuid) from public, anon, authenticated;
grant execute on function public.portal_raw_download_state(uuid,uuid) to service_role;
grant execute on function public.begin_portal_raw_download(uuid,uuid) to service_role;

revoke all on function public.resolve_private_download_manifest(uuid,text) from public, anon, authenticated;
revoke all on function public.complete_private_download_manifest(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.resolve_private_download_manifest(uuid,text) to anon, service_role;
grant execute on function public.complete_private_download_manifest(uuid,text,boolean) to anon, service_role;

commit;
