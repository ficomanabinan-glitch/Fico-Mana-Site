import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const workspace = '00000000-0000-4000-8000-000000000001'
const publicId = '00000000-0000-4000-8000-000000000002'
const migration = readFileSync('supabase/migrations/20260908175305_portal_ready_email_expiry.sql', 'utf8')

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key,slug text,status text);
    create table bookings(id varchar primary key,workspace_id uuid);
    create table client_portals(
      id uuid primary key default gen_random_uuid(),public_id uuid,booking_id varchar,workspace_id uuid,
      status text default 'active',expires_at timestamptz,updated_at timestamptz,
      access_email_sent_at timestamptz,first_download_at timestamptz,download_expiry_days integer
    );
    create table google_drive_settings(id integer,workspace_id uuid,portal_expiry_days integer);
    create table deliverable_files(workspace_id uuid,booking_id varchar);
    create table photo_selections(workspace_id uuid,booking_id varchar,raw_reset_id uuid);
    create table provisioning_audit(booking_id varchar,action text,actor_type text,metadata jsonb);
    insert into workspaces values('${workspace}','fico-mana','active');
    insert into bookings values('CLIENT','${workspace}');
    insert into google_drive_settings values(1,'${workspace}',30);
    insert into deliverable_files values('${workspace}','CLIENT');
    insert into client_portals(public_id,booking_id,workspace_id) values('${publicId}','CLIENT','${workspace}');
  `)
  await db.exec(migration)
  const read = async () => (await db.query<any>("select * from client_portals where booking_id='CLIENT'")).rows[0]
  const ready = async (sentAt: string, ws = workspace, id = publicId) =>
    (await db.query<any>('select record_portal_ready_email($1,$2,$3) result', [ws, id, sentAt])).rows[0].result
  const download = async () =>
    (await db.query<any>('select record_portal_first_download($1,$2) result', [workspace, publicId])).rows[0].result
  return { db, read, ready, download }
}

test('the first successful portal-ready email starts the configured countdown exactly once', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  const sentAt = '2026-09-08T01:30:00Z'
  await f.db.exec('update google_drive_settings set portal_expiry_days=45')
  const [first, duplicate] = await Promise.all([f.ready(sentAt), f.ready('2026-09-09T01:30:00Z')])
  assert.deepEqual(first, duplicate)
  assert.equal(first.days, 45)
  assert.equal(Date.parse(first.portalReadyEmailSentAt), Date.parse(sentAt))
  assert.equal(Date.parse(first.expiresAt) - Date.parse(first.portalReadyEmailSentAt), 45 * 86_400_000)
  await f.db.exec('update google_drive_settings set portal_expiry_days=365')
  assert.deepEqual(await f.ready('2026-09-10T01:30:00Z'), first)
  assert.equal((await f.db.query("select * from provisioning_audit where action='portal_expiry_started_by_ready_email'")).rows.length, 1)
})

test('downloads are audited without creating, resetting, or extending the email-based deadline', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  const beforeReady = await f.download()
  assert.ok(beforeReady.firstDownloadAt)
  assert.equal(beforeReady.expiresAt, null)
  const ready = await f.ready('2026-09-08T00:00:00Z')
  const firstDownload = await f.download()
  assert.equal(firstDownload.firstDownloadAt, beforeReady.firstDownloadAt)
  assert.equal(Date.parse(firstDownload.expiresAt), Date.parse(ready.expiresAt))
  assert.deepEqual(await f.download(), firstDownload)
  assert.equal((await f.read()).expires_at.getTime(), Date.parse(ready.expiresAt))
})

test('portal-ready email expiry is service-only and rejects invalid or foreign portals without starting a timer', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  const permissions = (await f.db.query<any>(`select
    has_function_privilege('anon','record_portal_ready_email(uuid,uuid,timestamptz)','execute') anon,
    has_function_privilege('authenticated','record_portal_ready_email(uuid,uuid,timestamptz)','execute') member,
    has_function_privilege('service_role','record_portal_ready_email(uuid,uuid,timestamptz)','execute') service`)).rows[0]
  assert.deepEqual(permissions, { anon: false, member: false, service: true })
  await assert.rejects(f.ready('2026-09-08T00:00:00Z', workspace, '00000000-0000-4000-8000-000000000099'), /unavailable/)
  await f.db.exec("update client_portals set status='disabled'")
  await assert.rejects(f.ready('2026-09-08T00:00:00Z'), /unavailable/)
  await f.db.exec("update client_portals set status='active'; update google_drive_settings set portal_expiry_days=0")
  await assert.rejects(f.ready('2026-09-08T00:00:00Z'), /expiry setting is invalid/)
  assert.equal((await f.read()).access_email_sent_at, null)
})
