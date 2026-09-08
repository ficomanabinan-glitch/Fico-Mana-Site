begin;

-- The first successful portal-ready email is the single source of truth for the
-- access window. Existing rows keep an explicit administrator-set expiry.
with ready as (
  select cp.id,
    coalesce(cp.download_expiry_days, settings.portal_expiry_days, 30) as days
  from public.client_portals cp
  left join public.google_drive_settings settings
    on settings.workspace_id = cp.workspace_id and settings.id = 1
  where cp.status = 'active'
    and cp.access_email_sent_at is not null
    and cp.expires_at is null
)
update public.client_portals cp
set download_expiry_days = ready.days,
    expires_at = cp.access_email_sent_at + ready.days * interval '24 hours',
    updated_at = now()
from ready
where cp.id = ready.id;

create or replace function public.record_portal_ready_email(
  p_workspace uuid,
  p_public_id uuid,
  p_sent_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  portal public.client_portals%rowtype;
  days integer;
  started_at timestamptz;
begin
  select cp.* into portal
  from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace
  for update of cp;

  if not found or portal.status <> 'active' then
    raise exception 'Portal is unavailable';
  end if;

  if portal.access_email_sent_at is null then
    select portal_expiry_days into days
    from public.google_drive_settings
    where id = 1 and workspace_id = p_workspace;
    days := coalesce(days, 30);
    if days < 1 or days > 3650 then
      raise exception 'Portal expiry setting is invalid';
    end if;

    started_at := least(coalesce(p_sent_at, clock_timestamp()), clock_timestamp());
    update public.client_portals
    set access_email_sent_at = started_at,
        download_expiry_days = days,
        expires_at = started_at + days * interval '24 hours',
        updated_at = clock_timestamp()
    where id = portal.id
    returning * into portal;

    insert into public.provisioning_audit(booking_id, action, actor_type, metadata)
    values (
      portal.booking_id,
      'portal_expiry_started_by_ready_email',
      'system',
      jsonb_build_object(
        'portalId', portal.id,
        'portalReadyEmailSentAt', portal.access_email_sent_at,
        'expiresAt', portal.expires_at,
        'days', portal.download_expiry_days
      )
    );
  elsif portal.expires_at is null then
    -- Repair a successful email whose timestamp was saved before this migration.
    select portal_expiry_days into days
    from public.google_drive_settings
    where id = 1 and workspace_id = p_workspace;
    days := coalesce(portal.download_expiry_days, days, 30);
    if days < 1 or days > 3650 then
      raise exception 'Portal expiry setting is invalid';
    end if;
    update public.client_portals
    set download_expiry_days = days,
        expires_at = access_email_sent_at + days * interval '24 hours',
        updated_at = clock_timestamp()
    where id = portal.id
    returning * into portal;
  end if;

  return jsonb_build_object(
    'portalReadyEmailSentAt', portal.access_email_sent_at,
    'expiresAt', portal.expires_at,
    'days', portal.download_expiry_days
  );
end;
$$;

revoke all on function public.record_portal_ready_email(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_portal_ready_email(uuid, uuid, timestamptz) to service_role;

-- Downloads remain useful audit events, but they no longer create or extend
-- the expiry window.
create or replace function public.record_portal_first_download(p_workspace uuid, p_public_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  portal public.client_portals%rowtype;
  completed_at timestamptz;
begin
  select cp.* into portal
  from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace
  for update of cp;

  if not found or portal.status <> 'active' or portal.expires_at <= clock_timestamp() then
    raise exception 'Portal is unavailable';
  end if;
  if not exists (
    select 1 from public.deliverable_files f
    where f.workspace_id = p_workspace and f.booking_id = portal.booking_id
  ) then
    raise exception 'No delivered photos are available';
  end if;
  if exists (
    select 1 from public.photo_selections s
    where s.workspace_id = p_workspace and s.booking_id = portal.booking_id and s.raw_reset_id is not null
  ) then
    raise exception 'Photos are being updated';
  end if;

  if portal.first_download_at is null then
    completed_at := clock_timestamp();
    update public.client_portals
    set first_download_at = completed_at,
        updated_at = completed_at
    where id = portal.id
    returning * into portal;

    insert into public.provisioning_audit(booking_id, action, actor_type, metadata)
    values (
      portal.booking_id,
      'portal_first_download',
      'system',
      jsonb_build_object(
        'portalId', portal.id,
        'firstDownloadAt', portal.first_download_at,
        'expiresAt', portal.expires_at
      )
    );
  end if;

  return jsonb_build_object(
    'firstDownloadAt', portal.first_download_at,
    'expiresAt', portal.expires_at,
    'days', portal.download_expiry_days
  );
end;
$$;

revoke all on function public.record_portal_first_download(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_portal_first_download(uuid, uuid) to service_role;

commit;
