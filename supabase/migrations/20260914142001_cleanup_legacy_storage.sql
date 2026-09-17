-- Phase 1: add the private R2 metadata contract without removing fields used by
-- the previously deployed application. Deploy the R2 application only after
-- this migration succeeds. Phase 2 removes the retired provider contract.
begin;

create table if not exists public.storage_settings (
  id smallint primary key default 1 check (id = 1),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text not null default 'r2' check (provider = 'r2'),
  bucket_name text,
  portal_expiry_days integer not null default 30 check (portal_expiry_days between 1 and 3650),
  signed_url_ttl_seconds integer not null default 900 check (signed_url_ttl_seconds between 60 and 3600),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.google_drive_settings') is not null then
    insert into public.storage_settings(id, workspace_id, portal_expiry_days, provider, updated_at)
    select id, workspace_id, portal_expiry_days, 'r2', now()
    from public.google_drive_settings
    on conflict (id) do update set
      workspace_id = excluded.workspace_id,
      portal_expiry_days = excluded.portal_expiry_days,
      provider = 'r2',
      updated_at = now();
  end if;
end $$;

insert into public.storage_settings(id, workspace_id, provider)
select 1, id, 'r2' from public.workspaces where slug = 'fico-mana'
on conflict (id) do nothing;

create unique index if not exists storage_settings_workspace_uidx
  on public.storage_settings(workspace_id) where workspace_id is not null;

alter table public.gallery_files
  add column if not exists storage_key text,
  add column if not exists storage_provider text not null default 'legacy_external',
  add column if not exists storage_status text not null default 'migration_required',
  add column if not exists updated_at timestamptz not null default now();
alter table public.gallery_files alter column drive_file_id drop not null;
alter table public.gallery_files drop constraint if exists gallery_files_storage_provider_check;
alter table public.gallery_files add constraint gallery_files_storage_provider_check
  check (storage_provider in ('r2','legacy_external'));
alter table public.gallery_files drop constraint if exists gallery_files_storage_status_check;
alter table public.gallery_files add constraint gallery_files_storage_status_check
  check (storage_status in ('uploading','available','migration_required','deleted','failed'));
create unique index if not exists gallery_files_storage_key_uidx
  on public.gallery_files(workspace_id, storage_key) where storage_key is not null;

alter table public.deliverable_files
  add column if not exists storage_key text,
  add column if not exists storage_provider text not null default 'legacy_external',
  add column if not exists storage_status text not null default 'migration_required',
  add column if not exists updated_at timestamptz not null default now();
alter table public.deliverable_files alter column drive_file_id drop not null;
alter table public.deliverable_files drop constraint if exists deliverable_files_storage_provider_check;
alter table public.deliverable_files add constraint deliverable_files_storage_provider_check
  check (storage_provider in ('r2','legacy_external'));
alter table public.deliverable_files drop constraint if exists deliverable_files_storage_status_check;
alter table public.deliverable_files add constraint deliverable_files_storage_status_check
  check (storage_status in ('uploading','available','migration_required','deleted','failed'));
create unique index if not exists deliverable_files_storage_key_uidx
  on public.deliverable_files(workspace_id, storage_key) where storage_key is not null;

alter table public.batch_upload_files
  add column if not exists file_size bigint,
  add column if not exists storage_key text,
  add column if not exists storage_provider text not null default 'legacy_external';
alter table public.batch_upload_files drop constraint if exists batch_upload_files_storage_provider_check;
alter table public.batch_upload_files add constraint batch_upload_files_storage_provider_check
  check (storage_provider in ('r2','legacy_external'));

alter table public.print_allocations
  add column if not exists print_storage_key text,
  add column if not exists enhanced_storage_key text,
  add column if not exists storage_provider text not null default 'legacy_external',
  add column if not exists storage_status text not null default 'migration_required';
alter table public.print_allocations drop constraint if exists print_allocations_storage_provider_check;
alter table public.print_allocations add constraint print_allocations_storage_provider_check
  check (storage_provider in ('r2','legacy_external'));
alter table public.print_allocations drop constraint if exists print_allocations_storage_status_check;
alter table public.print_allocations add constraint print_allocations_storage_status_check
  check (storage_status in ('available','unavailable','migration_required','deleted','failed'));

alter table public.booking_provisioning
  add column if not exists storage_provider text not null default 'legacy_external',
  add column if not exists storage_prefix text,
  add column if not exists storage_status text not null default 'migration_required';
alter table public.booking_provisioning drop constraint if exists booking_provisioning_storage_provider_check;
alter table public.booking_provisioning add constraint booking_provisioning_storage_provider_check
  check (storage_provider in ('r2','legacy_external'));
alter table public.booking_provisioning drop constraint if exists booking_provisioning_storage_status_check;
alter table public.booking_provisioning add constraint booking_provisioning_storage_status_check
  check (storage_status in ('ready','migration_required','error','archived','deleted'));

alter table public.editing_batches add column if not exists storage_prefix text;

create table if not exists public.storage_multipart_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  storage_key text not null,
  upload_id text not null,
  category text not null check (category in ('raw','enhanced','preview','thumbnail','print')),
  expected_size bigint not null check (expected_size > 0),
  expected_checksum text not null check (expected_checksum ~ '^[a-f0-9]{64}$'),
  mime_type text not null,
  original_filename text not null,
  status text not null default 'uploading' check (status in ('uploading','completed','aborted','expired')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, storage_key, upload_id)
);
create index if not exists storage_multipart_expiry_idx
  on public.storage_multipart_uploads(status, expires_at);

alter table public.storage_settings enable row level security;
alter table public.storage_multipart_uploads enable row level security;
revoke all on public.storage_settings, public.storage_multipart_uploads from public, anon, authenticated;
grant all on public.storage_settings, public.storage_multipart_uploads to service_role;

comment on table public.storage_settings is 'Non-secret private object-storage settings. Credentials remain server environment variables.';
comment on column public.gallery_files.storage_key is 'Private object key; never a public URL.';
comment on column public.deliverable_files.storage_key is 'Private object key; never a public URL.';

notify pgrst, 'reload schema';
commit;
