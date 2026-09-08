begin;

-- Final policy: the client-selection email does not consume the final-gallery
-- access window. The countdown starts exactly once when the editor workflow
-- reaches DELIVERED and final files have been uploaded.
alter table public.client_portals
  add column if not exists delivery_expiry_started_at timestamptz;

-- Repair existing active portals created under the old ready-email rule.
-- Undelivered projects regain access with no countdown. Delivered projects are
-- anchored to their actual delivery timestamp and do not get a fresh window on
-- later page views, downloads, or emails.
with delivery_state as (
  select
    cp.id,
    cp.workspace_id,
    cp.booking_id,
    cp.status,
    coalesce(
      b.edited_photo_delivered_at,
      ej.delivered_at,
      (
        select min(df.published_at)
        from public.deliverable_files df
        where df.workspace_id = cp.workspace_id
          and df.booking_id = cp.booking_id
      )
    ) as delivered_at,
    coalesce(cp.download_expiry_days, gds.portal_expiry_days, 30) as days
  from public.client_portals cp
  join public.bookings b
    on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  left join public.editing_jobs ej
    on ej.booking_id = cp.booking_id and ej.workspace_id = cp.workspace_id
  left join public.google_drive_settings gds
    on gds.workspace_id = cp.workspace_id and gds.id = 1
  where cp.status = 'active'
)
update public.client_portals cp
set delivery_expiry_started_at = ds.delivered_at,
    download_expiry_days = case when ds.delivered_at is null then cp.download_expiry_days else ds.days end,
    expires_at = case
      when ds.delivered_at is null then null
      else ds.delivered_at + ds.days * interval '24 hours'
    end,
    updated_at = clock_timestamp()
from delivery_state ds
where cp.id = ds.id;

create or replace function public.start_portal_expiry_on_final_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  portal_row public.client_portals%rowtype;
  days integer;
  started_at timestamptz;
begin
  if new.status <> 'DELIVERED' then
    return new;
  end if;

  select cp.* into portal_row
  from public.client_portals cp
  where cp.workspace_id = new.workspace_id
    and cp.booking_id = new.booking_id
    and cp.status = 'active'
  for update;

  if not found then
    return new;
  end if;

  -- Idempotency: an already-started final-delivery window is immutable.
  if portal_row.delivery_expiry_started_at is not null then
    return new;
  end if;

  -- A delivered state must correspond to real published files.
  if not exists (
    select 1
    from public.deliverable_files df
    where df.workspace_id = new.workspace_id
      and df.booking_id = new.booking_id
  ) then
    return new;
  end if;

  select portal_expiry_days into days
  from public.google_drive_settings
  where id = 1 and workspace_id = new.workspace_id;

  days := coalesce(portal_row.download_expiry_days, days, 30);
  if days < 1 or days > 3650 then
    raise exception 'Portal expiry setting is invalid';
  end if;

  started_at := coalesce(new.delivered_at, clock_timestamp());

  update public.client_portals
  set delivery_expiry_started_at = started_at,
      download_expiry_days = days,
      expires_at = started_at + days * interval '24 hours',
      updated_at = clock_timestamp()
  where id = portal_row.id
  returning * into portal_row;

  insert into public.provisioning_audit(booking_id, action, actor_type, metadata)
  values (
    portal_row.booking_id,
    'portal_expiry_started_by_final_delivery',
    'system',
    jsonb_build_object(
      'portalId', portal_row.id,
      'deliveryExpiryStartedAt', portal_row.delivery_expiry_started_at,
      'expiresAt', portal_row.expires_at,
      'days', portal_row.download_expiry_days
    )
  );

  return new;
end;
$$;

revoke all on function public.start_portal_expiry_on_final_delivery() from public, anon, authenticated;
grant execute on function public.start_portal_expiry_on_final_delivery() to service_role;

drop trigger if exists editing_jobs_start_portal_expiry_insert on public.editing_jobs;
create trigger editing_jobs_start_portal_expiry_insert
after insert on public.editing_jobs
for each row
when (new.status = 'DELIVERED')
execute function public.start_portal_expiry_on_final_delivery();

drop trigger if exists editing_jobs_start_portal_expiry_update on public.editing_jobs;
create trigger editing_jobs_start_portal_expiry_update
after update of status, delivered_at on public.editing_jobs
for each row
when (new.status = 'DELIVERED')
execute function public.start_portal_expiry_on_final_delivery();

-- Backwards-compatible RPC: older app instances may still call this after the
-- selection-ready email. Keep the audit timestamp, but never create or extend
-- expires_at from this event.
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
  recorded_at timestamptz;
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
    recorded_at := least(coalesce(p_sent_at, clock_timestamp()), clock_timestamp());
    update public.client_portals
    set access_email_sent_at = recorded_at,
        updated_at = clock_timestamp()
    where id = portal.id
    returning * into portal;
  end if;

  return jsonb_build_object(
    'portalReadyEmailSentAt', portal.access_email_sent_at,
    'deliveryExpiryStartedAt', portal.delivery_expiry_started_at,
    'expiresAt', portal.expires_at,
    'days', portal.download_expiry_days
  );
end;
$$;

revoke all on function public.record_portal_ready_email(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_portal_ready_email(uuid, uuid, timestamptz) to service_role;

commit;
