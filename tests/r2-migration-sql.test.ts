import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const additiveSql = readFileSync('supabase/migrations/20260914142001_cleanup_legacy_storage.sql', 'utf8')
const cleanupSql = readFileSync('supabase/migrations/20260914142027_remove_retired_storage_contract.sql', 'utf8')
const workspace = '11111111-1111-4111-8111-111111111111'
const actor = '22222222-2222-4222-8222-222222222222'
const client = '33333333-3333-4333-8333-333333333333'
const portal = '44444444-4444-4444-8444-444444444444'
const selection = '55555555-5555-4555-8555-555555555555'
const gallery = '66666666-6666-4666-8666-666666666666'
const batch = '77777777-7777-4777-8777-777777777777'
const job = '88888888-8888-4888-8888-888888888888'

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table workspaces(id uuid primary key, slug text not null, status text not null);
    create table workspace_members(workspace_id uuid not null, user_id uuid not null, role text not null, primary key(workspace_id,user_id));
    create table clients(id uuid primary key, workspace_id uuid not null);
    create table bookings(
      id varchar primary key, workspace_id uuid not null, client_id uuid not null,
      raw_photo_status text, raw_photo_notes text, raw_photo_submitted_at timestamptz,
      raw_photo_approved_at timestamptz, edited_photo_delivered_at timestamptz,
      drive_link text, raw_photo_link text, edited_photo_link text,
      booking_total numeric(12,2) not null default 0
    );
    create table google_drive_settings(
      id smallint primary key, workspace_id uuid, portal_expiry_days integer not null default 30,
      root_folder_name text, root_folder_id text, oauth_refresh_token text
    );
    create table client_portals(
      id uuid primary key, workspace_id uuid not null, booking_id varchar not null,
      public_id uuid not null, status text not null, expires_at timestamptz,
      first_download_at timestamptz, download_expiry_days integer,
      access_email_sent_at timestamptz, deliverables_uploaded_at timestamptz,
      updated_at timestamptz not null default now()
    );
    create table booking_provisioning(
      booking_id varchar primary key, workspace_id uuid not null, status text not null,
      drive_root_folder_id text, drive_month_folder_id text, drive_day_folder_id text,
      drive_client_folder_id text, drive_client_folder_url text,
      client_portal_id uuid, provisioned_at timestamptz, last_error text,
      last_retry_at timestamptz, updated_at timestamptz not null default now()
    );
    create table provisioning_audit(
      id bigint generated always as identity primary key, booking_id varchar,
      action text not null, actor_type text not null, metadata jsonb not null default '{}'::jsonb
    );
    create table editing_batches(
      id uuid primary key, workspace_id uuid not null, display_id text not null,
      shoot_date date not null, location_key text not null, batch_sequence integer not null,
      status text not null, drive_day_folder_id text, drive_day_folder_url text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table drive_folders(
      id uuid primary key, workspace_id uuid not null, booking_id varchar, batch_id uuid,
      folder_type text, drive_folder_id text not null, parent_drive_folder_id text
    );
    create table photo_selections(
      id uuid primary key, workspace_id uuid not null, booking_id varchar not null,
      status text not null, client_status text not null, required_count integer not null,
      submitted_at timestamptz, reopened_at timestamptz, version integer not null,
      raw_reset_id uuid, raw_upload_generation integer not null default 0,
      no_revision_acknowledged boolean not null default false,
      no_revision_acknowledged_at timestamptz, total_addon_amount numeric(12,2) not null default 0,
      updated_at timestamptz not null default now()
    );
    create table gallery_files(
      id uuid primary key, workspace_id uuid not null, booking_id varchar not null,
      client_id uuid not null, drive_file_id text not null, file_name text not null,
      mime_type text not null default 'image/jpeg', file_size bigint, checksum text,
      thumbnail_reference text, preview_reference text, upload_generation integer not null default 0,
      created_at timestamptz not null default now(), unique(workspace_id,drive_file_id)
    );
    create table photo_selection_items(
      selection_id uuid not null, gallery_file_id uuid not null,
      selected_drive_file_id text, copied_at timestamptz,
      created_at timestamptz not null default now(), primary key(selection_id,gallery_file_id)
    );
    create table editing_jobs(
      id uuid primary key, workspace_id uuid not null, batch_id uuid not null,
      booking_id varchar not null, client_id uuid not null, status text not null,
      selected_count integer not null, expected_output_count integer not null,
      downloaded_at timestamptz, editing_started_at timestamptz, delivered_at timestamptz,
      download_lock_expires_at timestamptz, last_error text, updated_at timestamptz not null default now()
    );
    create table deliverable_files(
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      booking_id varchar not null, editing_job_id uuid not null, drive_file_id text not null,
      relative_path text not null, file_name text not null, mime_type text not null,
      file_size bigint not null, checksum text not null, published_at timestamptz not null default now(),
      unique(workspace_id,drive_file_id), unique(booking_id,relative_path)
    );
    create table batch_upload_jobs(id uuid primary key, workspace_id uuid not null, batch_id uuid not null);
    create table batch_upload_items(
      id uuid primary key, upload_job_id uuid not null, editing_job_id uuid not null,
      booking_id varchar not null, status text not null
    );
    create table batch_upload_files(
      id uuid primary key, upload_item_id uuid not null, relative_path text not null,
      file_name text not null, checksum text not null, drive_file_id text,
      status text not null, attempt_count integer not null default 0,
      last_error text, updated_at timestamptz not null default now()
    );
    create table print_allocations(
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      booking_id varchar not null, selection_id uuid not null, gallery_file_id uuid not null,
      category text not null, quantity integer not null, label_snapshot text not null,
      drive_file_id text, created_at timestamptz not null default now()
    );
    create table client_addon_orders(id uuid primary key default gen_random_uuid(), selection_id uuid not null);
    create table onsite_photo_resets(
      id uuid primary key, workspace_id uuid not null, booking_id varchar not null,
      actor_id uuid not null, state text not null, targets jsonb not null,
      completed_ids text[] not null default '{}', created_at timestamptz not null default now(),
      completed_at timestamptz
    );
    create table workflow_audit_logs(
      id bigint generated always as identity primary key, workspace_id uuid not null,
      actor_type text not null, actor_id text, action text not null,
      booking_id varchar, metadata jsonb not null default '{}'::jsonb
    );
    create table payments(
      id uuid primary key, booking_id varchar not null, amount numeric(12,2) not null,
      status text not null
    );

    insert into workspaces values('${workspace}','fico-mana','active');
    insert into workspace_members values('${workspace}','${actor}','admin');
    insert into clients values('${client}','${workspace}');
    insert into bookings(
      id,workspace_id,client_id,raw_photo_status,raw_photo_submitted_at,
      raw_photo_approved_at,drive_link,raw_photo_link,booking_total
    ) values(
      'FM-100001','${workspace}','${client}','Approved','2026-09-14T01:00:00Z',
      '2026-09-14T01:05:00Z','https://legacy.example/folder','https://legacy.example/raw',6900
    );
    insert into google_drive_settings values(1,'${workspace}',30,'FICO MANA','legacy-root','retired-secret');
    insert into client_portals(id,workspace_id,booking_id,public_id,status)
      values('${portal}','${workspace}','FM-100001','99999999-9999-4999-8999-999999999999','active');
    insert into booking_provisioning(
      booking_id,workspace_id,status,drive_root_folder_id,drive_client_folder_id,client_portal_id
    ) values('FM-100001','${workspace}','ACTIVE','legacy-root','legacy-client','${portal}');
    insert into editing_batches(
      id,workspace_id,display_id,shoot_date,location_key,batch_sequence,status,drive_day_folder_id
    ) values('${batch}','${workspace}','FM-BATCH-2026-09-14-MAIN','2026-09-14','MAIN',1,'READY','legacy-day');
    insert into photo_selections(
      id,workspace_id,booking_id,status,client_status,required_count,submitted_at,version
    ) values('${selection}','${workspace}','FM-100001','SUBMITTED','Submitted',5,'2026-09-14T01:00:00Z',1);
    insert into editing_jobs(
      id,workspace_id,batch_id,booking_id,client_id,status,selected_count,expected_output_count
    ) values('${job}','${workspace}','${batch}','FM-100001','${client}','READY_FOR_EDITING',1,5);
    insert into gallery_files(
      id,workspace_id,booking_id,client_id,drive_file_id,file_name,file_size,checksum
    ) values('${gallery}','${workspace}','FM-100001','${client}','legacy-photo','RAW-01.JPG',1024,'${'a'.repeat(64)}');
    insert into photo_selection_items values('${selection}','${gallery}','legacy-photo',now(),now());
    insert into payments values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','FM-100001',500,'confirmed');
  `)
  return db
}

async function columnExists(db: PGlite, table: string, column: string) {
  const result = await db.query<{ count: number }>(`
    select count(*)::int count from information_schema.columns
    where table_schema='public' and table_name=$1 and column_name=$2
  `, [table, column])
  return result.rows[0].count === 1
}

/**
 * Scenario: SC-010 — Failed cutover rolls back
 * Requirement: REQ-R2-10
 * Priority: P0
 */
test('Phase 1 preserves legacy rows and Phase 2 rolls back completely when an object is not migrated', async (t) => {
  const db = await fixture()
  t.after(() => db.close())
  await db.exec(additiveSql)

  const compatible = await db.query<{ provider: string; status: string; key: string | null }>(`
    select storage_provider provider,storage_status status,storage_key key
    from gallery_files where id='${gallery}'
  `)
  assert.deepEqual(compatible.rows[0], { provider: 'legacy_external', status: 'migration_required', key: null })
  assert.equal(await columnExists(db, 'bookings', 'drive_link'), true)
  assert.equal(await columnExists(db, 'gallery_files', 'storage_key'), true)

  await assert.rejects(db.exec(cleanupSql), /R2 cutover blocked: 1 gallery file\(s\) are not verified in R2/)
  await db.exec('rollback')
  assert.equal(await columnExists(db, 'bookings', 'drive_link'), true)
  assert.equal(await columnExists(db, 'gallery_files', 'drive_file_id'), true)
  const payment = await db.query<{ amount: string }>("select amount::text amount from payments where booking_id='FM-100001'")
  assert.equal(payment.rows[0].amount, '500.00')
})

/**
 * Scenario: SC-011/SC-012 — Verified cutover and database isolation
 * Requirement: REQ-R2-10 and REQ-R2-11
 * Priority: P0
 */
test('Phase 2 removes only retired metadata after verified R2 replacement and keeps workflows and money intact', async (t) => {
  const db = await fixture()
  t.after(() => db.close())
  await db.exec(additiveSql)
  const key = `workspaces/${workspace}/shoots/2026/09/14/FM-100001/raw/${gallery}.jpg`
  await db.exec(`
    update gallery_files set storage_provider='r2',storage_status='available',storage_key='${key}';
    update booking_provisioning set storage_provider='r2',storage_status='ready',
      storage_prefix='workspaces/${workspace}/shoots/2026/09/14/FM-100001';
    update editing_batches set storage_prefix='workspaces/${workspace}/shoots/2026/09/14/FM-BATCH-2026-09-14-MAIN';
  `)
  await db.exec(cleanupSql)

  assert.equal(await columnExists(db, 'bookings', 'drive_link'), false)
  assert.equal(await columnExists(db, 'gallery_files', 'drive_file_id'), false)
  assert.equal(await columnExists(db, 'photo_selection_items', 'selected_drive_file_id'), false)
  const retired = await db.query<{ table_name: string }>(`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in ('drive_folders','google_drive_settings')
  `)
  assert.deepEqual(retired.rows, [])

  const privileges = await db.query<{ anon_read: boolean; authenticated_write: boolean; service_read: boolean }>(`
    select
      has_table_privilege('anon','public.storage_settings','select') anon_read,
      has_table_privilege('authenticated','public.storage_multipart_uploads','insert') authenticated_write,
      has_table_privilege('service_role','public.storage_settings','select') service_read
  `)
  assert.deepEqual(privileges.rows[0], { anon_read: false, authenticated_write: false, service_read: true })

  const reopened = await db.query<{ result: { changed: boolean } }>(`
    select review_portal_selection(
      '${workspace}','FM-100001','${actor}','Reopen','2026-09-14T01:00:00Z',''
    ) result
  `)
  assert.equal(reopened.rows[0].result.changed, true)
  const state = await db.query<{ raw_photo_status: string; selection_status: string; job_status: string }>(`
    select b.raw_photo_status,s.status selection_status,j.status job_status
    from bookings b join photo_selections s on s.booking_id=b.id join editing_jobs j on j.booking_id=b.id
    where b.id='FM-100001'
  `)
  assert.deepEqual(state.rows[0], {
    raw_photo_status: 'Reopened', selection_status: 'OPEN', job_status: 'WAITING_FOR_SELECTION',
  })

  const deliveredAt = '2026-09-14T02:00:00Z'
  const enhancedKey = `workspaces/${workspace}/shoots/2026/09/14/FM-100001/enhanced/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`
  await db.exec(`
    insert into deliverable_files(
      workspace_id,booking_id,editing_job_id,relative_path,file_name,mime_type,
      file_size,checksum,published_at,storage_key,storage_provider,storage_status
    ) values(
      '${workspace}','FM-100001','${job}','EDITED/final.jpg','ENHANCED 1 - SYNTHETIC CLIENT.jpg','image/jpeg',
      2048,'${'b'.repeat(64)}','${deliveredAt}','${enhancedKey}','r2','available'
    )
  `)
  const expiry = await db.query<{ delivered: Date; expires: Date }>(`
    select deliverables_uploaded_at delivered,expires_at expires from client_portals where id='${portal}'
  `)
  assert.equal(expiry.rows[0].delivered.toISOString(), deliveredAt.replace('Z', '.000Z'))
  assert.equal(expiry.rows[0].expires.getTime() - expiry.rows[0].delivered.getTime(), 30 * 86_400_000)
  await db.exec(`update deliverable_files set published_at='2026-09-15T02:00:00Z' where booking_id='FM-100001'`)
  const unchanged = await db.query<{ expires: Date }>(`select expires_at expires from client_portals where id='${portal}'`)
  assert.equal(unchanged.rows[0].expires.getTime(), expiry.rows[0].expires.getTime())

  const payment = await db.query<{ total: string; paid: string }>(`
    select b.booking_total::text total,p.amount::text paid
    from bookings b join payments p on p.booking_id=b.id where b.id='FM-100001'
  `)
  assert.deepEqual(payment.rows[0], { total: '6900.00', paid: '500.00' })
})

/**
 * Scenario: database constraint boundary supporting SC-004 and SC-012
 * Requirement: REQ-R2-04 and REQ-R2-11
 * Priority: P0
 */
test('R2 schema rejects invalid checksum, duplicate storage key, dangling booking, and missing required fields', async (t) => {
  const db = await fixture()
  t.after(() => db.close())
  await db.exec(additiveSql)
  const key = `workspaces/${workspace}/shoots/2026/09/14/FM-100001/raw/${gallery}.jpg`
  await db.exec(`update gallery_files set storage_provider='r2',storage_status='available',storage_key='${key}'`)

  await assert.rejects(db.exec(`
    insert into storage_multipart_uploads(
      workspace_id,booking_id,storage_key,upload_id,category,expected_size,
      expected_checksum,mime_type,original_filename,expires_at
    ) values('${workspace}','FM-100001','${key}','upload-id-001','raw',10,'bad','image/jpeg','RAW.JPG',now()+interval '1 hour')
  `), /check constraint/i)
  await assert.rejects(db.exec(`
    insert into gallery_files(
      id,workspace_id,booking_id,client_id,file_name,mime_type,storage_key,storage_provider,storage_status
    ) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${workspace}','FM-100001','${client}','DUP.JPG','image/jpeg','${key}','r2','available')
  `), /unique constraint/i)
  await assert.rejects(db.exec(`
    insert into storage_multipart_uploads(
      workspace_id,booking_id,storage_key,upload_id,category,expected_size,
      expected_checksum,mime_type,original_filename,expires_at
    ) values('${workspace}','MISSING','${key}','upload-id-002','raw',10,'${'b'.repeat(64)}','image/jpeg','RAW.JPG',now()+interval '1 hour')
  `), /foreign key constraint/i)
  await assert.rejects(db.exec(`
    insert into storage_multipart_uploads(
      workspace_id,booking_id,storage_key,upload_id,category,expected_size,
      expected_checksum,mime_type,expires_at
    ) values('${workspace}','FM-100001','${key}','upload-id-003','raw',10,'${'b'.repeat(64)}','image/jpeg',now()+interval '1 hour')
  `), /null value in column "original_filename"/i)
})
