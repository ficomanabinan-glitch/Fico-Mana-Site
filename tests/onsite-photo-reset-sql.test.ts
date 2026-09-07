import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const ws='00000000-0000-4000-8000-000000000001', actor='00000000-0000-4000-8000-000000000002'
const selection='00000000-0000-4000-8000-000000000003', gallery='00000000-0000-4000-8000-000000000004'
const migration=readFileSync('supabase/migrations/20260907170658_onsite_photo_reset.sql','utf8')
async function fixture() {
  const db=new PGlite()
  // Isolated PostgreSQL, matching the columns and FK behavior touched by the real migration.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key);
    create table bookings(id varchar primary key,workspace_id uuid,client_id uuid,price numeric default 6500,
      raw_photo_status text,raw_photo_link text,raw_photo_submitted_at timestamptz,raw_photo_approved_at timestamptz);
    create table payments(id uuid primary key default gen_random_uuid(),booking_id varchar,amount numeric);
    create table photo_selections(id uuid primary key,workspace_id uuid,booking_id varchar unique,status text default 'COPY_FAILED',
      required_count integer default 5,client_status text default 'Not Started',submitted_at timestamptz,
      no_revision_acknowledged boolean default true,no_revision_acknowledged_at timestamptz,total_addon_amount numeric default 400,
      version integer default 1,reopened_at timestamptz,updated_at timestamptz);
    create table gallery_files(id uuid primary key default gen_random_uuid(),workspace_id uuid,booking_id varchar,client_id uuid,
      drive_file_id text,file_name text,mime_type text,file_size bigint,checksum text,thumbnail_reference text,preview_reference text,
      unique(workspace_id,drive_file_id));
    create table photo_selection_items(selection_id uuid references photo_selections(id),gallery_file_id uuid references gallery_files(id) on delete restrict);
    create table print_allocations(selection_id uuid references photo_selections(id),gallery_file_id uuid references gallery_files(id) on delete restrict);
    create table client_addon_orders(selection_id uuid references photo_selections(id));
    create table editing_jobs(id uuid primary key default gen_random_uuid(),workspace_id uuid,booking_id varchar,status text default 'WAITING_FOR_SELECTION',
      selected_count integer default 1,expected_output_count integer default 5,downloaded_at timestamptz,editing_started_at timestamptz,
      delivered_at timestamptz,download_lock_expires_at timestamptz,last_error text,updated_at timestamptz);
    create table deliverable_files(booking_id varchar); create table batch_upload_items(booking_id varchar);
    create table workflow_audit_logs(workspace_id uuid,actor_type text,actor_id text,action text,booking_id varchar,metadata jsonb);
    insert into workspaces values('${ws}');
    insert into bookings(id,workspace_id,client_id) values('ONE','${ws}','${actor}'),('TWO','${ws}','${actor}');
    insert into payments(booking_id,amount) values('ONE',500);
    insert into photo_selections(id,workspace_id,booking_id) values('${selection}','${ws}','ONE'),(gen_random_uuid(),'${ws}','TWO');
    insert into editing_jobs(workspace_id,booking_id,last_error) values('${ws}','ONE','The original photo missing.JPG is no longer available. Try: restore it.'),('${ws}','TWO',null);
    insert into gallery_files(id,workspace_id,booking_id,client_id,drive_file_id,file_name) values('${gallery}','${ws}','ONE','${actor}','old-photo','old.JPG');
    insert into gallery_files(workspace_id,booking_id,client_id,drive_file_id,file_name) values('${ws}','TWO','${actor}','other-photo','other.JPG');
    insert into photo_selection_items values('${selection}','${gallery}'); insert into print_allocations values('${selection}','${gallery}');
    insert into client_addon_orders values('${selection}');
  `)
  await db.exec(migration)
  const begin = async (targets: unknown[] = []) => (await db.query<{id:string}>('select begin_onsite_photo_reset($1,$2,$3,$4,$5,$6) id',[ws,'ONE',actor,0,[gallery],JSON.stringify(targets)])).rows[0].id
  const finish = (id:string) => db.query('select finish_onsite_photo_reset($1,$2,$3)',[ws,'ONE',id])
  const sync = (rows:unknown[]=[], generation=0, ids=[gallery]) => db.query<{result:{removed:number;warning:string|null}}>('select sync_onsite_photo_index($1,$2,$3,$4,$5,$6) result',[ws,'ONE',actor,generation,ids,JSON.stringify(rows)])
  return {db,begin,finish,sync}
}

test('reset migration is additive; zero remaining Drive files still clears stale index and choices without touching payments or another client',async t=>{
  const f=await fixture();t.after(()=>f.db.close())
  assert.equal((await f.db.query('select * from gallery_files')).rows.length,2)
  const id=await f.begin();await f.finish(id);await f.finish(id)
  assert.deepEqual((await f.db.query('select booking_id from gallery_files')).rows,[{booking_id:'TWO'}])
  for(const table of ['photo_selection_items','print_allocations','client_addon_orders'])assert.equal((await f.db.query(`select * from ${table}`)).rows.length,0)
  const s=(await f.db.query<any>(`select * from photo_selections where id='${selection}'`)).rows[0]
  assert.equal(s.status,'OPEN');assert.equal(s.total_addon_amount,'0');assert.equal(s.raw_upload_generation,1);assert.equal(s.version,2);assert.ok(s.reopened_at);assert.equal(s.raw_reset_id,null)
  assert.deepEqual((await f.db.query("select price from bookings where id='ONE'")).rows,[{price:'6500'}])
  assert.deepEqual((await f.db.query('select amount from payments')).rows,[{amount:'500'}])
})

test('reset blocks old uploads, sync and incomplete finalization; completion progress is a union across retries',async t=>{
  const f=await fixture();t.after(()=>f.db.close())
  const id=await f.begin([{id:'a'},{id:'b'}]);assert.equal(await f.begin(),id)
  await assert.rejects(f.finish(id),/not been cleared/)
  await assert.rejects(f.sync(),/Photos changed/)
  await assert.rejects(f.db.exec("update gallery_files set file_name='late.JPG' where booking_id='ONE'"),/uploads changed/)
  await f.db.query('select record_onsite_photo_reset_progress($1,$2,$3,$4)',[ws,'ONE',id,['a']])
  await assert.rejects(f.db.query('select record_onsite_photo_reset_progress($1,$2,$3,$4)',[ws,'ONE',id,['unrelated']]),/Invalid reset target/)
  await f.db.query('select record_onsite_photo_reset_progress($1,$2,$3,$4)',[ws,'ONE',id,['b']])
  await f.finish(id)
  await assert.rejects(f.db.exec(`insert into gallery_files(workspace_id,booking_id,client_id,drive_file_id,file_name,upload_generation) values('${ws}','ONE','${actor}','late','late.JPG',0)`),/uploads changed/)
  await f.db.exec(`insert into gallery_files(workspace_id,booking_id,client_id,drive_file_id,file_name,upload_generation) values('${ws}','ONE','${actor}','fresh','fresh.JPG',1)`)
})

test('sync removes stale records atomically, resets incomplete choices, and is idempotent with an empty folder',async t=>{
  const f=await fixture();t.after(()=>f.db.close())
  assert.equal((await f.sync()).rows[0].result.removed,1)
  assert.equal((await f.sync([],0,[])).rows[0].result.removed,0)
  assert.equal((await f.db.query<{last_error:string|null}>("select last_error from editing_jobs where booking_id='ONE'")).rows[0].last_error,null)
  assert.equal((await f.db.query('select * from payments')).rows.length,1)
})

test('healthy sync preserves choices, prices, reopening revision and stored thumbnail; untrusted client fields cannot move ownership',async t=>{
  const f=await fixture();t.after(()=>f.db.close())
  await f.db.query('update gallery_files set thumbnail_reference=$1 where id=$2',[`${ws}/ONE/thumb.jpg`,gallery])
  await f.sync([{drive_file_id:'old-photo',file_name:'old.JPG',mime_type:'image/jpeg',thumbnail_reference:'https://provider/new',booking_id:'TWO',workspace_id:actor,client_id:ws}])
  assert.equal((await f.db.query('select * from photo_selection_items')).rows.length,1)
  assert.equal((await f.db.query<{reopened_at:string|null}>('select reopened_at from photo_selections where id=$1',[selection])).rows[0].reopened_at,null)
  const g=(await f.db.query<any>('select * from gallery_files where id=$1',[gallery])).rows[0]
  assert.equal(g.booking_id,'ONE');assert.equal(g.client_id,actor);assert.equal(g.thumbnail_reference,`${ws}/ONE/thumb.jpg`)
  await assert.rejects(f.sync([{drive_file_id:'other-photo',file_name:'other.JPG'}]),/another client/)
})

for(const [label,change] of [
  ['submitted selection',"update photo_selections set status='SUBMITTED' where booking_id='ONE'"],
  ['editing underway',"update editing_jobs set status='EDITING' where booking_id='ONE'"],
  ['download history',"update editing_jobs set downloaded_at=now() where booking_id='ONE'"],
  ['download in progress',"update editing_jobs set download_lock_expires_at=now()+interval '1 hour' where booking_id='ONE'"],
  ['edited deliverables',"insert into deliverable_files values('ONE')"],
  ['batch uploads',"insert into batch_upload_items values('ONE')"],
] as const)test(`deletion refuses ${label}; sync preserves locked history and reports the missing original`,async t=>{
  const f=await fixture();t.after(()=>f.db.close());await f.db.exec(change)
  await assert.rejects(f.begin(),/Editing has already started/)
  const result=(await f.sync()).rows[0].result
  assert.equal(result.removed,0);assert.match(result.warning!,/protected/)
  assert.equal((await f.db.query('select * from gallery_files')).rows.length,2)
})

test('changed index snapshots abort both operations without partial changes; public roles cannot call reset or reconciliation',async t=>{
  const f=await fixture();t.after(()=>f.db.close())
  await assert.rejects(f.sync([],0,[]),/Uploads changed/)
  await f.db.exec(`insert into gallery_files(workspace_id,booking_id,drive_file_id,file_name) values('${ws}','ONE','new','new.JPG')`)
  await assert.rejects(f.begin(),/Uploads changed/)
  for(const role of ['anon','authenticated']){
    await f.db.exec(`set role ${role}`)
    await assert.rejects(f.begin(),/permission denied/)
    await assert.rejects(f.sync(),/permission denied/)
    await assert.rejects(f.db.query('select * from onsite_photo_resets'),/permission denied/)
    await f.db.exec('reset role')
  }
})
