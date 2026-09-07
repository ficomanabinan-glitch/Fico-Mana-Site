-- Additive, service-only reset workflow. Installing this migration deletes no photos or records.
begin;
alter table public.photo_selections add column if not exists raw_reset_id uuid,
  add column if not exists raw_upload_generation integer not null default 0;
alter table public.gallery_files add column if not exists upload_generation integer not null default 0;

create table if not exists public.onsite_photo_resets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  actor_id uuid not null,
  state text not null default 'RUNNING' check (state in ('RUNNING','COMPLETED')),
  targets jsonb not null check (jsonb_typeof(targets) = 'array' and jsonb_array_length(targets) <= 5000),
  completed_ids text[] not null default '{}',
  created_at timestamptz not null default now(), completed_at timestamptz
);
create unique index if not exists onsite_photo_resets_running_idx
  on public.onsite_photo_resets(workspace_id, booking_id) where state = 'RUNNING';
alter table public.onsite_photo_resets enable row level security;
revoke all on public.onsite_photo_resets from public, anon, authenticated;
grant all on public.onsite_photo_resets to service_role;

-- Serialize gallery writes with resets and reject uploads/syncs started before a reset.
create or replace function public.guard_gallery_upload_generation() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare s public.photo_selections;
begin
  select * into s from public.photo_selections where booking_id = new.booking_id and workspace_id = new.workspace_id for update;
  if not found or s.raw_reset_id is not null or new.upload_generation <> s.raw_upload_generation then
    raise exception 'Photo uploads changed. Refresh the client and upload again.';
  end if;
  return new;
end $$;
drop trigger if exists gallery_upload_generation_guard on public.gallery_files;
create trigger gallery_upload_generation_guard before insert or update on public.gallery_files
  for each row execute function public.guard_gallery_upload_generation();

create or replace function public.begin_onsite_photo_reset(p_workspace uuid, p_booking varchar, p_actor uuid, p_generation integer, p_gallery_ids uuid[], p_targets jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare s public.photo_selections; j public.editing_jobs; reset_id uuid; current_ids uuid[];
begin
  select * into j from public.editing_jobs where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Booking not found.'; end if;
  select * into s from public.photo_selections where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Selection not found.'; end if;
  if s.raw_reset_id is not null then return s.raw_reset_id; end if;
  if s.status not in ('OPEN','COPY_FAILED') or j.status <> 'WAITING_FOR_SELECTION' or j.downloaded_at is not null
    or j.editing_started_at is not null or j.delivered_at is not null
    or j.download_lock_expires_at > now()
    or exists(select 1 from public.deliverable_files where booking_id=p_booking)
    or exists(select 1 from public.batch_upload_items where booking_id=p_booking) then
    raise exception 'Editing has already started or the selection is locked. Ask an administrator to review this client first.';
  end if;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into current_ids from public.gallery_files where workspace_id=p_workspace and booking_id=p_booking;
  if s.raw_upload_generation <> p_generation or current_ids <> array(select unnest(p_gallery_ids) order by 1) then
    raise exception 'Uploads changed during review. Review this client again.';
  end if;
  insert into public.onsite_photo_resets(workspace_id,booking_id,actor_id,targets) values(p_workspace,p_booking,p_actor,p_targets) returning id into reset_id;
  update public.photo_selections set raw_reset_id=reset_id, raw_upload_generation=raw_upload_generation+1, updated_at=now() where id=s.id;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
    values(p_workspace,'staff',p_actor::text,'ONSITE_PHOTOS_RESET_STARTED',p_booking,jsonb_build_object('resetId',reset_id,'galleryCount',cardinality(current_ids),'targets',jsonb_array_length(p_targets)));
  return reset_id;
end $$;

create or replace function public.finish_onsite_photo_reset(p_workspace uuid, p_booking varchar, p_reset uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare r public.onsite_photo_resets; s public.photo_selections;
begin
  perform 1 from public.editing_jobs where workspace_id=p_workspace and booking_id=p_booking for update;
  select * into s from public.photo_selections where workspace_id=p_workspace and booking_id=p_booking for update;
  select * into r from public.onsite_photo_resets where id=p_reset and workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Reset not found.'; end if;
  if r.state='COMPLETED' then return; end if;
  if s.raw_reset_id is distinct from p_reset then raise exception 'Reset changed.'; end if;
  if exists(select 1 from jsonb_array_elements(r.targets) t where not (t->>'id'=any(r.completed_ids))) then raise exception 'Some photos have not been cleared. Retry the reset.'; end if;
  delete from public.print_allocations where selection_id=s.id;
  delete from public.photo_selection_items where selection_id=s.id;
  delete from public.client_addon_orders where selection_id=s.id;
  delete from public.gallery_files where workspace_id=p_workspace and booking_id=p_booking;
  update public.photo_selections set status='OPEN',client_status='Not Started',submitted_at=null,
    no_revision_acknowledged=false,no_revision_acknowledged_at=null,total_addon_amount=0,
    version=version+1,reopened_at=clock_timestamp(),raw_reset_id=null,updated_at=now() where id=s.id;
  update public.editing_jobs set selected_count=0,expected_output_count=s.required_count,last_error=null,updated_at=now()
    where workspace_id=p_workspace and booking_id=p_booking;
  update public.bookings set raw_photo_status=null,raw_photo_link=null,raw_photo_submitted_at=null,raw_photo_approved_at=null
    where workspace_id=p_workspace and id=p_booking;
  update public.onsite_photo_resets set state='COMPLETED',completed_at=now() where id=p_reset;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
    values(p_workspace,'staff',r.actor_id::text,'ONSITE_PHOTOS_RESET_COMPLETED',p_booking,jsonb_build_object('resetId',p_reset));
end $$;

revoke all on function public.guard_gallery_upload_generation() from public,anon,authenticated;
revoke all on function public.begin_onsite_photo_reset(uuid,varchar,uuid,integer,uuid[],jsonb) from public,anon,authenticated;
revoke all on function public.finish_onsite_photo_reset(uuid,varchar,uuid) from public,anon,authenticated;
grant execute on function public.guard_gallery_upload_generation() to service_role;
grant execute on function public.begin_onsite_photo_reset(uuid,varchar,uuid,integer,uuid[],jsonb) to service_role;
grant execute on function public.finish_onsite_photo_reset(uuid,varchar,uuid) to service_role;

-- Merge progress atomically: simultaneous retries must not overwrite completed work.
create or replace function public.record_onsite_photo_reset_progress(p_workspace uuid,p_booking varchar,p_reset uuid,p_completed text[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare r public.onsite_photo_resets;
begin
  select * into r from public.onsite_photo_resets where id=p_reset and workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Reset not found.'; end if;
  if exists(select 1 from unnest(p_completed) id where not exists(select 1 from jsonb_array_elements(r.targets) t where t->>'id'=id)) then raise exception 'Invalid reset target.'; end if;
  update public.onsite_photo_resets set completed_ids=array(select distinct unnest(r.completed_ids || p_completed)) where id=r.id returning * into r;
  return cardinality(r.completed_ids);
end $$;

-- Called only after the server has successfully listed the complete verified RAW folder.
-- The snapshot check prevents a concurrent upload from being mistaken for a removed file.
create or replace function public.sync_onsite_photo_index(p_workspace uuid,p_booking varchar,p_actor uuid,p_generation integer,p_gallery_ids uuid[],p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.photo_selections; j public.editing_jobs; client uuid; current_ids uuid[]; stale_ids uuid[]; removed integer:=0; warning text:=null;
begin
  select * into j from public.editing_jobs where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Booking not found.'; end if;
  select * into s from public.photo_selections where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found or s.raw_reset_id is not null or s.raw_upload_generation is distinct from p_generation then raise exception 'Photos changed. Retry after uploads or deletion finish.'; end if;
  select client_id into client from public.bookings where workspace_id=p_workspace and id=p_booking;
  if client is null then raise exception 'Client not found.'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>5000 then raise exception 'Invalid photo list.'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where coalesce(r->>'drive_file_id','')='' or coalesce(r->>'file_name','')='')
    or (select count(*) from jsonb_array_elements(p_rows))<>(select count(distinct r->>'drive_file_id') from jsonb_array_elements(p_rows) r) then raise exception 'Invalid or duplicate photo.'; end if;
  if exists(select 1 from public.gallery_files g join jsonb_array_elements(p_rows) r on r->>'drive_file_id'=g.drive_file_id where g.workspace_id<>p_workspace or g.booking_id<>p_booking) then raise exception 'Photo belongs to another client.'; end if;
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into current_ids from public.gallery_files where workspace_id=p_workspace and booking_id=p_booking;
  if current_ids <> array(select unnest(p_gallery_ids) order by 1) then raise exception 'Uploads changed. Retry Sync Drive.'; end if;
  select coalesce(array_agg(g.id),'{}'::uuid[]) into stale_ids from public.gallery_files g where g.workspace_id=p_workspace and g.booking_id=p_booking
    and not exists(select 1 from jsonb_array_elements(p_rows) r where r->>'drive_file_id'=g.drive_file_id);
  if cardinality(stale_ids)>0 then
    if s.status in ('OPEN','COPY_FAILED') and j.status='WAITING_FOR_SELECTION' and j.downloaded_at is null and j.editing_started_at is null
      and j.delivered_at is null and (j.download_lock_expires_at is null or j.download_lock_expires_at<=now())
      and not exists(select 1 from public.deliverable_files where booking_id=p_booking)
      and not exists(select 1 from public.batch_upload_items where booking_id=p_booking) then
      -- Incomplete choices must be remade against the corrected gallery, not broken originals.
      delete from public.print_allocations where selection_id=s.id;
      delete from public.photo_selection_items where selection_id=s.id;
      delete from public.client_addon_orders where selection_id=s.id;
      delete from public.gallery_files where workspace_id=p_workspace and booking_id=p_booking and id=any(stale_ids);
      get diagnostics removed=row_count;
      update public.photo_selections set status='OPEN',client_status='Not Started',submitted_at=null,no_revision_acknowledged=false,
        no_revision_acknowledged_at=null,total_addon_amount=0,version=version+1,reopened_at=clock_timestamp(),updated_at=now() where id=s.id;
      update public.editing_jobs set selected_count=0,expected_output_count=s.required_count,last_error=null,updated_at=now() where id=j.id;
    else warning:='Some originals are missing, but the submitted selection or editing work is protected. Try: ask the administrator to restore the originals or review this client.';
    end if;
  end if;
  insert into public.gallery_files(workspace_id,booking_id,client_id,drive_file_id,file_name,mime_type,file_size,checksum,thumbnail_reference,preview_reference,upload_generation)
    select p_workspace,p_booking,client,r->>'drive_file_id',r->>'file_name',coalesce(r->>'mime_type','application/octet-stream'),
      (r->>'file_size')::bigint,r->>'checksum',r->>'thumbnail_reference',r->>'preview_reference',p_generation from jsonb_array_elements(p_rows) r
    on conflict(workspace_id,drive_file_id) do update set file_name=excluded.file_name,mime_type=excluded.mime_type,file_size=excluded.file_size,
      checksum=coalesce(public.gallery_files.checksum,excluded.checksum),
      thumbnail_reference=case when public.gallery_files.thumbnail_reference like p_workspace::text||'/'||p_booking||'/%' then public.gallery_files.thumbnail_reference else coalesce(excluded.thumbnail_reference,public.gallery_files.thumbnail_reference) end,
      preview_reference=coalesce(excluded.preview_reference,public.gallery_files.preview_reference),upload_generation=excluded.upload_generation;
  -- Clear only the now-resolved missing-original warning, not unrelated upload errors.
  if warning is null then update public.editing_jobs set last_error=null where id=j.id and last_error like 'The original photo % is no longer available.%'; end if;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
    values(p_workspace,'staff',p_actor::text,'ONSITE_INDEX_RECONCILED',p_booking,jsonb_build_object('removed',removed,'indexed',jsonb_array_length(p_rows)));
  return jsonb_build_object('removed',removed,'warning',warning);
end $$;

revoke all on function public.record_onsite_photo_reset_progress(uuid,varchar,uuid,text[]) from public,anon,authenticated;
revoke all on function public.sync_onsite_photo_index(uuid,varchar,uuid,integer,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.record_onsite_photo_reset_progress(uuid,varchar,uuid,text[]) to service_role;
grant execute on function public.sync_onsite_photo_index(uuid,varchar,uuid,integer,uuid[],jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
