import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import archiver from 'archiver'
import { PGlite } from '@electric-sql/pglite'
import { portalExpiryNotice } from '../lib/portal-expiry.ts'
import { trackCompletedPortalDownload } from '../lib/portal-download-stream.ts'
import { loadTs } from './helpers/load-ts.ts'

const workspace = '00000000-0000-4000-8000-000000000001'
const publicId = '00000000-0000-4000-8000-000000000002'
const other = '00000000-0000-4000-8000-000000000003'
const migration = readFileSync('supabase/migrations/20260908073000_portal_first_download_expiry.sql', 'utf8')

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key,slug text,status text);
    create table bookings(id varchar primary key,workspace_id uuid);
    create table client_portals(id uuid primary key default gen_random_uuid(),public_id uuid,booking_id varchar,workspace_id uuid,
      status text default 'active',expires_at timestamptz,updated_at timestamptz);
    create table google_drive_settings(id integer,workspace_id uuid,portal_expiry_days integer);
    create table deliverable_files(workspace_id uuid,booking_id varchar);
    create table photo_selections(workspace_id uuid,booking_id varchar,raw_reset_id uuid);
    create table provisioning_audit(booking_id varchar,action text,actor_type text,metadata jsonb);
    insert into workspaces values('${workspace}','fico-mana','active');
    insert into bookings values('CLIENT','${workspace}');
    insert into google_drive_settings values(1,'${workspace}',30);
    insert into deliverable_files values('${workspace}','CLIENT');
    insert into client_portals(public_id,booking_id,workspace_id,expires_at) values('${publicId}','CLIENT','${workspace}',now()+interval '10 days');
    insert into client_portals(public_id,booking_id,workspace_id,status,expires_at) values
      (gen_random_uuid(),'DISABLED','${workspace}','disabled',now()+interval '10 days'),
      (gen_random_uuid(),'EXPIRED','${workspace}','active',now()-interval '1 day');
  `)
  await db.exec(migration)
  const read = async () => (await db.query<any>("select * from client_portals where booking_id='CLIENT'")).rows[0]
  const download = async (ws=workspace,id=publicId) => (await db.query<any>('select record_portal_first_download($1,$2) result', [ws,id])).rows[0].result
  return { db, read, download }
}

test('migration removes only active future legacy deadlines, preserves closed links, and records no fabricated first download', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  assert.equal((await f.read()).expires_at,null)
  assert.equal((await f.read()).first_download_at,null)
  assert.equal((await f.db.query("select * from client_portals where booking_id in ('DISABLED','EXPIRED') and expires_at is not null")).rows.length,2)
  const audit = (await f.db.query<any>('select * from provisioning_audit')).rows
  assert.equal(audit.length,1); assert.ok(audit[0].metadata.previousExpiresAt)
  await f.db.exec(migration)
  assert.equal((await f.db.query('select * from provisioning_audit')).rows.length,1)
})

test('first download uses configured days exactly once across concurrent/repeated downloads; settings edits do not extend it', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.db.exec('update google_drive_settings set portal_expiry_days=45')
  const [first,second] = await Promise.all([f.download(),f.download()])
  assert.deepEqual(first,second)
  assert.equal(first.days,45)
  assert.equal(Date.parse(first.expiresAt)-Date.parse(first.firstDownloadAt),45*86_400_000)
  await f.db.exec('update google_drive_settings set portal_expiry_days=365')
  assert.deepEqual(await f.download(),first)
  assert.equal((await f.db.query("select * from provisioning_audit where action='portal_first_download'")).rows.length,1)
  await f.db.exec(migration)
  assert.deepEqual(await f.download(),first,'Reinstalling migration cannot reset a started timer')
})

test('default duration is 30 days, invalid duration fails without starting a timer', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  await f.db.exec('update google_drive_settings set portal_expiry_days=0')
  await assert.rejects(f.download(),/expiry setting is invalid/)
  assert.equal((await f.read()).first_download_at,null)
  await f.db.exec('delete from google_drive_settings')
  assert.equal((await f.download()).days,30)
})

test('first-download function is service-only and denies invalid, closed, foreign, empty and resetting portals', async t => {
  const f = await fixture(); t.after(() => f.db.close())
  const permissions = (await f.db.query<any>(`select
    has_function_privilege('anon','record_portal_first_download(uuid,uuid)','execute') anon,
    has_function_privilege('authenticated','record_portal_first_download(uuid,uuid)','execute') member,
    has_function_privilege('service_role','record_portal_first_download(uuid,uuid)','execute') service`)).rows[0]
  assert.deepEqual(permissions,{anon:false,member:false,service:true})
  await assert.rejects(f.download(other),/unavailable/)
  await assert.rejects(f.download(workspace,other),/unavailable/)
  for (const patch of ["status='disabled'","status='expired'","expires_at=now()-interval '1 second'"]) {
    await f.db.exec(`update client_portals set ${patch} where booking_id='CLIENT'`)
    await assert.rejects(f.download(),/unavailable/)
    await f.db.exec("update client_portals set status='active',expires_at=null where booking_id='CLIENT'")
  }
  await f.db.exec("update workspaces set status='suspended'")
  await assert.rejects(f.download(),/unavailable/)
  await f.db.exec("update workspaces set status='active'; delete from deliverable_files")
  await assert.rejects(f.download(),/No delivered photos/)
  await f.db.exec(`insert into deliverable_files values('${workspace}','CLIENT'); insert into photo_selections values('${workspace}','CLIENT','${other}')`)
  await assert.rejects(f.download(),/being updated/)
  assert.equal((await f.read()).first_download_at,null)
})

test('download stream waits for durable completion and rejects failed persistence', async () => {
  let records=0, release:()=>void=()=>{}
  const body = new Response('sample ZIP').body!
  const result = new Response(trackCompletedPortalDownload(body,async()=>{records++;await new Promise<void>(resolve=>{release=resolve})})).text()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(records,1)
  let finished=false; void result.then(()=>{finished=true})
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false)
  release();assert.equal(await result,'sample ZIP')
  await assert.rejects(new Response(trackCompletedPortalDownload(new Response('zip').body!,async()=>{throw new Error('database unavailable')})).text(),/database unavailable/)
})

test('cancelled and failed download streams do not start the countdown', async () => {
  let records=0,cancelled=false
  const source = new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]))},cancel(){cancelled=true}})
  const reader=trackCompletedPortalDownload(source,async()=>{records++}).getReader()
  await reader.read();await reader.cancel();await new Promise(resolve=>setImmediate(resolve));assert.equal(records,0);assert.equal(cancelled,true)
  const failed=new ReadableStream({start(controller){controller.error(new Error('Drive unavailable'))}})
  await assert.rejects(new Response(trackCompletedPortalDownload(failed,async()=>{records++})).text(),/Drive unavailable/)
  assert.equal(records,0)
})

test('actual portal ZIP route tracks only nonempty completed client downloads, never previews', async () => {
  let records=0, available=true, driveFailed=false
  const code=loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts',{
    archiver,'next/server':{NextResponse:{json:Response.json}},
    '@/lib/selection-review':{SelectionReviewError:class SelectionReviewError extends Error{},reviewSelection:async()=>({success:true})},
    '@/lib/portal-download-stream':{trackCompletedPortalDownload},
    '@/lib/editor-workflow':{
      preparePortalDeliverables:async()=>available?[{name:'sample.JPG',driveFileId:'synthetic-photo'}]:[],
      recordPortalFirstDownload:async(id:string)=>{assert.equal(id,publicId);records++},
      getPortalFile:async()=>({data:new Uint8Array([1]),mimeType:'image/jpeg',etag:'sample',fileName:'sample.JPG'}),
    },
    '@/lib/google-drive':{openDriveFile:async()=>{if(driveFailed)throw new Error('Synthetic Drive failure');return new Response('synthetic photo bytes')}},
    '@/lib/security/api-rate-limit':{API_RATE_LIMITS:{},enforceApiRateLimit:async()=>null},
    '@/lib/package-workflow':{},'@/lib/auth-api':{},'@/lib/auth/workflow':{},
    '@/lib/security/file-validation':{},'@/lib/security/schemas':{},'@/lib/security/security-audit':{},
    '@/lib/security/upload-scanner':{},'@/lib/security/request-security':{},
    '@/lib/raw-upload-server':{},'@/lib/raw-upload-contract':{},'@/lib/onsite-photo-reset':{},
  })
  const request=(suffix:string)=>{
    const url=new URL(`https://www.ficomana.com/api/editor-workflow/portal/${publicId}/${suffix}`)
    return code.GET(Object.assign(new Request(url),{nextUrl:url}) as never,{params:Promise.resolve({path:['portal',publicId,...url.pathname.split('/').slice(5)]})})
  }
  const preview=await request('file/file-id?kind=deliverable');await preview.arrayBuffer();assert.equal(records,0)
  const zip=await request('deliverables.zip');assert.equal(zip.status,200)
  const bytes=new Uint8Array(await zip.arrayBuffer());assert.deepEqual([...bytes.slice(0,2)],[80,75]);assert.equal(records,1)
  available=false;assert.equal((await request('deliverables.zip')).status,404);assert.equal(records,1)
  available=true;driveFailed=true
  await assert.rejects((await request('deliverables.zip')).arrayBuffer(),/Synthetic Drive failure/)
  assert.equal(records,1)
})

test('notice shows the final-delivery start rule and the exact GMT+8 deadline afterwards', () => {
  assert.match(portalExpiryNotice({days:45,portalReadyEmailSentAt:null,expiresAt:null}),/45-day portal access period begins when FICO MANA releases/)
  const first='2026-09-08T00:00:00Z',end='2026-10-08T00:00:00Z'
  const notice=portalExpiryNotice({days:30,portalReadyEmailSentAt:first,expiresAt:end},Date.parse(first))
  assert.match(notice,/October 8, 2026/);assert.match(notice,/8:00/);assert.match(notice,/GMT\+8/);assert.match(notice,/30 days remaining/)
  assert.match(portalExpiryNotice({days:30,portalReadyEmailSentAt:first,expiresAt:end},Date.parse(end)),/expired/)
})

test('delivery expiry uses one database trigger instead of competing application timers', () => {
  for(const file of ['lib/editor-workflow.ts','lib/booking-provisioning.ts','app/api/bookings/[id]/deliver-edited-photos/route.ts']) {
    assert.doesNotMatch(readFileSync(file,'utf8'),/setPortalExpiryFromDelivery/)
  }
  const page=readFileSync('app/portal/[id]/page.tsx','utf8')
  assert.match(page,/<PortalExpiryNotice expiry=\{data.expiry\}/)
  assert.match(readFileSync('supabase/migrations/20260909010816_portal_final_delivery_expiry.sql','utf8'),/create trigger start_portal_expiry_on_delivery after insert or update of published_at/)
  assert.match(readFileSync('components/client-photo-selection.tsx','utf8'),/Selection submitted and locked/)
  assert.match(readFileSync('app/admin/provisioning/page.tsx','utf8'),/<tr key=\{item.bookingId\} className="align-middle/)
})
