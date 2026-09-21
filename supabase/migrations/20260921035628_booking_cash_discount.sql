-- Keep staff-granted cash discounts separate from amounts actually collected.
begin;

alter table public.bookings
  add column if not exists discount_amount numeric(12, 2) not null default 0,
  add column if not exists discount_label text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_cash_discount_amount_valid') then
    alter table public.bookings add constraint bookings_cash_discount_amount_valid check (discount_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_cash_discount_label_valid') then
    alter table public.bookings add constraint bookings_cash_discount_label_valid check (
      (discount_amount = 0 and discount_label is null)
      or (
        discount_amount > 0
        and discount_label is not null
        and discount_label = btrim(discount_label)
        and char_length(discount_label) between 1 and 80
      )
    );
  end if;
end $$;

comment on column public.bookings.discount_amount is
  'One-time staff-entered cash studio discount; booking price stores the net amount due.';
comment on column public.bookings.discount_label is
  'Voucher code or reason recorded by staff for the cash studio discount.';

-- Row locking during UPDATE makes a one-time voucher safe against two staff
-- submissions racing on the same booking. Existing bookings without vouchers
-- keep their current write behavior.
create or replace function public.validate_booking_cash_discount()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  old_history jsonb;
  new_history jsonb;
  old_paid numeric(12,2);
  added_cash_count integer;
  cash_amount numeric(12,2);
begin
  if new.discount_amount is not distinct from old.discount_amount
     and new.discount_label is not distinct from old.discount_label then
    return new;
  end if;

  if old.discount_amount <> 0 or new.discount_amount <= 0
     or new.price <> old.price - new.discount_amount then
    raise exception 'Cash discount must be applied once against the current booking total';
  end if;

  old_history := case when jsonb_typeof(old.payment_history) = 'array' then old.payment_history else '[]'::jsonb end;
  new_history := case when jsonb_typeof(new.payment_history) = 'array' then new.payment_history else '[]'::jsonb end;
  select coalesce(sum((item->>'amount')::numeric), 0) into old_paid
  from jsonb_array_elements(old_history) as item;
  if new.discount_amount >= old.price - old_paid then
    raise exception 'Cash discount must leave an amount to collect';
  end if;

  select count(*), coalesce(sum((item->>'amount')::numeric), 0)
    into added_cash_count, cash_amount
  from jsonb_array_elements(new_history) as item
  where item->>'method' = 'Cash'
    and not exists (
      select 1 from jsonb_array_elements(old_history) as prior
      where prior->>'id' = item->>'id'
    );
  if added_cash_count <> 1 or cash_amount <= 0
     or cash_amount > old.price - old_paid - new.discount_amount then
    raise exception 'Cash discount requires one valid new cash payment';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_booking_cash_discount() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.validate_booking_cash_discount() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.validate_booking_cash_discount() from authenticated';
  end if;
end $$;

drop trigger if exists bookings_validate_cash_discount on public.bookings;
create trigger bookings_validate_cash_discount
before update of price, discount_amount, discount_label, payment_history on public.bookings
for each row execute function public.validate_booking_cash_discount();

commit;
