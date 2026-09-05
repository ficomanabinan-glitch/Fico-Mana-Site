-- Fico Mana production editor workflow.
-- Extends the existing booking, provisioning, portal, and Google Drive model.
-- Existing bookings are backfilled into the default FICO MANA workspace.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspaces (slug, name)
values ('fico-mana', 'FICO MANA Studio')
on conflict (slug) do update set name = excluded.name, updated_at = now();

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'staff')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'admin'
from public.workspaces w
cross join auth.users u
where w.slug = 'fico-mana'
  and (
    u.raw_app_meta_data ->> 'role' = 'admin'
    or coalesce(u.raw_app_meta_data -> 'roles', '[]'::jsonb) ? 'admin'
  )
on conflict (workspace_id, user_id) do nothing;

alter table public.bookings
  add column if not exists workspace_id uuid references public.workspaces(id),
  add column if not exists client_id uuid,
  add column if not exists selection_limit integer check (selection_limit is null or selection_limit >= 0);

alter table public.packages
  add column if not exists selection_limit integer check (selection_limit is null or selection_limit >= 0);

update public.packages
set selection_limit = case
  when lower(id) like '%creative%' then 20
  when lower(id) like '%capping%' or lower(id) like '%pinning%' then 2
  else 5
end
where selection_limit is null;

update public.bookings b
set workspace_id = w.id
from public.workspaces w
where w.slug = 'fico-mana' and b.workspace_id is null;

update public.bookings b
set selection_limit = coalesce(p.selection_limit, 5)
from public.packages p
where p.id = b.package_id and b.selection_limit is null;

update public.bookings set selection_limit = 5 where selection_limit is null;

alter table public.bookings alter column workspace_id set not null;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_booking_id varchar unique references public.bookings(id) on delete set null,
  display_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.clients (workspace_id, legacy_booking_id, display_name, email, phone)
select b.workspace_id, b.id, b.customer_name, nullif(b.customer_email, ''), nullif(b.customer_phone, '')
from public.bookings b
where b.client_id is null
on conflict (legacy_booking_id) do update set
  workspace_id = excluded.workspace_id,
  display_name = excluded.display_name,
  email = excluded.email,
  phone = excluded.phone,
  updated_at = now();

update public.bookings b
set client_id = c.id
from public.clients c
where c.legacy_booking_id = b.id and b.client_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_client_id_fkey' and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_client_id_fkey foreign key (client_id) references public.clients(id);
  end if;
end $$;

create or replace function public.set_fico_mana_booking_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is null then
    select id into new.workspace_id from public.workspaces where slug = 'fico-mana';
  end if;
  if new.selection_limit is null then
    select coalesce(selection_limit, 5) into new.selection_limit
    from public.packages where id = new.package_id;
    new.selection_limit := coalesce(new.selection_limit, 5);
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_set_fico_mana_defaults on public.bookings;
create trigger bookings_set_fico_mana_defaults
before insert or update of package_id, workspace_id, selection_limit on public.bookings
for each row execute function public.set_fico_mana_booking_defaults();

create or replace function public.ensure_fico_mana_booking_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_client_id uuid;
begin
  if new.client_id is not null then return new; end if;
  insert into public.clients (workspace_id, legacy_booking_id, display_name, email, phone)
  values (new.workspace_id, new.id, new.customer_name, nullif(new.customer_email, ''), nullif(new.customer_phone, ''))
  on conflict (legacy_booking_id) do update set
    workspace_id = excluded.workspace_id,
    display_name = excluded.display_name,
    email = excluded.email,
    phone = excluded.phone,
    updated_at = now()
  returning id into resolved_client_id;
  update public.bookings set client_id = resolved_client_id where id = new.id;
  return new;
end;
$$;

drop trigger if exists bookings_ensure_fico_mana_client on public.bookings;
create trigger bookings_ensure_fico_mana_client
after insert on public.bookings
for each row execute function public.ensure_fico_mana_booking_client();

alter table public.client_portals add column if not exists workspace_id uuid references public.workspaces(id);
update public.client_portals p set workspace_id = b.workspace_id from public.bookings b where b.id = p.booking_id and p.workspace_id is null;
alter table public.client_portals alter column workspace_id set not null;

alter table public.booking_provisioning add column if not exists workspace_id uuid references public.workspaces(id);
update public.booking_provisioning p set workspace_id = b.workspace_id from public.bookings b where b.id = p.booking_id and p.workspace_id is null;
alter table public.booking_provisioning alter column workspace_id set not null;

alter table public.provisioning_audit add column if not exists workspace_id uuid references public.workspaces(id);
update public.provisioning_audit a set workspace_id = b.workspace_id from public.bookings b where b.id = a.booking_id and a.workspace_id is null;

alter table public.google_drive_settings add column if not exists workspace_id uuid references public.workspaces(id);
update public.google_drive_settings set workspace_id = (select id from public.workspaces where slug = 'fico-mana') where workspace_id is null;
alter table public.google_drive_settings alter column workspace_id set not null;
create unique index if not exists google_drive_settings_workspace_uidx on public.google_drive_settings(workspace_id);

create table if not exists public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar references public.bookings(id) on delete cascade,
  batch_id uuid,
  folder_type text not null check (folder_type in ('ROOT','MONTH','DAY','CLIENT','RAW','SELECTED','EDITED','DELIVERABLES')),
  drive_folder_id text not null,
  name text not null,
  parent_drive_folder_id text,
  web_view_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, drive_folder_id)
);

create table if not exists public.editing_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_id text not null,
  shoot_date date not null,
  location_key text not null default 'MAIN',
  batch_sequence integer not null default 1 check (batch_sequence > 0),
  status text not null default 'WAITING' check (status in ('WAITING','READY','IN_PROGRESS','PARTIALLY_COMPLETED','COMPLETED')),
  drive_day_folder_id text,
  drive_day_folder_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, display_id),
  unique (workspace_id, shoot_date, location_key, batch_sequence)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'drive_folders_batch_id_fkey' and conrelid = 'public.drive_folders'::regclass
  ) then
    alter table public.drive_folders
      add constraint drive_folders_batch_id_fkey foreign key (batch_id) references public.editing_batches(id) on delete set null;
  end if;
end $$;

create table if not exists public.photo_selections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null unique references public.bookings(id) on delete cascade,
  status text not null default 'OPEN' check (status in ('OPEN','SUBMITTING','SUBMITTED','COPY_FAILED')),
  required_count integer not null check (required_count >= 0),
  submitted_at timestamptz,
  reopened_at timestamptz,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  drive_file_id text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint check (file_size is null or file_size >= 0),
  checksum text,
  thumbnail_reference text,
  preview_reference text,
  created_at timestamptz not null default now(),
  unique (workspace_id, drive_file_id)
);

create table if not exists public.photo_selection_items (
  selection_id uuid not null references public.photo_selections(id) on delete cascade,
  gallery_file_id uuid not null references public.gallery_files(id) on delete restrict,
  selected_drive_file_id text,
  copied_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (selection_id, gallery_file_id)
);

create table if not exists public.editing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null references public.editing_batches(id) on delete cascade,
  booking_id varchar not null unique references public.bookings(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'WAITING_FOR_SELECTION' check (status in ('WAITING_FOR_SELECTION','READY_FOR_EDITING','DOWNLOADED','EDITING','READY_TO_UPLOAD','UPLOADING','DELIVERED','UPLOAD_FAILED')),
  selected_count integer not null default 0 check (selected_count >= 0),
  expected_output_count integer not null check (expected_output_count >= 0),
  downloaded_at timestamptz,
  editing_started_at timestamptz,
  ready_to_upload_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.deliverable_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  editing_job_id uuid not null references public.editing_jobs(id) on delete cascade,
  drive_file_id text not null,
  relative_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  checksum text not null,
  published_at timestamptz not null default now(),
  unique (workspace_id, drive_file_id),
  unique (booking_id, relative_path)
);

create table if not exists public.batch_upload_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null references public.editing_batches(id) on delete cascade,
  status text not null default 'RUNNING' check (status in ('RUNNING','PARTIALLY_COMPLETED','COMPLETED','FAILED')),
  total_clients integer not null default 0,
  completed_clients integer not null default 0,
  failed_clients integer not null default 0,
  photos_uploaded integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.batch_upload_items (
  id uuid primary key default gen_random_uuid(),
  upload_job_id uuid not null references public.batch_upload_jobs(id) on delete cascade,
  editing_job_id uuid not null references public.editing_jobs(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','UPLOADING','DELIVERED','FAILED')),
  expected_files integer not null default 0,
  uploaded_files integer not null default 0,
  attempt_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (upload_job_id, editing_job_id)
);

create table if not exists public.batch_upload_files (
  id uuid primary key default gen_random_uuid(),
  upload_item_id uuid not null references public.batch_upload_items(id) on delete cascade,
  relative_path text not null,
  file_name text not null,
  checksum text not null,
  drive_file_id text,
  status text not null default 'PENDING' check (status in ('PENDING','UPLOADING','UPLOADED','FAILED','SKIPPED_DUPLICATE')),
  attempt_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (upload_item_id, relative_path)
);

create table if not exists public.workflow_audit_logs (
  id bigint generated by default as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_type text not null check (actor_type in ('client','staff','system')),
  actor_id text,
  action text not null,
  booking_id varchar references public.bookings(id) on delete set null,
  batch_id uuid references public.editing_batches(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bookings_workspace_shoot_idx on public.bookings(workspace_id, booking_date);
create index if not exists clients_workspace_name_idx on public.clients(workspace_id, display_name);
create index if not exists editing_batches_workspace_date_idx on public.editing_batches(workspace_id, shoot_date desc);
create index if not exists editing_jobs_batch_status_idx on public.editing_jobs(batch_id, status);
create index if not exists gallery_files_booking_created_idx on public.gallery_files(booking_id, created_at, id);
create index if not exists deliverable_files_booking_idx on public.deliverable_files(booking_id, published_at desc);
create index if not exists workflow_audit_workspace_created_idx on public.workflow_audit_logs(workspace_id, created_at desc);
create index if not exists workflow_audit_booking_idx on public.workflow_audit_logs(booking_id, created_at desc);
create index if not exists batch_upload_jobs_batch_idx on public.batch_upload_jobs(batch_id, created_at desc);

insert into public.editing_batches (workspace_id, display_id, shoot_date, location_key, batch_sequence)
select distinct b.workspace_id, 'FM-BATCH-' || b.booking_date::text || '-MAIN', b.booking_date, 'MAIN', 1
from public.bookings b
where b.booking_status not in ('Cancelled','Rejected')
on conflict (workspace_id, shoot_date, location_key, batch_sequence) do nothing;

insert into public.photo_selections (workspace_id, booking_id, status, required_count, submitted_at)
select b.workspace_id,
       b.id,
       case when b.raw_photo_status = 'Approved' then 'SUBMITTED' else 'OPEN' end,
       b.selection_limit,
       case when b.raw_photo_status = 'Approved' then coalesce(b.raw_photo_approved_at, b.raw_photo_submitted_at, now()) else null end
from public.bookings b
on conflict (booking_id) do nothing;

insert into public.editing_jobs (
  workspace_id, batch_id, booking_id, client_id, status, expected_output_count, delivered_at
)
select b.workspace_id,
       eb.id,
       b.id,
       b.client_id,
       case
         when b.edited_photo_link is not null or b.edited_photo_delivered_at is not null then 'DELIVERED'
         when b.raw_photo_status = 'Approved' then 'READY_FOR_EDITING'
         else 'WAITING_FOR_SELECTION'
       end,
       b.selection_limit,
       b.edited_photo_delivered_at
from public.bookings b
join public.editing_batches eb
  on eb.workspace_id = b.workspace_id
 and eb.shoot_date = b.booking_date
 and eb.location_key = 'MAIN'
 and eb.batch_sequence = 1
where b.booking_status not in ('Cancelled','Rejected')
on conflict (booking_id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fico-mana-thumbnails',
  'fico-mana-thumbnails',
  false,
  2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces','workspace_members','clients','drive_folders','editing_batches','editing_jobs',
    'gallery_files','photo_selections','photo_selection_items','deliverable_files',
    'batch_upload_jobs','batch_upload_items','batch_upload_files','workflow_audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

revoke all on sequence public.workflow_audit_logs_id_seq from anon, authenticated;
grant usage, select on sequence public.workflow_audit_logs_id_seq to service_role;

-- Existing browser clients use API routes. Keep package reads public, but ensure
-- booking and notification rows cannot be accessed by arbitrary signed-in users.
drop policy if exists "bookings_staff_all" on public.bookings;
drop policy if exists "notifications_staff_all" on public.notifications;
drop policy if exists "packages_staff_write" on public.packages;
revoke all on public.bookings from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke insert, update, delete on public.packages from anon, authenticated;
grant select on public.packages to anon, authenticated;
grant all on public.bookings, public.notifications, public.packages to service_role;

-- Thumbnail objects are only read and written by server-side service-role code.
drop policy if exists "fico_mana_thumbnails_public" on storage.objects;
