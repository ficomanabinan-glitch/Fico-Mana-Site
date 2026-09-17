-- Prevent case-only and Unicode-equivalent duplicate filenames without
-- rewriting or deleting historical studio records. Advisory locks make the
-- check safe when two browser uploads for the same client finish together.
create or replace function public.prevent_duplicate_gallery_filename()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.storage_status = 'available' then
    perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text || ':' || new.booking_id || ':gallery:' || lower(normalize(new.file_name, NFC)), 0));
    if exists (
      select 1 from public.gallery_files existing
      where existing.workspace_id = new.workspace_id
        and existing.booking_id = new.booking_id
        and existing.storage_status = 'available'
        and lower(normalize(existing.file_name, NFC)) = lower(normalize(new.file_name, NFC))
        and existing.id <> new.id
    ) then
      raise exception using errcode = '23505', message = 'A file with this name already exists in this client folder.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_duplicate_deliverable_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.storage_status = 'available' then
    perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text || ':' || new.booking_id || ':delivery:' || lower(normalize(new.relative_path, NFC)), 0));
    if exists (
      select 1 from public.deliverable_files existing
      where existing.workspace_id = new.workspace_id
        and existing.booking_id = new.booking_id
        and existing.storage_status = 'available'
        and lower(normalize(existing.relative_path, NFC)) = lower(normalize(new.relative_path, NFC))
        and existing.id <> new.id
    ) then
      raise exception using errcode = '23505', message = 'A file with this name already exists in this client folder.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gallery_files_prevent_duplicate_filename on public.gallery_files;
create trigger gallery_files_prevent_duplicate_filename
before insert or update of file_name, storage_status on public.gallery_files
for each row execute function public.prevent_duplicate_gallery_filename();

drop trigger if exists deliverable_files_prevent_duplicate_path on public.deliverable_files;
create trigger deliverable_files_prevent_duplicate_path
before insert or update of relative_path, storage_status on public.deliverable_files
for each row execute function public.prevent_duplicate_deliverable_path();

revoke all on function public.prevent_duplicate_gallery_filename() from public, anon, authenticated;
revoke all on function public.prevent_duplicate_deliverable_path() from public, anon, authenticated;
grant execute on function public.prevent_duplicate_gallery_filename() to service_role;
grant execute on function public.prevent_duplicate_deliverable_path() to service_role;

notify pgrst, 'reload schema';
