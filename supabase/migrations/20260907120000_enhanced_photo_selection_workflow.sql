-- Enhanced client photo selection, print allocation, and add-on snapshots.
-- This migration extends the existing photo_selections workflow. It does not
-- delete gallery files, selected Drive files, or historical booking data.

begin;

alter table public.photo_selections
  add column if not exists included_limit integer not null default 5,
  add column if not exists client_status text not null default 'Not Started',
  add column if not exists no_revision_acknowledged boolean not null default false,
  add column if not exists no_revision_acknowledged_at timestamptz,
  add column if not exists total_addon_amount numeric(12,2) not null default 0;

alter table public.photo_selections drop constraint if exists photo_selections_included_limit_check;
alter table public.photo_selections
  add constraint photo_selections_included_limit_check check (included_limit between 0 and 5);
alter table public.photo_selections drop constraint if exists photo_selections_client_status_check;
alter table public.photo_selections
  add constraint photo_selections_client_status_check check (
    client_status in ('Not Started','Selection In Progress','Submitted','Editing',
      'Ready for Printing','Ready for Release','Released')
  );

update public.photo_selections
set included_limit = least(5, greatest(0, coalesce(required_count, 5)));

create or replace function public.set_photo_selection_included_limit()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  new.included_limit := least(5, greatest(0, coalesce(new.required_count, 5)));
  return new;
end;
$$;

drop trigger if exists photo_selections_set_included_limit on public.photo_selections;
create trigger photo_selections_set_included_limit
before insert or update of required_count on public.photo_selections
for each row execute function public.set_photo_selection_included_limit();

alter table public.photo_selection_items
  add column if not exists enhancement_preference text not null default 'standard',
  add column if not exists is_extra_edit boolean not null default false;

alter table public.photo_selection_items drop constraint if exists photo_selection_items_preference_check;
alter table public.photo_selection_items
  add constraint photo_selection_items_preference_check
  check (enhancement_preference in ('standard','less','raw'));

create table if not exists public.addon_catalog (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  price_amount numeric(12,2) not null check (price_amount >= 0 and price_amount <= 10000000),
  pricing_type text not null default 'fixed' check (pricing_type in ('fixed','per_photo','per_piece')),
  display_order integer not null default 100 check (display_order between 0 and 9999),
  max_quantity integer not null default 1 check (max_quantity between 1 and 500),
  status text not null default 'active' check (status in ('active','disabled','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.client_addon_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  selection_id uuid not null references public.photo_selections(id) on delete cascade,
  addon_catalog_id uuid references public.addon_catalog(id) on delete set null,
  name_snapshot text not null,
  description_snapshot text not null default '',
  pricing_type_snapshot text not null check (pricing_type_snapshot in ('fixed','per_photo','per_piece')),
  unit_price_snapshot numeric(12,2) not null check (unit_price_snapshot >= 0),
  quantity integer not null default 1 check (quantity between 1 and 500),
  photo_count integer not null default 0 check (photo_count between 0 and 500),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.print_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_id varchar not null references public.bookings(id) on delete cascade,
  selection_id uuid not null references public.photo_selections(id) on delete cascade,
  gallery_file_id uuid not null references public.gallery_files(id) on delete restrict,
  category text not null check (category in ('TOGA_PICTURE_4R','ALAMPAY_BARONG_4R','FRAME_8R','WALLET_SIZE')),
  quantity integer not null default 1 check (quantity between 1 and 4),
  label_snapshot text not null,
  drive_file_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists print_allocations_selection_category_idx
  on public.print_allocations(selection_id, category);
create index if not exists print_allocations_booking_idx
  on public.print_allocations(booking_id, created_at desc);
create index if not exists client_addon_orders_booking_idx
  on public.client_addon_orders(booking_id, created_at desc);
create index if not exists addon_catalog_workspace_display_idx
  on public.addon_catalog(workspace_id, status, display_order, name);

create or replace function public.set_addon_catalog_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists addon_catalog_set_updated_at on public.addon_catalog;
create trigger addon_catalog_set_updated_at
before update on public.addon_catalog
for each row execute function public.set_addon_catalog_updated_at();

do $$
declare
  workspace uuid;
begin
  select id into workspace from public.workspaces where slug = 'fico-mana' limit 1;
  if workspace is not null then
    insert into public.addon_catalog
      (workspace_id, name, description, price_amount, pricing_type, display_order, max_quantity, status)
    values
      (workspace, '11x14 Frame', '11x14 printed frame', 1500, 'fixed', 10, 1, 'active'),
      (workspace, '8R Frame', 'Standard size included in package', 1000, 'fixed', 20, 1, 'active'),
      (workspace, '4 pcs Wallet Size', 'Four wallet-size prints', 100, 'fixed', 30, 1, 'active'),
      (workspace, '2 pcs 4R Size', 'Two 4R-size prints', 100, 'fixed', 40, 1, 'active'),
      (workspace, 'A4 Size Printed', 'A4-size print', 350, 'fixed', 50, 1, 'active'),
      (workspace, 'Extra Edit', 'Additional enhanced photo beyond the included allocation', 400, 'per_photo', 60, 200, 'active')
    on conflict (workspace_id, name) do update set
      description = excluded.description,
      price_amount = excluded.price_amount,
      pricing_type = excluded.pricing_type,
      max_quantity = excluded.max_quantity,
      status = case when addon_catalog.status = 'archived' then addon_catalog.status else excluded.status end,
      updated_at = now();
  end if;
end;
$$;

alter table public.addon_catalog enable row level security;
alter table public.client_addon_orders enable row level security;
alter table public.print_allocations enable row level security;
revoke all on public.addon_catalog, public.client_addon_orders, public.print_allocations from anon, authenticated;
grant all on public.addon_catalog, public.client_addon_orders, public.print_allocations to service_role;
revoke all on function public.set_photo_selection_included_limit() from public, anon, authenticated;
grant execute on function public.set_photo_selection_included_limit() to service_role;

commit;
