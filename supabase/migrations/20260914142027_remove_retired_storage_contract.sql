-- Phase 2: retire the legacy object-provider contract only after every durable
-- object and relationship has a verified R2 replacement. This migration is
-- intentionally fail-closed: a single unmigrated record aborts the transaction.
begin;

lock table public.gallery_files,
  public.deliverable_files,
  public.batch_upload_files,
  public.print_allocations,
  public.photo_selection_items,
  public.booking_provisioning,
  public.editing_batches,
  public.storage_multipart_uploads
in share row exclusive mode;

do $preflight$
declare
  problem_count bigint;
begin
  select count(*) into problem_count
  from public.storage_multipart_uploads
  where status = 'uploading' and expires_at > clock_timestamp();
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s multipart upload(s) are still active.', problem_count),
      hint = 'Complete or abort active uploads, then retry the migration.';
  end if;

  select count(*) into problem_count
  from public.gallery_files
  where storage_provider <> 'r2'
     or storage_key is null
     or storage_status not in ('available', 'deleted');
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s gallery file(s) are not verified in R2.', problem_count),
      hint = 'Copy every original, preview, and thumbnail to R2 and mark its metadata available before cleanup.';
  end if;

  select count(*) into problem_count
  from public.deliverable_files
  where storage_provider <> 'r2'
     or storage_key is null
     or storage_status not in ('available', 'deleted');
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s deliverable file(s) are not verified in R2.', problem_count),
      hint = 'Copy and checksum every enhanced deliverable in R2 before cleanup.';
  end if;

  select count(*) into problem_count
  from public.batch_upload_files
  where (drive_file_id is not null or status in ('UPLOADED', 'SKIPPED_DUPLICATE'))
    and (storage_provider <> 'r2' or storage_key is null);
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s completed editor upload file(s) lack an R2 key.', problem_count),
      hint = 'Migrate completed upload records or safely reset failed/incomplete upload attempts.';
  end if;

  select count(*) into problem_count
  from public.photo_selection_items item
  left join public.gallery_files gallery on gallery.id = item.gallery_file_id
  where gallery.id is null
     or gallery.storage_provider <> 'r2'
     or gallery.storage_key is null
     or gallery.storage_status <> 'available';
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s selected photo relationship(s) do not resolve to an available R2 original.', problem_count),
      hint = 'Repair the relational gallery_file_id mapping before removing legacy selection identifiers.';
  end if;

  select count(*) into problem_count
  from public.print_allocations allocation
  left join public.gallery_files gallery on gallery.id = allocation.gallery_file_id
  where gallery.id is null
     or gallery.storage_provider <> 'r2'
     or gallery.storage_key is null
     or gallery.storage_status <> 'available'
     or (
       allocation.storage_status = 'available'
       and (
         allocation.storage_provider <> 'r2'
         or allocation.print_storage_key is null
         or allocation.enhanced_storage_key is null
       )
     );
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s print allocation(s) have an incomplete R2 lineage.', problem_count),
      hint = 'Verify the selected original, enhanced source, and generated print key before cleanup.';
  end if;

  select count(*) into problem_count
  from public.booking_provisioning
  where (drive_root_folder_id is not null
      or drive_month_folder_id is not null
      or drive_day_folder_id is not null
      or drive_client_folder_id is not null
      or drive_client_folder_url is not null)
    and (storage_provider <> 'r2' or storage_prefix is null or storage_status <> 'ready');
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s booking namespace(s) have not been provisioned in R2.', problem_count),
      hint = 'Prepare each booking storage namespace and confirm it is ready before cleanup.';
  end if;

  select count(*) into problem_count
  from public.editing_batches
  where (drive_day_folder_id is not null or drive_day_folder_url is not null)
    and storage_prefix is null;
  if problem_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = format('R2 cutover blocked: %s editing batch(es) lack an R2 namespace.', problem_count),
      hint = 'Prepare the batch storage namespace before cleanup.';
  end if;
end
$preflight$;

-- Recreate the three surviving workflows before their legacy dependencies are
-- removed. The service role remains the only executable database principal.
create or replace function public.finish_onsite_photo_reset(
  p_workspace uuid, p_booking varchar, p_reset uuid
) returns void
language plpgsql security invoker set search_path = '' as $function$
declare
  r public.onsite_photo_resets;
  s public.photo_selections;
begin
  perform 1 from public.editing_jobs
  where workspace_id = p_workspace and booking_id = p_booking for update;
  select * into s from public.photo_selections
  where workspace_id = p_workspace and booking_id = p_booking for update;
  select * into r from public.onsite_photo_resets
  where id = p_reset and workspace_id = p_workspace and booking_id = p_booking for update;
  if not found then raise exception 'Reset not found.'; end if;
  if r.state = 'COMPLETED' then return; end if;
  if s.raw_reset_id is distinct from p_reset then raise exception 'Reset changed.'; end if;
  if exists (
    select 1 from jsonb_array_elements(r.targets) target
    where not (target->>'id' = any(r.completed_ids))
  ) then
    raise exception 'Some photos have not been cleared. Retry the reset.';
  end if;
  delete from public.print_allocations where selection_id = s.id;
  delete from public.photo_selection_items where selection_id = s.id;
  delete from public.client_addon_orders where selection_id = s.id;
  delete from public.gallery_files where workspace_id = p_workspace and booking_id = p_booking;
  update public.photo_selections
  set status = 'OPEN', client_status = 'Not Started', submitted_at = null,
      no_revision_acknowledged = false, no_revision_acknowledged_at = null,
      total_addon_amount = 0, version = version + 1,
      reopened_at = clock_timestamp(), raw_reset_id = null, updated_at = now()
  where id = s.id;
  update public.editing_jobs
  set selected_count = 0, expected_output_count = s.required_count,
      last_error = null, updated_at = now()
  where workspace_id = p_workspace and booking_id = p_booking;
  update public.bookings
  set raw_photo_status = null, raw_photo_submitted_at = null, raw_photo_approved_at = null
  where workspace_id = p_workspace and id = p_booking;
  update public.onsite_photo_resets
  set state = 'COMPLETED', completed_at = now() where id = p_reset;
  insert into public.workflow_audit_logs(
    workspace_id, actor_type, actor_id, action, booking_id, metadata
  ) values (
    p_workspace, 'staff', r.actor_id::text, 'ONSITE_PHOTOS_RESET_COMPLETED',
    p_booking, jsonb_build_object('resetId', p_reset)
  );
end
$function$;

revoke all on function public.finish_onsite_photo_reset(uuid, varchar, uuid)
  from public, anon, authenticated;
grant execute on function public.finish_onsite_photo_reset(uuid, varchar, uuid)
  to service_role;

create or replace function public.review_portal_selection(
  p_workspace uuid, p_booking varchar, p_actor uuid, p_action text,
  p_submitted_at timestamptz, p_notes text default ''
) returns jsonb
language plpgsql security invoker set search_path = '' as $function$
declare
  j public.editing_jobs;
  s public.photo_selections;
  b public.bookings;
  portal public.client_portals;
  days integer;
begin
  if p_action not in ('Approve', 'Reject', 'Reopen') or p_action is null or p_submitted_at is null then
    raise exception 'Invalid review request';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace and user_id = p_actor and role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'Reviewer is not authorized';
  end if;
  if p_action = 'Reject' and (length(trim(coalesce(p_notes, ''))) = 0 or length(p_notes) > 2000) then
    raise exception 'A rejection reason is required';
  end if;

  select * into j from public.editing_jobs
  where workspace_id = p_workspace and booking_id = p_booking for update;
  if not found then raise exception 'Editing job not found'; end if;
  select * into s from public.photo_selections
  where workspace_id = p_workspace and booking_id = p_booking for update;
  if not found then raise exception 'Photo selection not found'; end if;
  select * into b from public.bookings
  where workspace_id = p_workspace and id = p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.raw_photo_submitted_at is distinct from p_submitted_at then
    raise exception 'Selection changed. Sync the queue before reviewing';
  end if;

  if (p_action = 'Approve' and b.raw_photo_status = 'Approved' and s.status = 'SUBMITTED')
     or (p_action = 'Reject' and b.raw_photo_status = 'Rejected' and s.status = 'OPEN')
     or (p_action = 'Reopen' and b.raw_photo_status = 'Reopened' and s.status = 'OPEN') then
    return jsonb_build_object('changed', false, 'selectionId', s.id, 'version', s.version);
  end if;
  if s.raw_reset_id is not null then raise exception 'Photos are being updated. Sync the queue'; end if;
  if p_action in ('Approve', 'Reject') then
    if b.raw_photo_status is distinct from 'Pending Review' or s.status is distinct from 'SUBMITTED' then
      raise exception 'Selection is not pending review. Sync the queue';
    end if;
  elsif b.raw_photo_status is distinct from 'Approved' or s.status is distinct from 'SUBMITTED' then
    raise exception 'Selection is not approved for reopening. Sync the queue';
  end if;
  if j.status not in ('WAITING_FOR_SELECTION', 'READY_FOR_EDITING') or j.downloaded_at is not null
     or j.editing_started_at is not null or j.delivered_at is not null
     or j.download_lock_expires_at > now()
     or exists (select 1 from public.deliverable_files f where f.workspace_id = p_workspace and f.booking_id = p_booking)
     or exists (select 1 from public.batch_upload_items i where i.editing_job_id = j.id and i.booking_id = p_booking) then
    raise exception 'Editing has already started. Sync the queue';
  end if;
  if p_action = 'Reopen' and j.status is distinct from 'READY_FOR_EDITING' then
    raise exception 'Selection is not approved for reopening. Sync the queue';
  end if;

  update public.bookings
  set raw_photo_status = case
        when p_action = 'Approve' then 'Approved'
        when p_action = 'Reject' then 'Rejected'
        else 'Reopened'
      end,
      raw_photo_notes = case when p_action = 'Reopen' then null else p_notes end,
      raw_photo_approved_at = case when p_action = 'Approve' then now() else null end
  where id = p_booking and workspace_id = p_workspace;

  update public.editing_jobs
  set status = case when p_action = 'Approve' then 'READY_FOR_EDITING' else 'WAITING_FOR_SELECTION' end,
      last_error = null, updated_at = now()
  where id = j.id;

  if p_action in ('Reject', 'Reopen') then
    update public.photo_selections
    set status = 'OPEN', client_status = 'Selection In Progress',
        no_revision_acknowledged = false, no_revision_acknowledged_at = null,
        reopened_at = clock_timestamp(), version = coalesce(version, 1) + 1,
        updated_at = now()
    where id = s.id returning * into s;
  end if;

  if p_action = 'Reopen' then
    select cp.* into portal from public.client_portals cp
    where cp.workspace_id = p_workspace and cp.booking_id = p_booking for update of cp;
    if not found then raise exception 'Client Portal not found'; end if;
    if portal.first_download_at is not null then
      raise exception 'Portal download access has already started. Sync the queue';
    end if;
    days := coalesce(
      portal.download_expiry_days,
      (select settings.portal_expiry_days from public.storage_settings settings
       where settings.workspace_id = p_workspace and settings.id = 1),
      30
    );
    if days < 1 or days > 3650 then raise exception 'Portal expiry setting is invalid'; end if;
    update public.client_portals
    set status = 'active', expires_at = null, download_expiry_days = days,
        updated_at = clock_timestamp()
    where id = portal.id;
  end if;

  insert into public.workflow_audit_logs(
    workspace_id, actor_type, actor_id, action, booking_id, metadata
  ) values (
    p_workspace, 'staff', p_actor::text,
    case
      when p_action = 'Approve' then 'SELECTION_APPROVED'
      when p_action = 'Reject' then 'SELECTION_REJECTED'
      else 'SELECTION_REOPENED'
    end,
    p_booking,
    jsonb_build_object(
      'selectionId', s.id, 'version', s.version, 'submittedAt', p_submitted_at,
      'notes', p_notes, 'portalId', case when p_action = 'Reopen' then portal.id else null end
    )
  );
  return jsonb_build_object('changed', true, 'selectionId', s.id, 'version', s.version);
end
$function$;

revoke all on function public.review_portal_selection(uuid, varchar, uuid, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.review_portal_selection(uuid, varchar, uuid, text, timestamptz, text)
  to service_role;

create or replace function public.start_portal_expiry_on_delivery()
returns trigger
language plpgsql security definer set search_path = '' as $function$
declare
  portal public.client_portals%rowtype;
  days integer;
  released_at timestamptz;
begin
  if new.published_at is null then return new; end if;
  released_at := least(new.published_at, clock_timestamp());
  select cp.* into portal
  from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  where cp.workspace_id = new.workspace_id and cp.booking_id = new.booking_id
  for update of cp;
  if not found or portal.deliverables_uploaded_at is not null then return new; end if;
  select portal_expiry_days into days from public.storage_settings
  where workspace_id = new.workspace_id and id = 1;
  days := coalesce(days, 30);
  if days < 1 or days > 3650 then raise exception 'Portal expiry setting is invalid'; end if;
  update public.client_portals
  set deliverables_uploaded_at = released_at,
      download_expiry_days = days,
      expires_at = coalesce(portal.expires_at, released_at + days * interval '24 hours'),
      updated_at = clock_timestamp()
  where id = portal.id;
  insert into public.provisioning_audit(booking_id, action, actor_type, metadata)
  values (
    new.booking_id, 'portal_expiry_started_by_delivery', 'system',
    jsonb_build_object(
      'portalId', portal.id, 'deliverablesUploadedAt', released_at, 'days', days,
      'expiresAt', coalesce(portal.expires_at, released_at + days * interval '24 hours')
    )
  );
  return new;
end
$function$;

revoke all on function public.start_portal_expiry_on_delivery()
  from public, anon, authenticated;
grant execute on function public.start_portal_expiry_on_delivery() to service_role;

drop trigger if exists start_portal_expiry_on_delivery on public.deliverable_files;
create trigger start_portal_expiry_on_delivery
after insert or update of published_at on public.deliverable_files
for each row execute function public.start_portal_expiry_on_delivery();
drop trigger if exists start_portal_expiry_on_link_release on public.bookings;

-- The former provider reconciliation RPC has no runtime caller after the R2
-- cutover. Upload completion now writes authoritative object metadata directly.
drop function if exists public.sync_onsite_photo_index(uuid, varchar, uuid, integer, uuid[], jsonb);

alter table public.gallery_files
  alter column storage_provider set default 'r2',
  drop constraint if exists gallery_files_storage_provider_check;
alter table public.gallery_files add constraint gallery_files_storage_provider_check
  check (storage_provider = 'r2');

alter table public.deliverable_files
  alter column storage_provider set default 'r2',
  drop constraint if exists deliverable_files_storage_provider_check;
alter table public.deliverable_files add constraint deliverable_files_storage_provider_check
  check (storage_provider = 'r2');

alter table public.batch_upload_files
  alter column storage_provider set default 'r2',
  drop constraint if exists batch_upload_files_storage_provider_check;
alter table public.batch_upload_files add constraint batch_upload_files_storage_provider_check
  check (storage_provider = 'r2');

alter table public.print_allocations
  alter column storage_provider set default 'r2',
  drop constraint if exists print_allocations_storage_provider_check;
alter table public.print_allocations add constraint print_allocations_storage_provider_check
  check (storage_provider = 'r2');

alter table public.booking_provisioning
  alter column storage_provider set default 'r2',
  drop constraint if exists booking_provisioning_storage_provider_check;
alter table public.booking_provisioning add constraint booking_provisioning_storage_provider_check
  check (storage_provider = 'r2');

-- These are metadata-only drops. No object is deleted by this migration.
alter table public.bookings
  drop column if exists drive_link,
  drop column if exists raw_photo_link,
  drop column if exists edited_photo_link;
alter table public.gallery_files drop column if exists drive_file_id;
alter table public.deliverable_files drop column if exists drive_file_id;
alter table public.batch_upload_files drop column if exists drive_file_id;
alter table public.photo_selection_items drop column if exists selected_drive_file_id;
alter table public.print_allocations drop column if exists drive_file_id;
alter table public.booking_provisioning
  drop column if exists drive_root_folder_id,
  drop column if exists drive_month_folder_id,
  drop column if exists drive_day_folder_id,
  drop column if exists drive_client_folder_id,
  drop column if exists drive_client_folder_url;
alter table public.editing_batches
  drop column if exists drive_day_folder_id,
  drop column if exists drive_day_folder_url;

drop table if exists public.drive_folders;
drop table if exists public.google_drive_settings;

revoke all on public.storage_settings, public.storage_multipart_uploads
  from public, anon, authenticated;
grant all on public.storage_settings, public.storage_multipart_uploads
  to service_role;

notify pgrst, 'reload schema';
commit;
