-- Exact duplicate payment-proof screening.
-- This migration is idempotent and mirrors the production Supabase rules.

alter table public.bookings
  add column if not exists receipt_hash text,
  add column if not exists fraud_flags jsonb not null default '[]'::jsonb,
  add column if not exists transaction_ref_normalized text
    generated always as (upper(regexp_replace(coalesce(transaction_ref, ''), '\s+', '', 'g'))) stored;

create index if not exists bookings_transaction_ref_normalized_idx
  on public.bookings (transaction_ref_normalized)
  where transaction_ref_normalized <> '';

create index if not exists bookings_receipt_hash_idx
  on public.bookings (receipt_hash)
  where receipt_hash is not null;

create table if not exists public.receipt_fingerprints (
  id uuid primary key default gen_random_uuid(),
  booking_id varchar not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_url text not null,
  file_name text,
  file_size integer check (file_size is null or file_size >= 0),
  created_at timestamptz not null default now(),
  unique (booking_id, sha256)
);

create index if not exists receipt_fingerprints_sha256_idx
  on public.receipt_fingerprints (sha256);
create index if not exists receipt_fingerprints_booking_id_idx
  on public.receipt_fingerprints (booking_id, created_at desc);

alter table public.receipt_fingerprints enable row level security;
revoke all on public.receipt_fingerprints from anon, authenticated;

-- No transaction reference may be used by two different bookings.
create unique index if not exists bookings_unique_transaction_ref_normalized_idx
  on public.bookings (transaction_ref_normalized)
  where transaction_ref_normalized <> '';

create or replace function public.reject_duplicate_transaction_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_ref text;
begin
  normalized_ref := upper(regexp_replace(coalesce(new.transaction_ref, ''), '\s+', '', 'g'));
  if normalized_ref = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.id <> new.id
      and b.transaction_ref_normalized = normalized_ref
  ) then
    raise exception 'This transaction reference has already been used for another booking.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_reject_duplicate_transaction_reference on public.bookings;
create trigger bookings_reject_duplicate_transaction_reference
before insert or update of transaction_ref on public.bookings
for each row execute function public.reject_duplicate_transaction_reference();

-- One exact file hash belongs to only one booking. The same booking may re-upload
-- its own receipt because the upload route reuses the existing fingerprint row.
create unique index if not exists receipt_fingerprints_unique_sha256_idx
  on public.receipt_fingerprints (sha256);

-- All receipt uploads must pass through the server-side hashing endpoint.
drop policy if exists "Anon upload receipts" on storage.objects;

create or replace function public.require_secure_pending_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.booking_status = 'Pending Verification' then
    if new.receipt_url is null
       or btrim(new.receipt_url) = ''
       or new.receipt_url like 'data:%'
       or new.receipt_url like '/%' then
      raise exception 'A securely uploaded receipt is required before payment verification.'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.receipt_fingerprints rf
      where rf.booking_id = new.id
        and rf.file_url = new.receipt_url
    ) then
      raise exception 'Receipt verification metadata is missing. Please upload the receipt again.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_require_secure_pending_receipt on public.bookings;
create trigger bookings_require_secure_pending_receipt
before insert or update of booking_status, receipt_url on public.bookings
for each row execute function public.require_secure_pending_receipt();
