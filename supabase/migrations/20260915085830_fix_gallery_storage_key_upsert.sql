-- PostgREST upserts require a non-partial unique constraint that exactly
-- matches the on_conflict column list. PostgreSQL UNIQUE still permits
-- multiple NULL storage keys, preserving legacy rows awaiting migration.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.gallery_files'::regclass
      and conname = 'gallery_files_workspace_storage_key_key'
  ) then
    alter table public.gallery_files
      add constraint gallery_files_workspace_storage_key_key
      unique (workspace_id, storage_key);
  end if;
end
$$;

drop index if exists public.gallery_files_storage_key_uidx;
