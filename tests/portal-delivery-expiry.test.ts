import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const workspace = '00000000-0000-4000-8000-000000000001'
const portalId = '00000000-0000-4000-8000-000000000002'
const migration = readFileSync('supabase/migrations/20260909010816_portal_final_delivery_expiry.sql', 'utf8')

async function fixture(before = '') {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key,slug text,status text);
    create table bookings(id varchar primary key,workspace_id uuid,edited_photo_delivered_at timestamptz,edited_photo_link text);
    create table client_portals(id uuid primary key default gen_random_uuid(),public_id uuid,booking_id varchar,workspace_id uuid,
      status text default 'active',expires_at timestamptz,updated_at timestamptz,access_email_sent_at timestamptz,first_download_at timestamptz,download_expiry_days integer);
    create table google_drive_settings(id integer,workspace_id uuid,portal_expiry_days integer);
    create table deliverable_files(id uuid default gen_random_uuid(),workspace_id uuid,booking_id varchar,published_at timestamptz);
    create table photo_selections(workspace_id uuid,booking_id varchar,raw_reset_id uuid);
    create table provisioning_audit(booking_id varchar,action text,actor_type text,metadata jsonb);
    insert into workspaces values('${workspace}','fico-mana','active');
    insert into bookings(id,workspace_id) values('CLIENT','${workspace}');
    insert into google_drive_settings values(1,'${workspace}',30);
    insert into client_portals(public_id,booking_id,workspace_id) values('${portalId}','CLIENT','${workspace}');
  `)
  await db.exec(readFileSync('supabase/migrations/20260908175305_portal_ready_email_expiry.sql', 'utf8'))
  if (before) await db.exec(before)
  await db.exec(migration)
  const read = async () => (await db.query<{ deliverables_uploaded_at: Date | null; expires_at: Date | null; status: string }>('select * from client_portals')).rows[0]
  const publish = (date: string) => db.query('insert into deliverable_files(workspace_id,booking_id,published_at) values($1,$2,$3)', [workspace, 'CLIENT', date])
  const ready = () => db.query('select record_portal_ready_email($1,$2)', [workspace, portalId])
  return { db, read, publish, ready }
}

test('only first final publication starts expiry; ready email, duplicates and downloads cannot reset it', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.ready(); await f.ready()
  assert.equal((await f.read()).expires_at, null)
  await f.db.exec('update google_drive_settings set portal_expiry_days=45')
  const released = new Date(Date.now() - 1000).toISOString()
  await f.publish(released)
  const first = await f.read()
  assert.equal(first.deliverables_uploaded_at?.toISOString(), released)
  assert.equal(first.expires_at!.getTime() - first.deliverables_uploaded_at!.getTime(), 45 * 86400000)
  await f.db.exec('update google_drive_settings set portal_expiry_days=365')
  await f.publish(new Date().toISOString()); await f.ready()
  await f.db.query('select record_portal_first_download($1,$2)', [workspace, portalId])
  await f.db.exec('update deliverable_files set published_at=clock_timestamp()')
  assert.equal((await f.read()).expires_at?.getTime(), first.expires_at?.getTime())
  assert.equal((await f.read()).deliverables_uploaded_at?.getTime(), first.deliverables_uploaded_at?.getTime())
})

test('migration removes prior automatic email expiry, preserves explicit staff deadlines and never enables disabled portals', async t => {
  const f = await fixture("update client_portals set access_email_sent_at='2026-09-01Z',download_expiry_days=30,expires_at='2026-10-01Z',status='disabled'")
  t.after(() => f.db.close())
  assert.equal((await f.read()).expires_at, null)
  await f.publish(new Date().toISOString())
  assert.equal((await f.read()).status, 'disabled')
  const manual = await fixture("update client_portals set expires_at='2026-12-31Z'")
  t.after(() => manual.db.close())
  await manual.publish(new Date().toISOString())
  assert.equal((await manual.read()).expires_at?.toISOString(), '2026-12-31T00:00:00.000Z')
})

test('historical published files define delivery timestamp and expiry without inventing a release date', async t => {
  const f = await fixture(`insert into deliverable_files(workspace_id,booking_id,published_at) values('${workspace}','CLIENT','2026-09-01Z'),('${workspace}','CLIENT','2026-09-02Z')`)
  t.after(() => f.db.close())
  assert.equal((await f.read()).deliverables_uploaded_at?.toISOString(), '2026-09-01T00:00:00.000Z')
  assert.equal((await f.read()).expires_at?.toISOString(), '2026-10-01T00:00:00.000Z')
  const permission = await f.db.query<{ anonymous: boolean; member: boolean; service: boolean }>(`select has_function_privilege('anon','record_portal_ready_email(uuid,uuid,timestamptz)','execute') anonymous,
    has_function_privilege('authenticated','record_portal_ready_email(uuid,uuid,timestamptz)','execute') member,
    has_function_privilege('service_role','record_portal_ready_email(uuid,uuid,timestamptz)','execute') service`)
  assert.deepEqual(permission.rows[0], { anonymous: false, member: false, service: true })
})

test('staff Drive-link release starts the same one-time clock; saving a link without release does not', async t => {
  const f=await fixture();t.after(()=>f.db.close())
  await f.db.exec("update bookings set edited_photo_link='https://drive.google.com/drive/folders/final'")
  assert.equal((await f.read()).expires_at,null)
  await f.db.exec('update bookings set edited_photo_delivered_at=clock_timestamp()')
  const first=await f.read()
  assert.ok(first.deliverables_uploaded_at)
  await f.publish(new Date().toISOString())
  await f.db.exec('update bookings set edited_photo_delivered_at=clock_timestamp()')
  assert.equal((await f.read()).expires_at?.getTime(),first.expires_at?.getTime())
})
