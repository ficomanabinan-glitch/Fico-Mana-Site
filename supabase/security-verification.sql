-- Read-only production verification queries. Run in the Supabase SQL editor
-- after applying migrations and running `pnpm security:receipts`.

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'receipts';

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (coalesce(qual, '') ilike '%receipts%' or coalesce(with_check, '') ilike '%receipts%');

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
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
  )
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_name, grantee, privilege_type;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('receipt_fingerprints', 'api_rate_limits', 'security_audit_events');

select p.proname,
       p.prosecdef as security_definer,
       p.proconfig as function_settings,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'consume_api_rate_limit',
    'notify_on_booking_insert',
    'reject_duplicate_transaction_reference',
    'require_secure_pending_receipt'
  )
order by p.proname;

select count(*) as legacy_public_receipt_references
from public.receipt_fingerprints
where file_url like '%/storage/v1/object/public/receipts/%';

select count(*) as pending_bookings_without_opaque_receipt_reference
from public.bookings
where booking_status = 'Pending Verification'
  and receipt_url !~ '^/api/receipts/[0-9a-f-]{36}$';
