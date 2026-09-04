create extension if not exists pgcrypto;

alter table public.bookings
  add column if not exists confirmed_at timestamptz null;

alter table public.payments
  add column if not exists status varchar(32) not null default 'confirmed',
  add column if not exists verified_at timestamptz null,
  add column if not exists provider_event_id text null;

create unique index if not exists payments_provider_event_id_uidx
  on public.payments(provider_event_id)
  where provider_event_id is not null;

create table if not exists public.google_drive_settings (
  id smallint primary key default 1 check (id = 1),
  root_folder_id text null,
  root_folder_name text not null default 'FICOMANA SHOOTS',
  portal_expiry_days integer not null default 30 check (portal_expiry_days between 1 and 3650),
  updated_at timestamptz not null default now()
);

insert into public.google_drive_settings(id, root_folder_name)
values (1, 'FICOMANA SHOOTS')
on conflict (id) do nothing;

create table if not exists public.client_portals (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  booking_id varchar not null unique references public.bookings(id) on delete cascade,
  status varchar(24) not null default 'active' check (status in ('active','disabled','expired')),
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz null
);

create table if not exists public.booking_provisioning (
  booking_id varchar primary key references public.bookings(id) on delete cascade,
  status varchar(24) not null default 'NOT_STARTED' check (status in ('NOT_STARTED','PROVISIONING','ACTIVE','PARTIAL_FAILURE','FAILED')),
  drive_root_folder_id text null,
  drive_month_folder_id text null,
  drive_day_folder_id text null,
  drive_client_folder_id text null,
  drive_client_folder_url text null,
  client_portal_id uuid null references public.client_portals(id) on delete set null,
  provisioned_at timestamptz null,
  last_error text null,
  last_retry_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.provisioning_audit (
  id bigserial primary key,
  booking_id varchar null references public.bookings(id) on delete set null,
  action text not null,
  actor_type varchar(16) not null default 'system' check (actor_type in ('system','staff','webhook')),
  actor_id text null,
  external_resource_id text null,
  metadata jsonb not null default '{}'::jsonb,
  error text null,
  created_at timestamptz not null default now()
);

create index if not exists provisioning_audit_booking_idx on public.provisioning_audit(booking_id, created_at desc);
create index if not exists client_portals_status_idx on public.client_portals(status, expires_at);

alter table public.google_drive_settings enable row level security;
alter table public.client_portals enable row level security;
alter table public.booking_provisioning enable row level security;
alter table public.provisioning_audit enable row level security;

revoke all on public.google_drive_settings from anon, authenticated;
revoke all on public.client_portals from anon, authenticated;
revoke all on public.booking_provisioning from anon, authenticated;
revoke all on public.provisioning_audit from anon, authenticated;
revoke all on sequence public.provisioning_audit_id_seq from anon, authenticated;

grant all on public.google_drive_settings to service_role;
grant all on public.client_portals to service_role;
grant all on public.booking_provisioning to service_role;
grant all on public.provisioning_audit to service_role;
grant usage, select on sequence public.provisioning_audit_id_seq to service_role;