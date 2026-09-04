update public.bookings
set payment_history = (payment_history #>> '{}')::jsonb
where jsonb_typeof(payment_history) = 'string'
  and left(trim(payment_history #>> '{}'), 1) = '[';

update public.bookings
set payment_status = payment_status
where payment_status in ('Paid Deposit','Paid Full')
  and booking_status not in ('Pending Verification','Pending Payment','Rejected','Cancelled')
  and jsonb_typeof(payment_history) = 'array';