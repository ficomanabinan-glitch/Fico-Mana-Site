import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { INQUIRY_RATE_LIMIT, INQUIRY_RATE_WINDOW_SECONDS, resolveBookingDeviceCookie } from '../lib/inquiry-rate-limit.ts'

test('booking device identity is signed, stable, and rejects forged identifiers', async () => {
  assert.equal(INQUIRY_RATE_LIMIT, 10)
  assert.equal(INQUIRY_RATE_WINDOW_SECONDS, 3600)
  const first = await resolveBookingDeviceCookie()
  assert.equal(first.created, true)
  assert.deepEqual(await resolveBookingDeviceCookie(first.value), { ...first, created: false })
  const forged = await resolveBookingDeviceCookie(`${first.id}.${'0'.repeat(64)}`)
  assert.notEqual(forged.id, first.id)
  assert.notEqual((await resolveBookingDeviceCookie()).id, first.id)
})

test('isolated SQL burst allows exactly 10 attempts, isolates devices, and resets after one hour', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table test_clock(value timestamptz); insert into test_clock values('2026-09-17T00:00:00Z');`)
  const migration = readFileSync('supabase/migrations/20260917174500_add_inquiry_rate_limit.sql', 'utf8')
  await db.exec(migration.replace('clock_timestamp()', '(select value from test_clock)'))
  const consume = (device: string) => db.query<{ allowed: boolean; remaining: number; reset_at: Date }>(
    'select * from consume_inquiry_rate_limit($1,$2,$3)', [device, INQUIRY_RATE_LIMIT, INQUIRY_RATE_WINDOW_SECONDS])
  const burst = await Promise.all(Array.from({ length: 100 }, () => consume('device-A')))
  assert.equal(burst.filter(result => result.rows[0].allowed).length, 10)
  assert.equal(burst.filter(result => !result.rows[0].allowed).length, 90)
  assert.equal((await consume('device-B')).rows[0].allowed, true)
  await db.exec("update test_clock set value='2026-09-17T00:59:59Z'")
  assert.equal((await consume('device-A')).rows[0].allowed, false)
  await db.exec("update test_clock set value='2026-09-17T01:00:00Z'")
  assert.equal((await consume('device-A')).rows[0].remaining, 9)
  const result = await db.query<{ request_count: number }>('select request_count from inquiry_rate_limits where ip_hash=$1', ['device-A'])
  assert.equal(result.rows[0].request_count, 1)
  // PGlite queues statements on one embedded connection: this proves burst
  // accounting, not hosted PostgreSQL multi-connection lock capacity.
})
