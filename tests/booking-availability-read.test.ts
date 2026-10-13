import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)
type Row = Record<string, unknown>
const packageRow = { id: 'synthetic-standard', slot_type: 'standard', category: 'graduation', title: 'Synthetic package', price: '1000', price_amount: 1000, selection_limit: 3, is_active: true }
const incoming = {
  id: 'FM-SYNTHETIC', customerName: 'Synthetic Client', customerEmail: 'synthetic@example.test', customerPhone: '09123456789',
  customerFbLink: '', customerFbName: '', packageId: packageRow.id, packageName: packageRow.title,
  bookingDate: '2026-10-20', bookingTime: '8:00 AM', price: 1000, depositAmount: 0,
  bookingStatus: 'Confirmed', paymentStatus: 'Unpaid', createdAt: '2026-10-13T00:00:00Z', paymentHistory: [],
}

function harness(options: { failure?: string; nullData?: string; throwTable?: string; bookings?: Row[]; packages?: Row[]; cap?: number; failedPage?: number; noAdmin?: boolean; configured?: boolean; selectedPackageFailure?: boolean; selectedPackageThrows?: boolean; missingPackage?: boolean; count?: number | null; emptyPage?: boolean; repeatPage?: boolean; changingCount?: boolean } = {}) {
  let writes = 0
  const queries: { table: string; from: number; to: number; order: string }[] = []
  const admin = { from(table: string) {
    let from = 0, to = 999, order = '', single = false, counted = false
    let mutation: Row | null = null
    const query = {
      select(_fields?: string, settings?: { count?: string }) { counted = settings?.count === 'exact'; return query }, eq() { return query },
      upsert(row: Row) { mutation = row; if (table === 'bookings') writes++; return query },
      insert(row: Row) { mutation = row; return query },
      order(column: string) { order = column; return query },
      range(start: number, end: number) { from = start; to = end; return query },
      maybeSingle() { single = true; return query },
      single() { single = true; return query },
      then(onfulfilled: (value: unknown) => unknown, onrejected?: (error: unknown) => unknown) {
        const run = async () => {
          if (single) {
            if (mutation) return { data: mutation, error: null }
            if (table === 'bookings') return { data: null, error: null }
            if (options.selectedPackageThrows) throw new Error('Synthetic package transport failure')
            return { data: options.missingPackage ? null : packageRow, error: options.selectedPackageFailure ? { message: 'Synthetic package read failure' } : null }
          }
          queries.push({ table, from, to, order })
          if (options.throwTable === table) throw new Error('Synthetic transport failure')
          if (options.failure === table || (table === 'bookings' && from >= (options.failedPage ?? Infinity))) return { data: null, error: { message: 'Synthetic DB failure' }, count: null }
          const rows = table === 'bookings' ? options.bookings ?? [] : options.packages ?? [packageRow]
          const offset = options.repeatPage ? 0 : from
          return { data: options.nullData === table ? null : options.emptyPage ? [] : rows.slice(offset, Math.min(offset + to - from + 1, offset + (options.cap ?? 1000))), error: null, count: !counted ? null : Object.hasOwn(options, 'count') ? options.count : rows.length + (options.changingCount && from > 0 ? 1 : 0) }
        }
        return run().then(onfulfilled, onrejected)
      },
    }
    return query
  } }
  const stubs: Record<string, unknown> = {
    '@/lib/supabase': { isSupabaseConfigured: () => options.configured !== false },
    '@/lib/supabase/env': { isSupabaseConfigured: () => options.configured !== false },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => options.noAdmin ? null : admin },
    '@/lib/supabase/server': { getAdminAuthContext: async () => ({ user: { id: 'synthetic-staff' } }) },
    '@/lib/auth/workflow': {},
    '@/lib/server-store': { listBookings: async () => [], getBookingById: async () => null, upsertBooking: async () => { writes++ }, addServerNotification: async () => {} },
    '@/lib/server-blocked-slots': { listBlockedSlots: async () => [] },
    '@/lib/server-fico-spot-blocks': { listFicoSpotBlocks: async () => [] },
    '@/lib/db-sync': { loadSyncedBookings: async () => [] },
    '@/lib/email': {},
    '@/lib/booking-provisioning': { provisionBookingResources: async () => ({}) },
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async () => null },
    '@/lib/security/request-security': { rejectUntrustedMutation: () => null },
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} },
  }
  const modules = new Map<string, { exports: unknown }>()
  type Route = { GET: () => Promise<Response>; POST: (request: Request) => Promise<Response> }
  function load(path: string): unknown {
    const filename = resolve(path)
    if (modules.has(filename)) return modules.get(filename)!.exports
    const loadedModule = { exports: {} }
    modules.set(filename, loadedModule)
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: filename }).outputText
    const boundaryRequire = (name: string): unknown => {
      if (Object.hasOwn(stubs, name)) return stubs[name]
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`)
      if (name.startsWith('.')) return load(resolve(dirname(filename), name.endsWith('.ts') ? name : `${name}.ts`))
      return nativeRequire(name)
    }
    new Function('require', 'module', 'exports', output)(boundaryRequire, loadedModule, loadedModule.exports)
    return loadedModule.exports
  }
  return {
    get: () => (load('app/api/bookings/availability/route.ts') as Route).GET(),
    post: () => (load('app/api/bookings/route.ts') as Route).POST(new Request('http://localhost/api/bookings', { method: 'POST', body: JSON.stringify(incoming) })),
    writes: () => writes, queries,
  }
}

for (const options of [{ failure: 'bookings' }, { failure: 'packages' }, { nullData: 'bookings' }, { nullData: 'packages' }, { throwTable: 'bookings' }, { noAdmin: true }]) {
  test(`availability read and booking submission fail closed: ${JSON.stringify(options)}`, async () => {
    const app = harness(options)
    for (const response of [await app.get(), await app.post()]) {
      assert.equal(response.status, 503)
      assert.equal(Array.isArray(await response.json()), false)
    }
    assert.equal(app.writes(), 0, 'unverified availability must not persist a booking')
  })
}

test('a genuinely empty database remains available and accepts a valid booking', async () => {
  const app = harness()
  const response = await app.get()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [])
  assert.equal((await app.post()).status, 201)
  assert.equal(app.writes(), 1)
})

test('all pages remain authoritative even when the database caps pages below the request size', async () => {
  const bookings = Array.from({ length: 1001 }, (_, index) => ({ id: `FM-${index}`, booking_date: index < 991 ? '2026-10-19' : incoming.bookingDate, booking_time: '8:00 AM', package_id: packageRow.id, booking_status: 'Confirmed', customer_name: 'PRIVATE' }))
  const app = harness({ bookings, cap: 100 })
  const response = await app.get()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.length, 1001)
  assert.equal(body[1000].id, 'availability-1001')
  assert.equal(body[1000].customer_name, undefined)
  assert.equal((await app.post()).status, 409, 'the tenth booking on a later page must block the date')
  assert.equal(app.writes(), 0)
})

test('a later-page failure never publishes or validates the partial listing', async () => {
  const bookings = Array.from({ length: 1001 }, (_, index) => ({ id: `FM-${index}`, booking_date: incoming.bookingDate, booking_time: '8:00 AM', package_id: packageRow.id, booking_status: 'Confirmed' }))
  const app = harness({ bookings, failedPage: 500 })
  assert.equal((await app.get()).status, 503)
  assert.equal((await app.post()).status, 503)
  assert.equal(app.writes(), 0)
})

test('filesystem mode retains its successful empty response', async () => {
  const response = await harness({ configured: false }).get()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [])
})

for (const options of [{ selectedPackageFailure: true }, { selectedPackageThrows: true }]) {
  test(`selected-package read failures are service outages: ${JSON.stringify(options)}`, async () => {
    const app = harness(options)
    assert.equal((await app.post()).status, 503)
    assert.equal(app.writes(), 0)
  })
}

test('a successful package read with no matching package remains a validation error', async () => {
  const app = harness({ missingPackage: true })
  assert.equal((await app.post()).status, 400)
  assert.equal(app.writes(), 0)
})

for (const options of [{ count: null }, { count: -1 }, { count: 2, emptyPage: true }, { count: 0, bookings: [{ id: 'FM-ONE' }] }, { count: 3, bookings: [{ id: 'FM-ONE' }], repeatPage: true }]) {
  test(`unverifiable page completeness is unavailable: ${JSON.stringify(options)}`, async () => {
    const app = harness(options)
    assert.equal((await app.get()).status, 503)
    assert.equal((await app.post()).status, 503)
    assert.equal(app.writes(), 0)
  })
}

test('package metadata also paginates and imported makeup times resolve without exposing clients', async () => {
  const packages = Array.from({ length: 501 }, (_, index) => ({ id: `synthetic-package-${index}`, slot_type: index === 500 ? 'makeup' : 'standard' }))
  const app = harness({ packages, cap: 100, bookings: [{ id: 'FM-PRIVATE', package_id: 'synthetic-package-500', booking_date: incoming.bookingDate, booking_time: '8:00 AM', booking_status: 'Confirmed' }] })
  const response = await app.get()
  assert.equal(response.status, 200)
  const [booking] = await response.json()
  assert.equal(booking.packageSlotType, 'makeup')
  assert.ok(booking.slotId, 'legacy booking time still resolves to its makeup session')
  assert.equal(booking.id, 'availability-1')
  assert.deepEqual(Object.keys(booking).sort(), ['id', 'bookingDate', 'slotId', 'bookingTime', 'packageId', 'packageSlotType', 'bookingStatus'].sort())
  assert.ok(app.queries.every((query) => query.order === 'id'))
})

for (const options of [{ changingCount: true, cap: 1 }, { cap: 1 }]) {
  test(`changing counts and the pagination safety ceiling fail closed: ${JSON.stringify(options)}`, async () => {
    const bookings = Array.from({ length: 101 }, (_, index) => ({ id: `FM-${index}`, package_id: packageRow.id, booking_date: incoming.bookingDate, booking_time: '8:00 AM', booking_status: 'Confirmed' }))
    const app = harness({ ...options, bookings })
    assert.equal((await app.get()).status, 503)
    assert.equal((await app.post()).status, 503)
    assert.equal(app.writes(), 0)
  })
}
