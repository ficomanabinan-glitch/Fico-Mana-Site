create table if not exists public.client_portal_resources (
  id uuid primary key default gen_random_uuid(),
  booking_id varchar not null references public.bookings(id) on delete cascade,
  resource_type varchar(32) not null check (resource_type in ('photos','video','invoice','agreement','meeting_document','project_update','other')),
  title text not null,
  url text null,
  content text null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_portal_resources_booking_idx
  on public.client_portal_resources(booking_id, is_visible, created_at desc);

alter table public.client_portal_resources enable row level security;
revoke all on public.client_portal_resources from anon, authenticated;
grant all on public.client_portal_resources to service_role;