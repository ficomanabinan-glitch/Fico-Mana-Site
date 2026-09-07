begin;

alter table public.client_portals
  add column if not exists first_download_at timestamptz,
  add column if not exists download_expiry_days integer check (download_expiry_days between 1 and 3650);

-- Remove the old delivery-based timer only for portals that are still open.
-- Save the previous deadline for audit/recovery. Never reopen an expired/disabled link.
with changed as (
  select id, booking_id, expires_at from public.client_portals
  where status = 'active' and first_download_at is null and expires_at > now()
), logged as (
  insert into public.provisioning_audit(booking_id,action,actor_type,metadata)
  select booking_id,'portal_expiry_waiting_for_first_download','system',
    jsonb_build_object('previousExpiresAt',expires_at,'portalId',id)
  from changed returning booking_id
)
update public.client_portals p set expires_at=null, updated_at=now()
from changed c where p.id=c.id;

create or replace function public.record_portal_first_download(p_workspace uuid,p_public_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.client_portals%rowtype; days integer; completed_at timestamptz;
begin
  select cp.* into p from public.client_portals cp
  join public.bookings b on b.id=cp.booking_id and b.workspace_id=cp.workspace_id
  join public.workspaces w on w.id=cp.workspace_id and w.slug='fico-mana' and w.status='active'
  where cp.public_id=p_public_id and cp.workspace_id=p_workspace for update of cp;
  if not found or p.status<>'active' or p.expires_at<=clock_timestamp() then
    raise exception 'Portal is unavailable';
  end if;
  if not exists(select 1 from public.deliverable_files f where f.workspace_id=p_workspace and f.booking_id=p.booking_id) then
    raise exception 'No delivered photos are available';
  end if;
  if exists(select 1 from public.photo_selections s where s.workspace_id=p_workspace and s.booking_id=p.booking_id and s.raw_reset_id is not null) then
    raise exception 'Photos are being updated';
  end if;
  if p.first_download_at is null then
    select portal_expiry_days into days from public.google_drive_settings where id=1 and workspace_id=p_workspace;
    days := coalesce(days,30);
    if days<1 or days>3650 then raise exception 'Portal expiry setting is invalid'; end if;
    completed_at := clock_timestamp();
    update public.client_portals set first_download_at=completed_at,download_expiry_days=days,
      expires_at=completed_at + days * interval '24 hours',updated_at=completed_at
    where id=p.id returning * into p;
    insert into public.provisioning_audit(booking_id,action,actor_type,metadata)
    values(p.booking_id,'portal_first_download','system',jsonb_build_object(
      'portalId',p.id,'firstDownloadAt',p.first_download_at,'expiresAt',p.expires_at,'days',days));
  end if;
  return jsonb_build_object('firstDownloadAt',p.first_download_at,'expiresAt',p.expires_at,'days',p.download_expiry_days);
end;
$$;

revoke all on function public.record_portal_first_download(uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_portal_first_download(uuid,uuid) to service_role;

commit;
