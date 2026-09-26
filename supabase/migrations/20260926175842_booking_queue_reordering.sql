begin;

alter table public.bookings
  add column if not exists client_priority integer;

alter table public.bookings
  drop constraint if exists bookings_client_priority_positive;

alter table public.bookings
  add constraint bookings_client_priority_positive
  check (client_priority is null or client_priority > 0);

create or replace function public.normalize_booking_client_priorities(p_booking_date text)
returns table (booking_id text, client_priority integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(p_booking_date), '') is null then
    raise exception 'A shoot date is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking-queue:' || p_booking_date, 0));

  update public.bookings b
  set client_priority = null
  where b.booking_date::text = p_booking_date
    and b.booking_status in ('Cancelled', 'Rejected')
    and b.client_priority is not null;

  with ranked as (
    select
      b.id,
      row_number() over (
        order by
          case when b.client_priority is null or b.client_priority < 1 then 1 else 0 end,
          b.client_priority nulls last,
          b.booking_time nulls last,
          b.created_at,
          b.id
      )::integer as normalized_priority
    from public.bookings b
    where b.booking_date::text = p_booking_date
      and b.booking_status not in ('Cancelled', 'Rejected')
  )
  update public.bookings b
  set client_priority = 1000000 + ranked.normalized_priority
  from ranked
  where b.id = ranked.id;

  update public.bookings b
  set client_priority = b.client_priority - 1000000
  where b.booking_date::text = p_booking_date
    and b.booking_status not in ('Cancelled', 'Rejected')
    and b.client_priority > 1000000;

  return query
  select b.id::text, b.client_priority
  from public.bookings b
  where b.booking_date::text = p_booking_date
    and b.booking_status not in ('Cancelled', 'Rejected')
  order by b.client_priority, b.id;
end;
$$;

create or replace function public.set_booking_client_priority(
  p_booking_id text,
  p_priority integer,
  p_previous_priority integer,
  p_swap_booking_id text default null
)
returns table (booking_id text, client_priority integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  queue_date text;
  old_priority integer;
  queue_size integer;
begin
  select b.booking_date::text
  into queue_date
  from public.bookings b
  where b.id::text = p_booking_id
    and b.booking_status not in ('Cancelled', 'Rejected')
  for update;

  if queue_date is null then
    raise exception 'The client is not in an active shoot queue.';
  end if;

  -- One transaction may reorder a shoot day at a time. This serializes two
  -- staff members without blocking unrelated dates.
  perform pg_advisory_xact_lock(hashtextextended('booking-queue:' || queue_date, 0));
  perform public.normalize_booking_client_priorities(queue_date);

  select b.client_priority
  into old_priority
  from public.bookings b
  where b.id::text = p_booking_id
  for update;

  select count(*)::integer
  into queue_size
  from public.bookings b
  where b.booking_date::text = queue_date
    and b.booking_status not in ('Cancelled', 'Rejected');

  if p_priority < 1 or p_priority > queue_size then
    raise exception 'Client position must be between 1 and %.', queue_size;
  end if;

  -- The browser sends the position it displayed. Reject a stale screen rather
  -- than overwriting a newer reorder made by another staff member.
  if p_previous_priority is distinct from old_priority then
    raise exception 'The client queue changed. Refresh it and try again.' using errcode = '40001';
  end if;

  if p_priority = old_priority then
    return query
    select b.id::text, b.client_priority
    from public.bookings b
    where b.booking_date::text = queue_date
      and b.booking_status not in ('Cancelled', 'Rejected')
    order by b.client_priority, b.id;
    return;
  end if;

  -- Stage the entire day above the live range so the positive-value check and
  -- unique queue index can never observe a temporary duplicate.
  update public.bookings b
  set client_priority = b.client_priority + 1000000
  where b.booking_date::text = queue_date
    and b.booking_status not in ('Cancelled', 'Rejected');

  update public.bookings b
  set client_priority = case
    when b.id::text = p_booking_id then p_priority
    when p_priority < old_priority
      and b.client_priority - 1000000 >= p_priority
      and b.client_priority - 1000000 < old_priority
      then b.client_priority - 1000000 + 1
    when p_priority > old_priority
      and b.client_priority - 1000000 > old_priority
      and b.client_priority - 1000000 <= p_priority
      then b.client_priority - 1000000 - 1
    else b.client_priority - 1000000
  end
  where b.booking_date::text = queue_date
    and b.booking_status not in ('Cancelled', 'Rejected');

  return query
  select b.id::text, b.client_priority
  from public.bookings b
  where b.booking_date::text = queue_date
    and b.booking_status not in ('Cancelled', 'Rejected')
  order by b.client_priority, b.id;
end;
$$;

create or replace function public.prepare_booking_client_priority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.booking_status in ('Cancelled', 'Rejected') then
    new.client_priority := null;
    return new;
  end if;

  if tg_op = 'INSERT'
    or old.booking_status in ('Cancelled', 'Rejected')
    or old.booking_date is distinct from new.booking_date
  then
    perform pg_advisory_xact_lock(hashtextextended('booking-queue:' || new.booking_date::text, 0));
    select coalesce(max(b.client_priority), 0) + 1
    into new.client_priority
    from public.bookings b
    where b.booking_date = new.booking_date
      and b.booking_status not in ('Cancelled', 'Rejected')
      and (tg_op = 'INSERT' or b.id <> new.id);
  end if;

  return new;
end;
$$;

create or replace function public.close_booking_client_priority_gap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.booking_status not in ('Cancelled', 'Rejected') then
      perform public.normalize_booking_client_priorities(old.booking_date::text);
    end if;
    return old;
  end if;

  if old.booking_status not in ('Cancelled', 'Rejected')
    and (
      new.booking_status in ('Cancelled', 'Rejected')
      or old.booking_date is distinct from new.booking_date
    )
  then
    perform public.normalize_booking_client_priorities(old.booking_date::text);
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_prepare_client_priority on public.bookings;
create trigger bookings_prepare_client_priority
before insert or update of booking_date, booking_status on public.bookings
for each row execute function public.prepare_booking_client_priority();

drop trigger if exists bookings_close_client_priority_gap on public.bookings;
create trigger bookings_close_client_priority_gap
after update of booking_date, booking_status or delete on public.bookings
for each row execute function public.close_booking_client_priority_gap();

do $$
declare
  queue_date record;
begin
  for queue_date in
    select distinct b.booking_date::text as value
    from public.bookings b
    where b.booking_date is not null
  loop
    perform public.normalize_booking_client_priorities(queue_date.value);
  end loop;
end;
$$;

drop index if exists public.bookings_booking_date_client_priority_active_uidx;
create unique index bookings_booking_date_client_priority_active_uidx
  on public.bookings (booking_date, client_priority)
  where client_priority is not null
    and booking_status not in ('Cancelled', 'Rejected');

revoke all on function public.normalize_booking_client_priorities(text) from public, anon, authenticated;
revoke all on function public.set_booking_client_priority(text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.prepare_booking_client_priority() from public, anon, authenticated;
revoke all on function public.close_booking_client_priority_gap() from public, anon, authenticated;

grant execute on function public.normalize_booking_client_priorities(text) to service_role;
grant execute on function public.set_booking_client_priority(text, integer, integer, text) to service_role;

notify pgrst, 'reload schema';
commit;
