import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const workspace = '00000000-0000-4000-8000-000000000001'
const publicId = '00000000-0000-4000-8000-000000000002'
const readyEmailMigration = readFileSync('supabase/migrations/20260908175305_portal_ready_email_expiry.sql', 'utf8')
const finalDeliveryMigration = readFileSync('supabase/migrations/20260909062000_final_delivery_portal_expiry.sql', 'utf8')

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key,slug text,status text);
    create table bookings(
      id varchar primary key,
      workspace_id uuid,
      edited_photo_delivered_at timestamptz
    );
    create table client_portals(
      id uuid primary key default gen_random_uuid(),public_id uuid,booking_id varchar,workspace_id uuid,
      status text default 'active',expires_at timestamptz,updated_at timestamptz,
      access_email_sent_at timestamptz,first_download_at timestamptz,download_expiry_days integer
    );
    create table google_drive_settings(id integer,workspace_id uuid,portal_expiry_days integer);
    create table deliverable_files(
      workspace_id uuid,
      booking_id varchar,
      published_at timestamptz default clock_timestamp()
    );
    create table editing_jobs(
      workspace_id uuid,
      booking_id varchar,
      status text,
      delivered_at timestamptz
    );
    create table photo_selections(workspace_id uuid,booking_id varchar,raw_reset_id uuid);
    create table provisioning_audit(booking_id varchar,action text,actor_type text,metadata jsonb);
    insert into workspaces values('${workspace}','fico-mana','active');
    insert into bookings(id,workspace_id) values('CLIENT','${workspace}');
    insert into google_drive_settings values(1,'${workspace}',30);
    insert into client_portals(public_id,booking_id,workspace_id) values('${publicId}','CLIENT','${workspace}');
  `)

  // Apply the historical migration first, then the final policy migration exactly
  // as production will. The latter must supersede ready-email expiry behavior.
  await db.exec(readyEmailMigration)
  await db.exec(finalDeliveryMigration)

  const read = async () => (await db.query<any>("select * from client_portals where booking_id='CLIENT'")).rows[0]
  const ready = async (sentAt: string, ws = workspace, id = publicId) =>
    (await db.query<any>('select record_portal_ready_email($1,$2,$3) result', [ws, id, sentAt])).rows[0].result
  const deliver = async (deliveredAt: string) => {
    await db.query(
      `insert into deliverable_files(workspace_id,booking_id,published_at) values($1,'CLIENT',$2)`,
      [workspace, deliveredAt],
    )
    await db.query(
      `insert into editing_jobs(workspace_id,booking_id,status,delivered_at) values($1,'CLIENT','DELIVERED',$2)`,
      [workspace, deliveredAt],
    )
    return read()
  }
  const download = async () =>
    (await db.query<any>('select record_portal_first_download($1,$2) result', [workspace, publicId])).rows[0].result
  return { db, read, ready, deliver, download }
}

test('selection-ready email is recorded but never starts the final-gallery countdown', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  const sentAt = '2026-09-08T01:30:00Z'
  await f.db.exec('update google_drive_settings set portal_expiry_days=45')

  const first = await f.ready(sentAt)
  const duplicate = await f.ready('2026-09-09T01:30:00Z')

  assert.deepEqual(first, duplicate)
  assert.equal(Date.parse(first.portalReadyEmailSentAt), Date.parse(sentAt))
  assert.equal(first.deliveryExpiryStartedAt, null)
  assert.equal(first.expiresAt, null)
  assert.equal((await f.read()).expires_at, null)
  assert.equal((await f.db.query("select * from provisioning_audit where action='portal_expiry_started_by_ready_email'")).rows.length, 0)
})

test('final delivery starts the configured countdown exactly once and downloads never extend it', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.ready('2026-09-08T00:00:00Z')
  await f.db.exec('update google_drive_settings set portal_expiry_days=45')

  const deliveredAt = '2026-09-10T02:00:00Z'
  const delivered = await f.deliver(deliveredAt)
  assert.equal(Date.parse(delivered.delivery_expiry_started_at), Date.parse(deliveredAt))
  assert.equal(Date.parse(delivered.expires_at) - Date.parse(deliveredAt), 45 * 86_400_000)

  const firstDownload = await f.download()
  const duplicateDownload = await f.download()
  assert.deepEqual(firstDownload, duplicateDownload)
  assert.equal(Date.parse(firstDownload.expiresAt), Date.parse(delivered.expires_at))

  // A later DELIVERED update is idempotent: it cannot reset or extend access.
  await f.db.query(
    `update editing_jobs set delivered_at=$1, status='DELIVERED' where workspace_id=$2 and booking_id='CLIENT'`,
    ['2026-09-15T02:00:00Z', workspace],
  )
  const afterDuplicateDelivery = await f.read()
  assert.equal(Date.parse(afterDuplicateDelivery.delivery_expiry_started_at), Date.parse(deliveredAt))
  assert.equal(Date.parse(afterDuplicateDelivery.expires_at), Date.parse(delivered.expires_at))
  assert.equal((await f.db.query("select * from provisioning_audit where action='portal_expiry_started_by_final_delivery'")).rows.length, 1)
})

test('delivery expiry functions remain service-only and reject invalid/foreign portal operations safely', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  const permissions = (await f.db.query<any>(`select
    has_function_privilege('anon','record_portal_ready_email(uuid,uuid,timestamptz)','execute') anon,
    has_function_privilege('authenticated','record_portal_ready_email(uuid,uuid,timestamptz)','execute') member,
    has_function_privilege('service_role','record_portal_ready_email(uuid,uuid,timestamptz)','execute') service`)).rows[0]
  assert.deepEqual(permissions, { anon: false, member: false, service: true })

  await assert.rejects(
    f.ready('2026-09-08T00:00:00Z', workspace, '00000000-0000-4000-8000-000000000099'),
    /unavailable/,
  )
  await f.db.exec("update client_portals set status='disabled'")
  await assert.rejects(f.ready('2026-09-08T00:00:00Z'), /unavailable/)

  await f.db.exec("update client_portals set status='active'; update google_drive_settings set portal_expiry_days=0")
  const ready = await f.ready('2026-09-08T00:00:00Z')
  assert.equal(ready.expiresAt, null)

  await f.db.query(
    `insert into deliverable_files(workspace_id,booking_id,published_at) values($1,'CLIENT',$2)`,
    [workspace, '2026-09-10T00:00:00Z'],
  )
  await assert.rejects(
    f.db.query(
      `insert into editing_jobs(workspace_id,booking_id,status,delivered_at) values($1,'CLIENT','DELIVERED',$2)`,
      [workspace, '2026-09-10T00:00:00Z'],
    ),
    /expiry setting is invalid/,
  )
  assert.equal((await f.read()).expires_at, null)
})
