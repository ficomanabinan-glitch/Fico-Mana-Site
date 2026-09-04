alter table public.payments
  add column if not exists transaction_ref_normalized text
  generated always as (
    nullif(lower(regexp_replace(coalesce(transaction_ref,''), '[^a-zA-Z0-9]', '', 'g')), '')
  ) stored;

create unique index if not exists payments_transaction_ref_normalized_uidx
  on public.payments(transaction_ref_normalized)
  where transaction_ref_normalized is not null;