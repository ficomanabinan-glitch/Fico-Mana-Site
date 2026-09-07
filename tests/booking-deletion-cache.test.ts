import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import type { Booking } from '../lib/data-store.ts'

const first = { id: 'FM-CACHE-1', customerName: 'Synthetic one' } as Booking
const second = { id: 'FM-CACHE-2', customerName: 'Synthetic two' } as Booking

function setup(t: test.TestContext) {
  const originals = Object.fromEntries(['window', 'localStorage', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const records = new Map<string, string>()
  const storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => records.set(key, value) }
  const events = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  let salesSignals = 0
  const store = loadTs<typeof import('../lib/data-store.ts')>('lib/data-store.ts', {
    './booking-packages': { bookingPackages: [] },
    './booking-db': {},
    './sales-read-cache': { signalSalesDataChanged: () => { salesSignals += 1 } },
  })
  const seed = (data: Booking[]) => {
    records.set('ficomana_bookings', JSON.stringify(data))
    records.set('ficomana_bookings_cached_at', String(Date.now()))
  }
  return { store, records, storage, events, seed, salesSignals: () => salesSignals }
}

test('deletion evicts a fresh cached row immediately, including the final row', async t => {
  const { store, seed, salesSignals } = setup(t)
  seed([first, second])
  let requests = 0
  globalThis.fetch = async (_url, options) => {
    requests += 1
    assert.equal(options?.method, 'DELETE')
    assert.equal(options?.credentials, 'include')
    assert.deepEqual(JSON.parse(String(options?.body)), { reason: 'admin_error', notes: 'Synthetic test' })
    return Response.json({ ok: true })
  }
  assert.deepEqual(await store.deleteBooking(first.id, 'admin_error', ' Synthetic test '), { alreadyDeleted: false })
  assert.deepEqual(await store.getBookings(), [second])
  await store.deleteBooking(second.id, 'admin_error', 'Synthetic test')
  assert.deepEqual(await store.getBookings(), [])
  assert.deepEqual(await store.getBookings(), [])
  assert.equal(requests, 2, 'An empty authoritative cache must not trigger a refetch loop')
  assert.equal(salesSignals(), 2)
})

test('an authenticated already-missing response removes only the stale row', async t => {
  const { store, seed } = setup(t)
  seed([first, second])
  globalThis.fetch = async () => Response.json({ error: 'Booking not found.' }, { status: 404 })
  assert.deepEqual(await store.deleteBooking(first.id, 'client_error'), { alreadyDeleted: true })
  assert.deepEqual(await store.getBookings(), [second])
})

test('authorization, network and server failures never masquerade as a successful deletion', async t => {
  const { store, seed, salesSignals } = setup(t)
  seed([first])
  for (const status of [401, 403, 428, 429, 500, 503]) {
    globalThis.fetch = async () => Response.json({ error: 'Try: sign in or refresh.' }, { status })
    await assert.rejects(store.deleteBooking(first.id, 'admin_error'))
    assert.deepEqual(await store.getBookings(), [first])
  }
  globalThis.fetch = async () => Response.json({ error: 'Unknown route' }, { status: 404 })
  await assert.rejects(store.deleteBooking(first.id, 'admin_error'))
  globalThis.fetch = async () => { throw new Error('Offline') }
  await assert.rejects(store.deleteBooking(first.id, 'admin_error'))
  assert.deepEqual(await store.getBookings(), [first])
  assert.equal(salesSignals(), 0)
})

test('a pre-deletion GET cannot restore the row or clear a newer in-flight request', async t => {
  const { store, seed } = setup(t)
  seed([first, second])
  let resolveOld!: (response: Response) => void
  let resolveNew!: (response: Response) => void
  let reads = 0
  globalThis.fetch = async (_url, options) => {
    if (options?.method === 'DELETE') return Response.json({ ok: true })
    reads += 1
    return new Promise<Response>(resolve => { if (reads === 1) resolveOld = resolve; else resolveNew = resolve })
  }
  const old = store.getBookings({ force: true })
  await store.deleteBooking(first.id, 'admin_error')
  const fresh = store.getBookings({ force: true })
  resolveOld(Response.json([first, second]))
  assert.deepEqual(await old, [second])
  const joined = store.getBookings({ force: true })
  assert.equal(reads, 2)
  resolveNew(Response.json([second]))
  assert.deepEqual(await fresh, [second])
  assert.deepEqual(await joined, [second])
  assert.deepEqual(await store.getBookings(), [second])
})

test('manual refresh bypasses TTL and same-origin tab updates invalidate old requests', async t => {
  const { store, seed, storage, events } = setup(t)
  seed([first, second])
  let resolveOld!: (response: Response) => void
  let notifications = 0
  events.addEventListener('admin:db-synced', () => { notifications += 1 })
  globalThis.fetch = async () => new Promise<Response>(resolve => { resolveOld = resolve })
  const old = store.getBookings({ force: true })
  seed([second]) // Another tab's successful deletion.
  store.receiveBookingCacheChange({ key: 'ficomana_bookings', storageArea: storage } as unknown as StorageEvent)
  assert.equal(notifications, 1)
  resolveOld(Response.json([first, second]))
  assert.deepEqual(await old, [second])
  globalThis.fetch = async () => Response.json([])
  assert.deepEqual(await store.getBookings({ force: true }), [])
  assert.deepEqual(await store.getBookings(), [])
})

test('booking detail does not fall back to a known-deleted saved row', async t => {
  const { store, seed, records } = setup(t)
  seed([first, second])
  records.set('ficomana_bookings_cached_at', '0')
  globalThis.fetch = async () => Response.json({ error: 'Not found' }, { status: 404 })
  assert.equal(await store.getBooking(first.id), null)
  assert.deepEqual(await store.getBookings(), [second])
})

test('database lookup failures throw instead of reporting a booking as missing', async () => {
  const db = loadTs<typeof import('../lib/supabase-store.ts')>('lib/supabase-store.ts', {
    '@/lib/booking-db': {}, '@/lib/package-seed-sync': {}, '@/lib/packages-seed': {},
    '@/lib/supabase/env': { isSupabaseConfigured: () => true },
  })
  const client = (error: unknown) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error }) }) }) }) })
  await assert.rejects(db.getBookingFromDb(client({ message: 'Synthetic outage' }) as never, first.id), /temporarily unavailable/)
  assert.equal(await db.getBookingFromDb(client(null) as never, first.id), null)
})

test('failed booking list reads cannot be mistaken for a successful empty database', async () => {
  const sync = loadTs<typeof import('../lib/db-sync.ts')>('lib/db-sync.ts', {
    '@/lib/server-store': {}, '@/lib/supabase-store': { listBookingsFromDb: async () => null },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({}) },
    '@/lib/supabase/env': { isSupabaseConfigured: () => true },
  })
  await assert.rejects(sync.loadSyncedBookings(), /temporarily unavailable/)
})
