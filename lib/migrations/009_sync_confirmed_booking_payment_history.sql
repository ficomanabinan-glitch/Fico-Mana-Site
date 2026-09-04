create or replace function public.sync_confirmed_booking_payment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p jsonb;
  history jsonb;
  v_id text;
begin
  if new.payment_status not in ('Paid Deposit','Paid Full')
     or new.booking_status in ('Pending Verification','Pending Payment','Rejected','Cancelled') then
    return new;
  end if;

  history := case when jsonb_typeof(new.payment_history) = 'array' then new.payment_history else '[]'::jsonb end;

  for p in select value from jsonb_array_elements(history) loop
    v_id := nullif(trim(p->>'id'), '');
    if v_id is null then continue; end if;

    insert into public.payments(
      id, booking_id, amount, method, payment_type, transaction_ref, created_at,
      status, verified_at
    ) values (
      v_id,
      new.id,
      coalesce(nullif(p->>'amount','')::numeric, 0),
      coalesce(nullif(p->>'method',''), 'Cash'),
      coalesce(nullif(p->>'type',''), 'Balance Payment'),
      nullif(trim(p->>'transactionRef'), ''),
      coalesce(nullif(p->>'date','')::timestamptz, now()),
      'confirmed',
      now()
    )
    on conflict (id) do update set
      amount = excluded.amount,
      method = excluded.method,
      payment_type = excluded.payment_type,
      transaction_ref = excluded.transaction_ref,
      status = 'confirmed',
      verified_at = coalesce(public.payments.verified_at, excluded.verified_at);
  end loop;

  return new;
end;
$$;

drop trigger if exists bookings_sync_confirmed_payment_history on public.bookings;
create trigger bookings_sync_confirmed_payment_history
after insert or update of payment_history, payment_status, booking_status
on public.bookings
for each row execute function public.sync_confirmed_booking_payment_history();

do $$
declare
  b record;
  p jsonb;
  history jsonb;
begin
  for b in
    select id, payment_history
    from public.bookings
    where payment_status in ('Paid Deposit','Paid Full')
      and booking_status not in ('Pending Verification','Pending Payment','Rejected','Cancelled')
  loop
    history := case when jsonb_typeof(b.payment_history) = 'array' then b.payment_history else '[]'::jsonb end;
    for p in select value from jsonb_array_elements(history) loop
      if nullif(trim(p->>'id'), '') is null then continue; end if;
      insert into public.payments(id, booking_id, amount, method, payment_type, transaction_ref, created_at, status, verified_at)
      values (
        p->>'id', b.id, coalesce(nullif(p->>'amount','')::numeric,0), coalesce(nullif(p->>'method',''),'Cash'),
        coalesce(nullif(p->>'type',''),'Balance Payment'), nullif(trim(p->>'transactionRef'),''),
        coalesce(nullif(p->>'date','')::timestamptz, now()), 'confirmed', now()
      )
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;