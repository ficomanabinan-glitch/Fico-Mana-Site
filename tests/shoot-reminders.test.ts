import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { buildShootReminder } from '../lib/shoot-reminder-content.ts'

test('reminder content includes explicit response links and escapes customer-provided HTML', () => {
  const content = buildShootReminder({
    bookingId: 'TEST-1', customerName: '<script>alert(1)</script>', customerEmail: 'test@example.com',
    packageName: 'Toga & Portrait', shootDate: '2026-09-09', bookingTime: '10:00 AM', arrivalTime: '', shootTime: '', token: 'a'.repeat(64),
  }, 'day_before', 'https://www.ficomana.com')
  assert.match(content.subject, /tomorrow/)
  assert.match(content.html, /choice=confirmed/)
  assert.match(content.html, /choice=declined/)
  assert.match(content.html, /&lt;script&gt;/)
  assert.doesNotMatch(content.html, /<script>/)
  assert.match(content.html, /Toga &amp; Portrait/)
  assert.match(content.text, /Wednesday, September 9, 2026/)
  assert.match(content.text, /Arrival: 10:00 AM/)
})

test('Postgres reminder queue, attendance, access boundaries and retry behavior', async t => {
  const db = new PGlite({ extensions: { pgcrypto } })
  t.after(()=>db.close())
  await db.exec(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table workspaces(id uuid primary key,status text);
    create table bookings(id varchar primary key,workspace_id uuid,booking_date date,booking_time varchar,
      arrival_time varchar,shoot_time varchar,customer_name varchar,customer_email varchar,package_name varchar,booking_status varchar);
    create table email_logs(id bigserial primary key,booking_id varchar,recipient_email text,subject text,body text,status text);
    create table test_clock(value timestamptz);
    insert into test_clock values('2026-09-08T05:59:00+08:00');
    create function public.test_now() returns timestamptz language sql stable as $$ select value from public.test_clock $$;
    insert into workspaces values('00000000-0000-0000-0000-000000000001','active');
  `)
  // Run the real migration in an isolated Postgres engine; only the clock is substituted.
  const migration = await readFile('supabase/migrations/20260908060000_shoot_reminders_and_attendance.sql','utf8')
  await db.exec(migration.replace(/\bnow\(\)/g,'public.test_now()'))
  const query = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql,params)).rows
  const setTime = (value: string) => query('update test_clock set value=$1',[value])
  const claim = () => query('select * from claim_shoot_reminders(40)')
  const invite = async (booking: string) => (await query('select * from shoot_invitations where booking_id=$1',[booking]))[0]
  const respond = async (token: unknown, response: string) => (await query('select respond_to_shoot($1,$2,$3) as result',[token,response,'Please call me']))[0].result
  const finish = (job: Record<string,unknown>, status: string) => query('select finish_shoot_reminder($1,$2,$3,$4,$5,$6,$7)',[job.id,job.claim_token,status,'provider-test',null,'Test subject','Test body'])
  await query(`insert into bookings
    select id,'00000000-0000-0000-0000-000000000001','2026-09-09','10:00 AM','','','Test client',id||'@example.com','Toga','Confirmed'
    from unnest(array['confirmed','pending','declined','failed-first','no-first','late-decline','rescheduled','retry','expired']) as id`)

  await t.test('disabled and before-6-AM schedules send nothing', async()=> {
    assert.equal((await claim()).length,0)
    await query('update shoot_reminder_settings set enabled=true')
    assert.equal((await claim()).length,0)
  })
  let jobs: Record<string,unknown>[] = []
  await t.test('day-before email queues once and another worker cannot claim leased jobs', async()=> {
    await setTime('2026-09-08T06:00:00+08:00')
    jobs = await claim()
    assert.equal(jobs.length,9)
    assert.ok(jobs.every(job=>job.kind==='day_before'))
    assert.equal((await claim()).length,0)
    for (const job of jobs) {
      const booking = (job.payload as { bookingId: string }).bookingId
      if (booking==='no-first') await query('delete from shoot_reminder_deliveries where id=$1',[job.id])
      else if (booking==='failed-first'||booking==='retry') await finish(job,'failed')
      else await finish(job,'sent')
    }
    const job = jobs.find(j=>(j.payload as {bookingId: string}).bookingId==='confirmed')!
    await finish(job,'sent')
    assert.equal((await query('select count(*)::int as n from email_logs'))[0].n,6)
  })
  await t.test('safe retry reuses the delivery ID and immutable payload with a new claim', async()=> {
    await setTime('2026-09-08T06:05:00+08:00')
    const retries = await claim()
    const original = jobs.find(j=>(j.payload as {bookingId: string}).bookingId==='retry')!
    const retry = retries.find(j=>j.id===original.id)!
    assert.ok(retry)
    assert.deepEqual(retry.payload,original.payload)
    assert.notEqual(retry.claim_token,original.claim_token)
    await finish(original,'sent') // stale claim cannot acknowledge the new lease
    assert.equal((await query('select status from shoot_reminder_deliveries where id=$1',[original.id]))[0].status,'sending')
    for (const job of retries) await finish(job,(job.payload as {bookingId:string}).bookingId==='retry'?'sent':'failed')
  })
  await t.test('GET is read-only, POST saves attendance without cancelling the booking', async()=> {
    const first = await invite('confirmed')
    await query('select get_shoot_invitation($1)',[first.token])
    assert.equal((await invite('confirmed')).response,'pending')
    await respond(first.token,'confirmed')
    await respond((await invite('declined')).token,'declined')
    assert.equal((await invite('confirmed')).response,'confirmed')
    assert.equal((await query("select booking_status from bookings where id='declined'"))[0].booking_status,'Confirmed')
  })
  await t.test('6 AM sends only for confirmed/no response with a successfully sent first email', async()=> {
    await setTime('2026-09-09T06:00:00+08:00')
    const morning = await claim()
    assert.deepEqual(morning.map(j=>(j.payload as {bookingId:string}).bookingId).sort(),['confirmed','expired','late-decline','pending','rescheduled','retry'])
    assert.ok(morning.every(job=>job.kind==='shoot_day'))
    const late = morning.find(j=>(j.payload as {bookingId:string}).bookingId==='late-decline')!
    await respond((await invite('late-decline')).token,'declined')
    assert.equal((await query('select shoot_reminder_is_current($1,$2) as ok',[late.id,late.claim_token]))[0].ok,false)
    const pending = morning.find(j=>(j.payload as {bookingId:string}).bookingId==='pending')!
    assert.equal((await query('select shoot_reminder_is_current($1,$2) as ok',[pending.id,pending.claim_token]))[0].ok,true)
  })
  await t.test('changed schedules and expired links cannot submit old attendance', async()=> {
    const old = await invite('rescheduled')
    await query("update bookings set booking_time='11:00 AM' where id='rescheduled'")
    assert.equal((await query('select get_shoot_invitation($1) as result',[old.token]))[0].result,null)
    assert.equal(await respond(old.token,'confirmed'),null)
    await setTime('2026-09-10T00:00:00+08:00')
    assert.equal(await respond((await invite('expired')).token,'confirmed'),null)
    assert.equal((await claim()).length,0)
  })
  await t.test('admin report is workspace-scoped, excludes tokens and records decline notes', async()=> {
    const rows = await query("select list_shoot_attendance('00000000-0000-0000-0000-000000000001','2026-09-09','2026-09-09') as result")
    assert.equal(rows.length,9)
    assert.doesNotMatch(JSON.stringify(rows),/"token"/)
    assert.match(JSON.stringify(rows),/Please call me/)
    assert.equal((await query("select list_shoot_attendance('00000000-0000-0000-0000-000000000002','2026-09-09','2026-09-09')")).length,0)
  })
  await t.test('public and authenticated clients cannot enumerate invitations or run the worker', async()=> {
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(()=>query('select * from shoot_invitations'),/permission denied/)
      await assert.rejects(()=>query('select * from claim_shoot_reminders(40)'),/permission denied/)
      await db.exec('reset role')
    }
  })
})
