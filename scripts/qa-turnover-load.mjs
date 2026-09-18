import { performance } from 'node:perf_hooks'
import { mkdir, writeFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3200'
const parsedBase = new URL(base)
if (!['127.0.0.1', 'localhost'].includes(parsedBase.hostname)) {
  throw new Error('Turnover load test is local-only. Production and shared environments are prohibited.')
}

const percentile = (values, value) => {
  const sorted = [...values].sort((left, right) => left - right)
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)] || 0)
}

async function databaseBenchmark() {
  const db = new PGlite()
  try {
    await db.exec(`
      create table bookings (
        id text primary key, customer_name text not null, booking_date date not null,
        booking_status text not null, created_at timestamptz not null default now()
      );
      create table client_portals (
        id uuid primary key, booking_id text not null references bookings(id), public_id uuid not null unique,
        status text not null, expires_at timestamptz
      );
      create index client_portals_booking_id_idx on client_portals(booking_id);
      create table gallery_files (
        id uuid primary key, booking_id text not null references bookings(id), file_name text not null,
        storage_status text not null, created_at timestamptz not null default now()
      );
      create index gallery_files_booking_created_idx on gallery_files(booking_id, created_at desc);
    `)
    const bookingRows = []
    const portalRows = []
    const galleryRows = []
    for (let user = 1; user <= 100; user++) {
      const suffix = String(user).padStart(3, '0')
      bookingRows.push(`('QA-${suffix}','Synthetic Client ${suffix}','2026-09-18','Confirmed')`)
      portalRows.push(`('00000000-0000-4000-8000-${String(user).padStart(12, '0')}','QA-${suffix}','10000000-0000-4000-8000-${String(user).padStart(12, '0')}','active')`)
      for (let photo = 1; photo <= 150; photo++) {
        const id = user * 1000 + photo
        galleryRows.push(`('20000000-0000-4000-${String(user).padStart(4, '0')}-${String(id).padStart(12, '0')}','QA-${suffix}','PHOTO-${String(photo).padStart(3, '0')}.JPG','available')`)
      }
    }
    await db.exec(`insert into bookings(id,customer_name,booking_date,booking_status) values ${bookingRows.join(',')};`)
    await db.exec(`insert into client_portals(id,booking_id,public_id,status) values ${portalRows.join(',')};`)
    for (let offset = 0; offset < galleryRows.length; offset += 1000) {
      await db.exec(`insert into gallery_files(id,booking_id,file_name,storage_status) values ${galleryRows.slice(offset, offset + 1000).join(',')};`)
    }

    const latencies = []
    const start = performance.now()
    for (let user = 1; user <= 100; user++) {
      const requestStart = performance.now()
      const suffix = String(user).padStart(3, '0')
      const result = await db.query(`
        select b.id, b.customer_name, p.public_id,
          (select json_agg(g order by g.created_at desc) from (
            select id,file_name,created_at from gallery_files
            where booking_id=b.id and storage_status='available'
            order by created_at desc limit 48
          ) g) as gallery
        from bookings b join client_portals p on p.booking_id=b.id
        where b.id=$1 and p.status='active'
      `, [`QA-${suffix}`])
      if (result.rows.length !== 1 || result.rows[0].gallery.length !== 48) throw new Error(`Synthetic portal ${suffix} was incomplete.`)
      latencies.push(performance.now() - requestStart)
    }
    const elapsedMs = performance.now() - start
    return {
      users: 100,
      bookings: 100,
      photos: 15000,
      pageSize: 48,
      errors: 0,
      p50Ms: percentile(latencies, .50),
      p95Ms: percentile(latencies, .95),
      p99Ms: percentile(latencies, .99),
      elapsedMs: Math.round(elapsedMs),
    }
  } finally {
    await db.close()
  }
}

async function httpBenchmark() {
  const journeys = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    paths: ['/', '/packages', `/portal/sample?booking=QA-${String(index + 1).padStart(3, '0')}`],
  }))
  for (const path of journeys[0].paths) {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30000) })
    await response.arrayBuffer()
    if (!response.ok) throw new Error(`Warmup failed: ${path} ${response.status}`)
  }

  const latencies = []
  let errors = 0
  const start = performance.now()
  await Promise.all(journeys.map(async (journey) => {
    for (const path of journey.paths) {
      const requestStart = performance.now()
      try {
        const response = await fetch(`${base}${path}`, {
          headers: { 'x-qa-synthetic-user': String(journey.id) },
          signal: AbortSignal.timeout(15000),
        })
        await response.arrayBuffer()
        if (!response.ok) errors++
      } catch {
        errors++
      }
      latencies.push(performance.now() - requestStart)
    }
  }))
  const elapsedMs = performance.now() - start
  return {
    virtualUsers: journeys.length,
    requests: latencies.length,
    errors,
    errorRate: errors / latencies.length,
    p50Ms: percentile(latencies, .50),
    p95Ms: percentile(latencies, .95),
    p99Ms: percentile(latencies, .99),
    requestsPerSecond: Math.round(latencies.length / (elapsedMs / 1000)),
    elapsedMs: Math.round(elapsedMs),
  }
}

const database = await databaseBenchmark()
const http = await httpBenchmark()
const budgets = {
  databaseP95Ms: 100,
  httpP95Ms: 1500,
  httpP99Ms: 3000,
  httpErrorRate: .01,
}
const passed = database.p95Ms < budgets.databaseP95Ms && http.p95Ms < budgets.httpP95Ms &&
  http.p99Ms < budgets.httpP99Ms && http.errorRate < budgets.httpErrorRate
const report = {
  scope: 'Isolated local turnover test. Synthetic PGlite database: 100 bookings, 100 portals, 15,000 gallery records. Local Next server: 100 concurrent browsing/package/portal journeys. No production traffic or client data.',
  createdAt: new Date().toISOString(),
  budgets,
  passed,
  database,
  http,
}
console.log(JSON.stringify(report, null, 2))
await mkdir('artifacts/qa', { recursive: true })
await writeFile('artifacts/qa/turnover-load-100-users.json', JSON.stringify(report, null, 2))
if (!passed) process.exitCode = 1
