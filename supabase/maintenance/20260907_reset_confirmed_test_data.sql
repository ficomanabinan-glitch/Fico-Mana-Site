-- ONE-TIME, MANUALLY AUTHORIZED TEST-DATA RESET. Never put this in migrations.
-- Verified target: hrvyxxamxacosmbnkxwd / FICO MANA SITE TEST ENVIRONMENT.
-- User confirmed permanent deletion after being told no automatic backup exists.
-- Preserves accounts, configuration, catalogs, website content, and actual files.
-- Refuses changed booking/client/payment counts and any other workspace.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $reset$
declare
  target_workspace constant uuid := '24d61bc1-d9bb-426c-bd33-668bb4fe2c43';
  cleared_tables constant text[] := array[
    'bookings','clients','payments','receipts','receipt_fingerprints',
    'notifications','email_logs','sales_expenses',
    'client_portals','client_portal_resources','booking_provisioning','provisioning_audit',
    'editing_batches','editing_jobs','gallery_files','storage_multipart_uploads',
    'photo_selections','photo_selection_items','client_addon_orders','print_allocations',
    'deliverable_files','batch_upload_jobs','batch_upload_items','batch_upload_files',
    'workflow_match_reviews','workflow_audit_logs','shoot_invitations',
    'shoot_reminder_deliveries','shoot_reminder_control_audit',
    'admin_login_events','security_audit_events'
  ];
  preserved_tables constant text[] := array[
    'auth.users','public.workspaces','public.workspace_members','public.packages',
    'public.addon_catalog','public.website_media_slots','public.website_media_upload_grants',
    'public.storage_settings','public.sales_settings','public.shoot_reminder_settings',
    'public.blocked_slots','public.blocked_days','public.fico_spot_blocks',
    'storage.objects','storage.buckets'
  ];
  table_name text;
  qualified_tables text;
  protected_before jsonb := '{}'::jsonb;
  fingerprint text;
  remaining bigint;
begin
  if (select count(*) from public.workspaces) <> 1 or not exists (
    select 1 from public.workspaces
    where id=target_workspace and slug='fico-mana' and status='active'
  ) then
    raise exception 'STOP: workspace differs from the verified Fico Mana reset target.';
  end if;

  select string_agg(format('public.%I', item), ', ' order by item)
    into qualified_tables from unnest(cleared_tables) as item;
  execute 'lock table ' || qualified_tables || ' in access exclusive mode';

  if (select count(*) from public.bookings) <> 116
    or (select count(*) from public.clients) <> 116
    or (select count(*) from public.payments) <> 102 then
    raise exception 'STOP: business records changed since approval. Recheck the reset scope.';
  end if;
  if exists (select 1 from public.bookings where workspace_id is distinct from target_workspace)
    or exists (select 1 from public.clients where workspace_id is distinct from target_workspace) then
    raise exception 'STOP: records from another workspace were found.';
  end if;
  if exists (select 1 from public.shoot_reminder_settings where enabled)
    or exists (select 1 from public.shoot_reminder_deliveries where status='sending')
    or exists (select 1 from public.batch_upload_jobs where status='RUNNING') then
    raise exception 'STOP: pause reminders and finish active uploads before resetting.';
  end if;

  foreach table_name in array preserved_tables loop
    execute format(
      'select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,''[]'')) from %s r',
      table_name::regclass
    ) into fingerprint;
    protected_before := protected_before || jsonb_build_object(table_name,fingerprint);
  end loop;

  -- RESTRICT is intentional: an unexpected foreign key aborts the whole reset.
  -- No CASCADE, no identity reset, no auth/storage deletion, no disabled policies.
  execute 'truncate table ' || qualified_tables || ' continue identity restrict';

  foreach table_name in array cleared_tables loop
    execute format('select count(*) from public.%I',table_name) into remaining;
    if remaining <> 0 then raise exception 'STOP: % did not clear.',table_name; end if;
  end loop;
  foreach table_name in array preserved_tables loop
    execute format(
      'select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,''[]'')) from %s r',
      table_name::regclass
    ) into fingerprint;
    if fingerprint is distinct from protected_before->>table_name then
      raise exception 'STOP: protected table % changed. Reset rolled back.',table_name;
    end if;
  end loop;
end;
$reset$;

commit;

select 'RESET COMMITTED; protected records unchanged' as result,
  (select count(*) from public.bookings) as bookings,
  (select count(*) from public.clients) as clients,
  (select count(*) from public.payments) as payments,
  (select count(*) from public.client_portals) as portals,
  (select count(*) from auth.users) as accounts_kept,
  (select count(*) from public.packages) as packages_kept,
  (select count(*) from storage.objects) as storage_files_kept;
