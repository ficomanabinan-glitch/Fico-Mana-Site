import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'

type Cache = typeof import('../lib/staff-page-cache.ts')
type Hooks = typeof import('../components/use-cached-page-read.ts')

function setup(t: test.TestContext) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  const cache = loadTs<Cache>('lib/staff-page-cache.ts', {
    './admin-cache-policy.ts': { STAFF_PAGE_CACHE_LIMIT: 64, STAFF_PAGE_WARM_MS: 60 * 60_000 },
  })
  cache.setStaffPageCacheOwner('staff-a')
  return cache
}

// Exercise the real hook with React's state/ref/effect boundaries simulated.
function mount(cache: Cache) {
  let cursor = 0
  const slots: unknown[] = []
  const cleanups: Array<() => void> = []
  const react = {
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial
      return [slots[index] as T, (value: T | ((old: T) => T)) => {
        slots[index] = typeof value === 'function' ? (value as (old: T) => T)(slots[index] as T) : value
      }] as const
    },
    useRef<T>(initial: T) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index] as { current: T }
    },
    useEffect(effect: () => void | (() => void)) {
      const index = cursor++
      if (index in slots) return
      slots[index] = true
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    },
    useCallback<T>(fn: T) { return fn },
  }
  const queryData = new Map<string, unknown>()
  const queryClient = {
    getQueryData: (key: readonly unknown[]) => queryData.get(JSON.stringify(key)),
    setQueryData: (key: readonly unknown[], value: unknown) => queryData.set(JSON.stringify(key), value),
  }
  const hooks = loadTs<Hooks>('components/use-cached-page-read.ts', {
    react,
    '@tanstack/react-query': { useQueryClient: () => queryClient },
    '@/lib/staff-page-cache': cache,
    '@/lib/editor-read-cache': {},
    '@/lib/admin-cache-policy': {
      STAFF_BACKGROUND_SYNC_INTERVAL_MS: 3 * 60_000,
      STAFF_BACKGROUND_SYNC_MIN_MS: 15_000,
    },
  })
  return {
    render(key = 'page:a') { cursor = 0; return hooks.useCachedPageRead<string[]>(key, []) },
    unmount() { cleanups.forEach(cleanup => cleanup()) },
  }
}

test('repeat visits render the successful snapshot before the next request resolves', t => {
  const cache = setup(t)
  const first = mount(cache)
  assert.equal(first.render()[2], true, 'first load uses the existing skeleton')
  first.render()[1](['saved row'])
  first.render()[3](false)
  first.unmount()
  const second = mount(cache)
  let result = second.render()
  assert.deepEqual(result[0], ['saved row'])
  assert.equal(result[2], false, 'no skeleton on return')
  assert.equal(result[4], true, 'background request can still show the Refresh indicator')
  result[3](true)
  result = second.render()
  assert.equal(result[2], false, 'manual/background refresh retains the loaded page')
  result[1](['updated row'])
  assert.deepEqual(second.render()[0], ['updated row'])
  result[3](false) // A failed refresh calls finally, but never replaces data.
  assert.deepEqual(second.render()[0], ['updated row'])
})

test('empty results are cached without an endless skeleton or refetch loop', t => {
  const cache = setup(t)
  const first = mount(cache)
  first.render()[1]([])
  first.unmount()
  assert.equal(mount(cache).render()[2], false)
})

test('switching dates isolates snapshots and ignores late responses from the old date', t => {
  const cache = setup(t)
  const page = mount(cache)
  const old = page.render('onsite:day-a')
  old[1](['client a'])
  let next = page.render('onsite:day-b')
  assert.equal(next[2], true)
  assert.deepEqual(next[0], [])
  old[1](['late client a'])
  next = page.render('onsite:day-b')
  assert.deepEqual(next[0], [])
  next[1](['client b'])
  assert.deepEqual(page.render('onsite:day-a')[0], ['client a'])
  assert.equal(page.render('onsite:day-a')[2], false)
})

test('sign-out and account changes clear snapshots and reject old request writers', t => {
  const cache = setup(t)
  const page = mount(cache)
  const old = page.render()
  old[1](['private row'])
  const generation = cache.staffPageCacheGeneration()
  assert.equal(cache.setStaffPageCacheOwner('staff-a'), false, 'token refresh keeps the same cache')
  cache.setStaffPageCacheOwner(null)
  old[1](['late private row'])
  assert.equal(cache.readStaffPage('page:a'), undefined)
  cache.setStaffPageCacheOwner('staff-b')
  assert.equal(cache.writeStaffPage('page:a', ['old request'], generation), false)
  assert.deepEqual(page.render()[0], [])
  assert.equal(page.render()[2], true)
})

test('unmounted components cannot overwrite a more recent page snapshot', t => {
  const cache = setup(t)
  const first = mount(cache)
  const old = first.render()
  old[1](['first'])
  first.unmount()
  const second = mount(cache)
  second.render()[1](['latest'])
  old[1](['late'])
  assert.deepEqual(cache.readStaffPage('page:a'), ['latest'])
})

test('snapshots are bounded, private to the browser, and null is not a successful read', t => {
  const cache = setup(t)
  const generation = cache.staffPageCacheGeneration()
  for (let index = 0; index < 65; index++) cache.writeStaffPage(`page:${index}`, [], generation)
  assert.equal(cache.readStaffPage('page:0'), undefined)
  assert.deepEqual(cache.readStaffPage('page:64'), [])
  assert.equal(cache.writeStaffPage('invalid', null, generation), false)
  Reflect.deleteProperty(globalThis, 'window')
  assert.equal(cache.readStaffPage('page:64'), undefined, 'never reuse user data during server rendering')
  assert.equal(cache.writeStaffPage('server', [], generation), false)
})

test('booking views read the shared mutation-aware cache, not separate page copies', () => {
  for (const file of ['dashboard','bookings','calendar','clients','reports','verification']) {
    const source = readFileSync(`app/admin/${file}/page.tsx`, 'utf8')
    assert.match(source, /peekBookings\(\)/)
    assert.doesNotMatch(source, /useCachedPageRead<Booking/)
  }
  const config = readFileSync('next.config.mjs', 'utf8')
  assert.match(config, /staleTimes: \{ dynamic: 300, static: 300 \}/)
  for (const file of ['app/admin/layout.tsx','components/editor-portal-shell.tsx']) {
    const source = readFileSync(file, 'utf8')
    assert.match(source, /bindStaffReadCache\(null\)/)
    assert.match(source, /onAuthStateChange/)
  }
})

test('sales invalidation retains the last summary while sign-out discards it', async t => {
  const sales = loadTs<typeof import('../lib/sales-read-cache.ts')>('lib/sales-read-cache.ts', {
    './admin-cache-policy.ts': { STAFF_READ_FRESH_MS: 5 * 60_000 },
  })
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const payload = { summary: { bookedSales: 1200 }, settings: {} }
  globalThis.fetch = async () => Response.json(payload)
  await sales.fetchSales('month', '2026-09-08')
  sales.invalidateSalesDataCache()
  assert.deepEqual(sales.getCachedSales('month', '2026-09-08'), payload)
  assert.equal(sales.isSalesCacheFresh('month', '2026-09-08'), false)
  sales.clearSalesReadCache()
  assert.equal(sales.getCachedSales('month', '2026-09-08'), null)
})
