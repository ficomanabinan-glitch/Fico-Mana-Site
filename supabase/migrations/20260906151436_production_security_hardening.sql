-- FICO MANA production security hardening.
-- Apply with the Supabase CLI after reviewing the target project. This migration
-- preserves existing bookings and receipt objects; it does not delete user data.

begin;

-- Keep the existing staff role for compatibility and add an explicit onsite
-- role for accounts that should upload RAW files but never edit/administer.
alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'admin', 'editor', 'onsite', 'staff'));

-- Receipt objects are addressed by an opaque database UUID. The physical object
-- path stays server-only and is exchanged for a short-lived signed URL on demand.
alter table public.receipt_fingerprints
  add column if not exists storage_path text;

-- The previous trigger rejected relative receipt references. Recreate it below
-- after existing rows are converted to the new opaque server endpoint format.
drop trigger if exists bookings_require_secure_pending_receipt on public.bookings;

update public.receipt_fingerprints
set storage_path = split_part(
  substring(file_url from '/storage/v1/object/public/receipts/(.+)$'),
  '?',
  1
)
where storage_path is null
  and file_url like '%/storage/v1/object/public/receipts/%';

update public.bookings as b
set receipt_url = '/api/receipts/' || rf.id::text
from public.receipt_fingerprints as rf
where b.receipt_url = rf.file_url
  and rf.storage_path is not null;

update public.receipt_fingerprints
set file_url = '/api/receipts/' || id::text
where storage_path is not null
  and file_url <> '/api/receipts/' || id::text;

alter table public.receipt_fingerprints
  drop constraint if exists receipt_fingerprints_storage_path_safe;
alter table public.receipt_fingerprints
  add constraint receipt_fingerprints_storage_path_safe
  check (
    storage_path is null
    or (
      char_length(storage_path) between 1 and 700
      and storage_path !~ '(^|/)\.\.(/|$)'
    )
  ) not valid;
alter table public.receipt_fingerprints
  validate constraint receipt_fingerprints_storage_path_safe;

create index if not exists receipt_fingerprints_storage_path_idx
  on public.receipt_fingerprints (storage_path)
  where storage_path is not null;

-- The upload/session quota checks use the declared byte size. Existing rows are
-- zero because earlier versions did not persist this value.
alter table public.batch_upload_files
  add column if not exists file_size bigint not null default 0;
alter table public.batch_upload_files
  drop constraint if exists batch_upload_files_file_size_nonnegative;
alter table public.batch_upload_files
  add constraint batch_upload_files_file_size_nonnegative check (file_size >= 0);

-- Distributed, atomic, service-role-only API throttling fallback. Upstash remains
-- the preferred first tier; this RPC is used if Upstash is absent or unavailable.
create table if not exists public.api_rate_limits (
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  policy text not null check (policy ~ '^[a-z0-9-]{1,64}$'),
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key_hash, policy)
);

create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits (updated_at);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_policy text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.api_rate_limits%rowtype;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_policy !~ '^[a-z0-9-]{1,64}$'
     or p_limit < 1 or p_limit > 100000
     or p_window_seconds < 1 or p_window_seconds > 2592000 then
    raise exception 'Invalid rate-limit parameters.' using errcode = '22023';
  end if;

  insert into public.api_rate_limits as limits (
    key_hash, policy, request_count, window_started_at, updated_at
  )
  values (p_key_hash, p_policy, 1, now(), now())
  on conflict (key_hash, policy) do update
  set
    request_count = case
      when now() >= limits.window_started_at + make_interval(secs => p_window_seconds) then 1
      else limits.request_count + 1
    end,
    window_started_at = case
      when now() >= limits.window_started_at + make_interval(secs => p_window_seconds) then now()
      else limits.window_started_at
    end,
    updated_at = now()
  returning * into r;

  return query select
    r.request_count <= p_limit,
    greatest(0, p_limit - r.request_count),
    r.window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

-- Append-only operational security events. Application code deliberately stores
-- redacted metadata and never credentials, tokens, raw IP addresses, or file data.
create table if not exists public.security_audit_events (
  id bigint generated by default as identity primary key,
  event_type text not null check (char_length(event_type) between 1 and 100),
  outcome text not null check (outcome in ('success', 'failure', 'blocked')),
  actor_id text,
  workspace_id uuid,
  booking_id varchar,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_events_created_at_idx
  on public.security_audit_events (created_at desc);
create index if not exists security_audit_events_event_type_idx
  on public.security_audit_events (event_type, created_at desc);
create index if not exists security_audit_events_booking_id_idx
  on public.security_audit_events (booking_id, created_at desc)
  where booking_id is not null;

alter table public.security_audit_events enable row level security;
revoke all on table public.security_audit_events from public, anon, authenticated;
grant all on table public.security_audit_events to service_role;
revoke all on sequence public.security_audit_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.security_audit_events_id_seq to service_role;

-- Browser clients use narrow server routes, so these sensitive tables receive no
-- direct anon/authenticated privileges even if an older permissive policy exists.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces', 'workspace_members', 'clients', 'bookings', 'notifications',
    'payments', 'receipt_fingerprints', 'drive_folders', 'editing_batches',
    'editing_jobs', 'gallery_files', 'photo_selections', 'photo_selection_items',
    'deliverable_files', 'batch_upload_jobs', 'batch_upload_items',
    'batch_upload_files', 'workflow_audit_logs', 'workflow_match_reviews',
    'google_drive_settings', 'client_portals', 'client_portal_resources',
    'booking_provisioning', 'provisioning_audit', 'admin_login_events',
    'admin_login_rate_limits', 'api_rate_limits', 'security_audit_events',
    'sales_expenses', 'sales_settings', 'email_logs', 'packages',
    'blocked_slots', 'fico_spot_blocks'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
      execute format('grant all on table public.%I to service_role', table_name);
    end if;
  end loop;
end;
$$;

-- Remove the historical public receipt read/upload paths. Bucket privacy itself is
-- changed and verified through the supported Storage API by security:receipts.
drop policy if exists "Public read receipts" on storage.objects;
drop policy if exists "Anon upload receipts" on storage.objects;

alter table public.receipt_fingerprints enable row level security;
revoke all on table public.receipt_fingerprints from public, anon, authenticated;
grant all on table public.receipt_fingerprints to service_role;

-- Pending bookings may reference only an opaque, server-resolved receipt URL that
-- belongs to the same booking.
create or replace function public.require_secure_pending_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.booking_status = 'Pending Verification' then
    if new.receipt_url is null
       or new.receipt_url !~ '^/api/receipts/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists (
         select 1
         from public.receipt_fingerprints as rf
         where rf.booking_id = new.id
           and rf.file_url = new.receipt_url
           and rf.storage_path is not null
       ) then
      raise exception 'A verified receipt upload is required before payment verification.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger bookings_require_secure_pending_receipt
before insert or update of booking_status, receipt_url on public.bookings
for each row execute function public.require_secure_pending_receipt();

revoke all on function public.require_secure_pending_receipt()
  from public, anon, authenticated;
grant execute on function public.require_secure_pending_receipt() to service_role;

-- Harden SECURITY DEFINER trigger functions against search-path substitution and
-- direct browser execution. Trigger invocation continues to work after revocation.
do $$
begin
  if to_regprocedure('public.notify_on_booking_insert()') is not null then
    execute 'alter function public.notify_on_booking_insert() set search_path = public, pg_temp';
    execute 'revoke all on function public.notify_on_booking_insert() from public, anon, authenticated';
    execute 'grant execute on function public.notify_on_booking_insert() to service_role';
  end if;

  if to_regprocedure('public.reject_duplicate_transaction_reference()') is not null then
    execute 'alter function public.reject_duplicate_transaction_reference() set search_path = public, pg_temp';
    execute 'revoke all on function public.reject_duplicate_transaction_reference() from public, anon, authenticated';
    execute 'grant execute on function public.reject_duplicate_transaction_reference() to service_role';
  end if;
end;
$$;

commit;
