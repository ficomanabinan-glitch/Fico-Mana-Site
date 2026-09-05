-- Final production hardening after the editor workflow rollout.
-- Trigger functions remain available to Postgres triggers and the server service role,
-- but cannot be invoked directly through the public REST RPC surface.

revoke all on function public.ensure_fico_mana_booking_client() from public, anon, authenticated;
revoke all on function public.set_fico_mana_booking_defaults() from public, anon, authenticated;
revoke all on function public.reject_duplicate_transaction_reference() from public, anon, authenticated;
revoke all on function public.require_secure_pending_receipt() from public, anon, authenticated;
revoke all on function public.sync_confirmed_booking_payment_history() from public, anon, authenticated;

grant execute on function public.ensure_fico_mana_booking_client() to service_role;
grant execute on function public.set_fico_mana_booking_defaults() to service_role;
grant execute on function public.reject_duplicate_transaction_reference() to service_role;
grant execute on function public.require_secure_pending_receipt() to service_role;
grant execute on function public.sync_confirmed_booking_payment_history() to service_role;

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists bookings_client_idx on public.bookings(client_id);
create index if not exists client_portals_workspace_idx on public.client_portals(workspace_id);
create index if not exists booking_provisioning_workspace_idx on public.booking_provisioning(workspace_id);
create index if not exists booking_provisioning_portal_idx on public.booking_provisioning(client_portal_id);
create index if not exists provisioning_audit_workspace_idx on public.provisioning_audit(workspace_id);
create index if not exists drive_folders_booking_idx on public.drive_folders(booking_id);
create index if not exists drive_folders_batch_idx on public.drive_folders(batch_id);
create index if not exists editing_jobs_workspace_idx on public.editing_jobs(workspace_id);
create index if not exists editing_jobs_client_idx on public.editing_jobs(client_id);
create index if not exists gallery_files_client_idx on public.gallery_files(client_id);
create index if not exists photo_selections_workspace_idx on public.photo_selections(workspace_id);
create index if not exists photo_selection_items_gallery_idx on public.photo_selection_items(gallery_file_id);
create index if not exists deliverable_files_editing_job_idx on public.deliverable_files(editing_job_id);
create index if not exists batch_upload_jobs_workspace_idx on public.batch_upload_jobs(workspace_id);
create index if not exists batch_upload_items_editing_job_idx on public.batch_upload_items(editing_job_id);
create index if not exists batch_upload_items_booking_idx on public.batch_upload_items(booking_id);
create index if not exists workflow_audit_batch_idx on public.workflow_audit_logs(batch_id);
