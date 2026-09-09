begin;

alter table public.client_portals add column if not exists deliverables_uploaded_at timestamptz;

-- Remove only recognizable automatic deadlines from the previous email/download rules.
-- Preserve deliberate staff deadlines and disabled access; never reactivate a revoked portal.
with release_events as (
  select workspace_id, booking_id, published_at as released_at from public.deliverable_files where published_at is not null
  union all
  select workspace_id, id, edited_photo_delivered_at from public.bookings
  where edited_photo_delivered_at is not null and nullif(trim(edited_photo_link), '') is not null
), delivered as (
  select workspace_id, booking_id, min(released_at) as first_published_at
  from release_events
  group by workspace_id, booking_id
), previous as (
  select cp.id, cp.expires_at as previous_expiry, d.first_published_at,
    coalesce(cp.download_expiry_days, s.portal_expiry_days, 30) as days,
    cp.expires_at is null or cp.expires_at = cp.access_email_sent_at + coalesce(cp.download_expiry_days, s.portal_expiry_days, 30) * interval '24 hours'
      or cp.expires_at = cp.first_download_at + coalesce(cp.download_expiry_days, s.portal_expiry_days, 30) * interval '24 hours' as automatic
  from public.client_portals cp
  left join delivered d on d.workspace_id = cp.workspace_id and d.booking_id = cp.booking_id
  left join public.google_drive_settings s on s.workspace_id = cp.workspace_id and s.id = 1
), changed as (
  update public.client_portals cp
  set deliverables_uploaded_at = p.first_published_at,
      download_expiry_days = case when p.first_published_at is not null then p.days else cp.download_expiry_days end,
      expires_at = case when p.automatic then p.first_published_at + p.days * interval '24 hours' else cp.expires_at end,
      updated_at = clock_timestamp()
  from previous p where p.id = cp.id and cp.deliverables_uploaded_at is null
  returning cp.booking_id, cp.id, cp.expires_at, p.previous_expiry, p.first_published_at
)
insert into public.provisioning_audit(booking_id, action, actor_type, metadata)
select booking_id, 'portal_expiry_delivery_rule_migrated', 'system',
  jsonb_build_object('portalId', id, 'previousExpiresAt', previous_expiry, 'expiresAt', expires_at, 'deliverablesUploadedAt', first_published_at)
from changed;

create or replace function public.start_portal_expiry_on_delivery()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare portal public.client_portals%rowtype; days integer; released_at timestamptz; delivery_booking varchar; delivery_workspace uuid;
begin
  if tg_table_name = 'bookings' then
    if new.edited_photo_delivered_at is null or nullif(trim(new.edited_photo_link), '') is null then return new; end if;
    released_at := new.edited_photo_delivered_at;
    delivery_booking := new.id;
  else
    if new.published_at is null then return new; end if;
    released_at := new.published_at;
    delivery_booking := new.booking_id;
  end if;
  delivery_workspace := new.workspace_id;
  select cp.* into portal from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  where cp.workspace_id = delivery_workspace and cp.booking_id = delivery_booking
  for update of cp;
  if not found or portal.deliverables_uploaded_at is not null then return new; end if;
  select portal_expiry_days into days from public.google_drive_settings where workspace_id = delivery_workspace and id = 1;
  days := coalesce(days, 30);
  if days < 1 or days > 3650 then raise exception 'Portal expiry setting is invalid'; end if;
  released_at := least(released_at, clock_timestamp());
  update public.client_portals set deliverables_uploaded_at = released_at,
    download_expiry_days = days,
    expires_at = coalesce(portal.expires_at, released_at + days * interval '24 hours'),
    updated_at = clock_timestamp() where id = portal.id;
  insert into public.provisioning_audit(booking_id, action, actor_type, metadata)
  values(delivery_booking, 'portal_expiry_started_by_delivery', 'system',
    jsonb_build_object('portalId', portal.id, 'deliverablesUploadedAt', released_at, 'days', days,
      'expiresAt', coalesce(portal.expires_at, released_at + days * interval '24 hours')));
  return new;
end $$;
revoke all on function public.start_portal_expiry_on_delivery() from public, anon, authenticated;
drop trigger if exists start_portal_expiry_on_delivery on public.deliverable_files;
create trigger start_portal_expiry_on_delivery after insert or update of published_at
on public.deliverable_files for each row execute function public.start_portal_expiry_on_delivery();
drop trigger if exists start_portal_expiry_on_link_release on public.bookings;
create trigger start_portal_expiry_on_link_release after update of edited_photo_delivered_at, edited_photo_link
on public.bookings for each row execute function public.start_portal_expiry_on_delivery();

-- Keep the existing email API and its audit timestamp, but do not start or reset expiry.
create or replace function public.record_portal_ready_email(
  p_workspace uuid, p_public_id uuid, p_sent_at timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare portal public.client_portals%rowtype;
begin
  select cp.* into portal from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace for update of cp;
  if not found or portal.status <> 'active' then raise exception 'Portal is unavailable'; end if;
  if portal.access_email_sent_at is null then
    update public.client_portals set access_email_sent_at = least(coalesce(p_sent_at, clock_timestamp()), clock_timestamp()),
      updated_at = clock_timestamp() where id = portal.id returning * into portal;
  end if;
  return jsonb_build_object('portalReadyEmailSentAt', portal.access_email_sent_at,
    'deliverablesUploadedAt', portal.deliverables_uploaded_at, 'expiresAt', portal.expires_at, 'days', portal.download_expiry_days);
end $$;
revoke all on function public.record_portal_ready_email(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_portal_ready_email(uuid, uuid, timestamptz) to service_role;

commit;
