-- Package Manager: make the package catalog the source of truth for the public
-- website and for open client photo-selection limits.

alter table public.packages
  add column if not exists updated_at timestamptz not null default now();

update public.packages set selection_limit = 5 where selection_limit is null;
alter table public.packages alter column selection_limit set default 5;
alter table public.packages alter column selection_limit set not null;

alter table public.packages drop constraint if exists packages_category_check;
alter table public.packages
  add constraint packages_category_check
  check (category in ('graduation','capping-pinning','self-portrait','creative'));

alter table public.packages drop constraint if exists packages_slot_type_check;
alter table public.packages
  add constraint packages_slot_type_check
  check (slot_type in ('standard','makeup'));

alter table public.packages drop constraint if exists packages_price_amount_check;
alter table public.packages
  add constraint packages_price_amount_check
  check (price_amount >= 0 and price_amount <= 10000000);

alter table public.packages drop constraint if exists packages_selection_limit_check;
alter table public.packages
  add constraint packages_selection_limit_check
  check (selection_limit between 1 and 200);

alter table public.packages drop constraint if exists packages_sort_order_check;
alter table public.packages
  add constraint packages_sort_order_check
  check (sort_order between 0 and 9999);

create index if not exists bookings_package_id_idx on public.bookings(package_id);

create or replace function public.set_package_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at
before update on public.packages
for each row execute function public.set_package_updated_at();

create or replace function public.sync_open_selection_limit_from_package()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.selection_limit is not distinct from old.selection_limit then
    return new;
  end if;

  update public.bookings b
  set selection_limit = new.selection_limit
  where b.package_id = new.id
    and not exists (
      select 1
      from public.photo_selections submitted
      where submitted.booking_id = b.id
        and submitted.status <> 'OPEN'
    );

  update public.photo_selections selection
  set required_count = new.selection_limit,
      updated_at = now()
  from public.bookings b
  where selection.booking_id = b.id
    and b.package_id = new.id
    and selection.status = 'OPEN';

  return new;
end;
$$;

drop trigger if exists packages_sync_open_selection_limit on public.packages;
create trigger packages_sync_open_selection_limit
after update of selection_limit on public.packages
for each row execute function public.sync_open_selection_limit_from_package();

create or replace function public.set_fico_mana_booking_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.workspace_id is null then
    select id into new.workspace_id from public.workspaces where slug = 'fico-mana';
  end if;

  if new.selection_limit is null
     or (tg_op = 'UPDATE' and new.package_id is distinct from old.package_id) then
    select coalesce(selection_limit, 5) into new.selection_limit
    from public.packages where id = new.package_id;
    new.selection_limit := coalesce(new.selection_limit, 5);
  end if;
  return new;
end;
$$;

-- Align the initial manager values with packages that explicitly promise a
-- selected number of enhanced photos. Packages promising all photos retain the
-- existing workflow value until the studio chooses a new value in the manager.
update public.packages
set selection_limit = case id
  when 'capping-pinning' then 2
  when 'creative-package' then 20
  when 'creative-package-makeup' then 20
  when 'fico-1' then 5
  when 'fico-3' then 10
  when 'mana-1' then 10
  when 'mana-3' then 15
  else selection_limit
end
where id in (
  'capping-pinning','creative-package','creative-package-makeup',
  'fico-1','fico-3','mana-1','mana-3'
);

-- Reconcile every open selection after the initial package values are set.
-- Clients who already started choosing can continue against the new package
-- limit; only submitted selections remain immutable.
update public.photo_selections selection
set required_count = package.selection_limit,
    updated_at = now()
from public.bookings booking
join public.packages package on package.id = booking.package_id
where selection.booking_id = booking.id
  and selection.status = 'OPEN'
  and selection.required_count is distinct from package.selection_limit;

alter table public.packages enable row level security;
drop policy if exists "packages_public_read" on public.packages;
create policy "packages_public_read"
on public.packages for select
to anon, authenticated
using (is_active = true);

revoke insert, update, delete on public.packages from anon, authenticated;
grant select on public.packages to anon, authenticated;
grant all on public.packages to service_role;
