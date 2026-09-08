import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const ws = '00000000-0000-4000-8000-000000000001'
const actor = '00000000-0000-4000-8000-000000000002'
const submitted = '2026-09-08T01:00:00Z'
async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspace_members(workspace_id uuid,user_id uuid,role text);
    create table bookings(id varchar primary key,workspace_id uuid,raw_photo_status text,raw_photo_notes text,raw_photo_submitted_at timestamptz,raw_photo_approved_at timestamptz);
    create table editing_jobs(id uuid primary key default gen_random_uuid(),workspace_id uuid,booking_id varchar,status text,downloaded_at timestamptz,editing_started_at timestamptz,delivered_at timestamptz,download_lock_expires_at timestamptz,last_error text,updated_at timestamptz);
    create table photo_selections(id uuid primary key default gen_random_uuid(),workspace_id uuid,booking_id varchar,status text,client_status text,raw_reset_id uuid,no_revision_acknowledged boolean default true,no_revision_acknowledged_at timestamptz,reopened_at timestamptz,version int default 1,updated_at timestamptz);
    create table workflow_audit_logs(workspace_id uuid,actor_type text,actor_id text,action text,booking_id varchar,metadata jsonb);
    create table google_drive_settings(id integer,workspace_id uuid,portal_expiry_days integer);
    create table client_portals(id uuid primary key default gen_random_uuid(),public_id uuid default gen_random_uuid(),workspace_id uuid,booking_id varchar,status text,expires_at timestamptz,first_download_at timestamptz,access_email_sent_at timestamptz,download_expiry_days integer,updated_at timestamptz);
    create table deliverable_files(workspace_id uuid,booking_id varchar);
    create table batch_upload_items(editing_job_id uuid,booking_id varchar);
    insert into workspace_members values('${ws}','${actor}','editor');
    insert into bookings values('ONE','${ws}','Pending Review',null,'${submitted}',null);
    insert into editing_jobs(workspace_id,booking_id,status) values('${ws}','ONE','WAITING_FOR_SELECTION');
    insert into photo_selections(workspace_id,booking_id,status,client_status) values('${ws}','ONE','SUBMITTED','Submitted');
    insert into google_drive_settings values(1,'${ws}',30);
    insert into client_portals(workspace_id,booking_id,status,expires_at,access_email_sent_at,download_expiry_days,updated_at) values('${ws}','ONE','disabled',now()-interval '1 day',now()-interval '31 days',30,now());
  `)
  await db.exec(readFileSync('supabase/migrations/20260908014747_manual_selection_review.sql','utf8'))
  await db.exec(readFileSync('supabase/migrations/20260908185549_approved_selection_reopen.sql','utf8'))
  await db.exec(readFileSync('supabase/migrations/20260908203450_fix_selection_review_upload_guard.sql','utf8'))
  const review = (action: string, workspace = ws, date = submitted) => db.query<{ result: {changed: boolean} }>(
    'select review_portal_selection($1,$2,$3,$4,$5,$6) result', [workspace,'ONE',actor,action,date,'Please choose a sharper photo.'])
  return { db, review }
}

test('approved selection can be atomically reopened before editing without starting the download countdown',async t => {
  const f = await fixture(); t.after(() => f.db.close())
  assert.equal((await f.review('Approve')).rows[0].result.changed,true)
  assert.deepEqual((await f.db.query('select status from editing_jobs')).rows,[{status:'READY_FOR_EDITING'}])
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Approved'}])
  assert.equal((await f.review('Approve')).rows[0].result.changed,false)
  assert.equal((await f.review('Reopen')).rows[0].result.changed,true)
  assert.deepEqual((await f.db.query('select status,version,no_revision_acknowledged from photo_selections')).rows,
    [{status:'OPEN',version:2,no_revision_acknowledged:false}])
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Reopened'}])
  assert.deepEqual((await f.db.query('select status from editing_jobs')).rows,[{status:'WAITING_FOR_SELECTION'}])
  const portal=(await f.db.query<{status:string;expires_at:string|null;first_download_at:string|null}>('select status,expires_at,first_download_at from client_portals')).rows[0]
  assert.deepEqual(portal,{status:'active',expires_at:null,first_download_at:null})
  assert.equal((await f.review('Reopen')).rows[0].result.changed,false)
  assert.equal((await f.db.query('select * from workflow_audit_logs')).rows.length,2)
})
test('rejection atomically reopens choices, clears acknowledgement and increments draft revision once',async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.review('Reject'); await f.review('Reject')
  assert.deepEqual((await f.db.query('select status,version,no_revision_acknowledged from photo_selections')).rows,
    [{status:'OPEN',version:2,no_revision_acknowledged:false}])
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Rejected'}])
  assert.deepEqual((await f.db.query('select status from editing_jobs')).rows,[{status:'WAITING_FOR_SELECTION'}])
  await assert.rejects(f.review('Approve'),/not pending review/)
})
test('stale review, other workspace, invalid actions and public execution cannot mutate selection',async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await assert.rejects(f.review('Approve',ws,'2026-09-08T02:00:00Z'),/Selection changed/)
  await assert.rejects(f.review('Approve',actor),/not authorized/)
  await assert.rejects(f.review('Invalid'),/Invalid review/)
  await f.db.exec('set role anon')
  await assert.rejects(f.review('Approve'),/permission denied/)
  await f.db.exec('reset role')
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Pending Review'}])
})
test('failed audit rolls back the whole review, and downloads already underway cannot be rejected',async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.db.exec("alter table workflow_audit_logs add constraint reject_all check (action='IMPOSSIBLE')")
  await assert.rejects(f.review('Approve'),/reject_all/)
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Pending Review'}])
  await f.db.exec("update editing_jobs set download_lock_expires_at=now()+interval '1 hour'")
  await assert.rejects(f.review('Reject'),/already started/)
})

test('reopen is blocked after download begins and preserves the approved selection',async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.review('Approve')
  await f.db.exec("update editing_jobs set downloaded_at=now(),status='DOWNLOADED'; update client_portals set first_download_at=now(),expires_at=now()+interval '30 days'")
  await assert.rejects(f.review('Reopen'),/already started/)
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Approved'}])
  assert.deepEqual((await f.db.query('select status,version from photo_selections')).rows,[{status:'SUBMITTED',version:1}])
  assert.deepEqual((await f.db.query('select status from editing_jobs')).rows,[{status:'DOWNLOADED'}])
})

test('existing batch upload items block reopen through the workspace-scoped editing job',async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.review('Approve')
  await f.db.exec("insert into batch_upload_items select id,booking_id from editing_jobs")
  await assert.rejects(f.review('Reopen'),/already started/)
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Approved'}])
})

test('a missing client portal rolls back every reopen change',async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.review('Approve')
  await f.db.exec('delete from client_portals')
  await assert.rejects(f.review('Reopen'),/Client Portal not found/)
  assert.deepEqual((await f.db.query('select raw_photo_status from bookings')).rows,[{raw_photo_status:'Approved'}])
  assert.deepEqual((await f.db.query('select status,version from photo_selections')).rows,[{status:'SUBMITTED',version:1}])
  assert.deepEqual((await f.db.query('select status from editing_jobs')).rows,[{status:'READY_FOR_EDITING'}])
  assert.equal((await f.db.query("select * from workflow_audit_logs where action='SELECTION_REOPENED'")).rows.length,0)
})
