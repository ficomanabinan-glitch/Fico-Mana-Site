import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = readFileSync('supabase/maintenance/20260907_reset_confirmed_test_data.sql','utf8')
const list = (name: string) => [...sql.match(new RegExp(`${name} constant text\\[\\] := array\\[([\\s\\S]*?)\\]`))![1].matchAll(/'([^']+)'/g)].map(match=>match[1])
const cleared = list('cleared_tables')
const preserved = list('preserved_tables')
const workspace = '24d61bc1-d9bb-426c-bd33-668bb4fe2c43'

// All fixtures live in isolated in-memory PostgreSQL. Never contacts Supabase.
async function fixture() {
  const db = new PGlite()
  await db.exec('create schema auth; create schema storage')
  for (const name of cleared) {
    await db.exec(`create table public.${name}(id integer primary key,workspace_id uuid,status text default 'PENDING')`)
    const count = name==='bookings'||name==='clients'?116:name==='payments'?102:1
    await db.query(`insert into public.${name}(id,workspace_id) select generate_series(1,$1),$2`,[count,workspace])
  }
  for (const name of preserved) {
    if(name==='public.workspaces') {
      await db.exec('create table public.workspaces(id uuid primary key,slug text,status text)')
      await db.query("insert into public.workspaces values($1,'fico-mana','active')",[workspace])
    } else if(name==='public.shoot_reminder_settings') {
      await db.exec('create table public.shoot_reminder_settings(id integer primary key,enabled boolean); insert into public.shoot_reminder_settings values(1,false)')
    } else {
      await db.exec(`create table ${name}(id integer primary key,value text); insert into ${name} values(1,'must remain unchanged')`)
    }
  }
  await db.exec(`
    alter table public.bookings enable row level security;
    alter table public.bookings add client_id integer references public.clients(id);
    alter table public.clients add legacy_booking_id integer references public.bookings(id) on delete set null;
    alter table public.payments add booking_id integer references public.bookings(id) on delete cascade;
    update public.payments set booking_id=1;
  `)
  return db
}

test('confirmed reset clears only its explicit tables and preserves configuration, files, accounts and RLS',async t=>{
  const db=await fixture(); t.after(()=>db.close())
  const before=new Map<string,unknown>()
  for(const name of preserved) before.set(name,(await db.query(`select * from ${name}`)).rows)
  await db.exec(sql)
  for(const name of cleared) assert.deepEqual((await db.query(`select count(*)::int as n from public.${name}`)).rows,[{n:0}])
  for(const name of preserved) assert.deepEqual((await db.query(`select * from ${name}`)).rows,before.get(name))
  assert.equal((await db.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where oid='public.bookings'::regclass")).rows[0].relrowsecurity,true)
  assert.ok(!cleared.includes('packages')&&!cleared.includes('google_drive_settings')&&!cleared.includes('shoot_reminder_settings'))
})

for(const [name,change,expected] of [
  ['wrong workspace',"update public.workspaces set slug='different-studio'",/workspace differs/],
  ['new business records',`insert into public.bookings(id,workspace_id) values(117,'${workspace}')`,/records changed/],
  ['active uploads',"update public.batch_upload_jobs set status='RUNNING'",/finish active uploads/],
  ['enabled reminders','update public.shoot_reminder_settings set enabled=true',/pause reminders/],
  ['unexpected foreign keys','create table public.not_in_reset(booking_id integer references public.bookings(id))',/cannot truncate/],
] as const) {
  test(`reset refuses ${name} without a partial deletion`,async t=>{
    const db=await fixture(); t.after(()=>db.close())
    await db.exec(change)
    await assert.rejects(()=>db.exec(sql),expected)
    await db.exec('rollback')
    assert.equal((await db.query<{n:number}>('select count(*)::int as n from public.clients')).rows[0].n,116)
    assert.equal((await db.query<{n:number}>('select count(*)::int as n from public.payments')).rows[0].n,102)
  })
}
