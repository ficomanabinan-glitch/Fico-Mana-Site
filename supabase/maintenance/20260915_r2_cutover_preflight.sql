-- Read-only R2 cutover report. Run after Phase 1 and before copying objects,
-- after reconciliation, and immediately before the Phase 2 cleanup migration.
-- A production cutover is eligible only when `cutover_ready` is true.

with gate_counts as (
  select
    (select count(*) from public.storage_multipart_uploads
      where status = 'uploading' and expires_at > clock_timestamp()) as active_multipart_uploads,
    (select count(*) from public.gallery_files
      where storage_provider <> 'r2'
         or storage_key is null
         or storage_status not in ('available', 'deleted')) as gallery_files_not_verified,
    (select count(*) from public.deliverable_files
      where storage_provider <> 'r2'
         or storage_key is null
         or storage_status not in ('available', 'deleted')) as deliverable_files_not_verified,
    (select count(*) from public.batch_upload_files
      where (drive_file_id is not null or status in ('UPLOADED', 'SKIPPED_DUPLICATE'))
        and (storage_provider <> 'r2' or storage_key is null)) as completed_editor_uploads_without_r2_key,
    (select count(*)
      from public.photo_selection_items item
      left join public.gallery_files gallery on gallery.id = item.gallery_file_id
      where gallery.id is null
         or gallery.storage_provider <> 'r2'
         or gallery.storage_key is null
         or gallery.storage_status <> 'available') as invalid_selected_photo_relationships,
    (select count(*)
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
         )) as print_allocations_with_incomplete_lineage,
    (select count(*) from public.booking_provisioning
      where (drive_root_folder_id is not null
          or drive_month_folder_id is not null
          or drive_day_folder_id is not null
          or drive_client_folder_id is not null
          or drive_client_folder_url is not null)
        and (storage_provider <> 'r2' or storage_prefix is null or storage_status <> 'ready'))
      as booking_namespaces_not_ready,
    (select count(*) from public.editing_batches
      where (drive_day_folder_id is not null or drive_day_folder_url is not null)
        and storage_prefix is null) as editing_batches_without_r2_namespace
), inventory as (
  select
    (select count(*) from public.gallery_files) as gallery_file_rows,
    (select coalesce(sum(file_size), 0) from public.gallery_files
      where storage_provider = 'r2' and storage_status = 'available') as verified_gallery_bytes,
    (select count(*) from public.deliverable_files) as deliverable_file_rows,
    (select coalesce(sum(file_size), 0) from public.deliverable_files
      where storage_provider = 'r2' and storage_status = 'available') as verified_deliverable_bytes,
    (select count(*) from public.print_allocations) as print_allocation_rows,
    (select count(*) from public.photo_selection_items) as selected_photo_rows
)
select
  (
    active_multipart_uploads = 0
    and gallery_files_not_verified = 0
    and deliverable_files_not_verified = 0
    and completed_editor_uploads_without_r2_key = 0
    and invalid_selected_photo_relationships = 0
    and print_allocations_with_incomplete_lineage = 0
    and booking_namespaces_not_ready = 0
    and editing_batches_without_r2_namespace = 0
  ) as cutover_ready,
  gate_counts.*,
  inventory.*,
  clock_timestamp() as checked_at
from gate_counts
cross join inventory;
