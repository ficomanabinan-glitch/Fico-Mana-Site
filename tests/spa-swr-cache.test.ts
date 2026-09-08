import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  STAFF_BACKGROUND_SYNC_MIN_MS,
  STAFF_PAGE_CACHE_LIMIT,
  STAFF_PAGE_WARM_MS,
  STAFF_READ_FRESH_MS,
} from '../lib/admin-cache-policy.ts'

const read = (path: string) => readFileSync(path, 'utf8')

test('Admin and Editor share the approved private browser-cache policy', () => {
  assert.equal(STAFF_READ_FRESH_MS, 5 * 60_000)
  assert.equal(STAFF_PAGE_WARM_MS, 60 * 60_000)
  assert.equal(STAFF_PAGE_CACHE_LIMIT, 64)
  assert.equal(STAFF_BACKGROUND_SYNC_MIN_MS, 15_000)

  for (const file of [
    'lib/data-store.ts',
    'lib/editor-read-cache.ts',
    'lib/sales-read-cache.ts',
    'lib/package-manager-cache.ts',
  ]) {
    const source = read(file)
    assert.match(source, /STAFF_READ_FRESH_MS/)
    assert.doesNotMatch(source, /(?:CACHE_FRESH|CACHE_TTL)_MS\s*=\s*(?:30_000|90_000)/)
  }
})

test('forced booking and notification reads use stale-while-revalidate, including cached empty lists', () => {
  const source = read('lib/data-store.ts')
  assert.match(source, /const cached = peekBookings\(\)[\s\S]*options\.force[\s\S]*cached !== undefined[\s\S]*void fetchBookingsFresh\(true\)[\s\S]*return cached/)
  assert.match(source, /const cached = peekNotifications\(\)[\s\S]*options\.force[\s\S]*cached !== undefined[\s\S]*void fetchNotificationsFresh\(true\)[\s\S]*return cached/)
  assert.match(source, /queueMicrotask\(signalAdminCacheUpdated\)/)
})

test('TanStack Query is scoped to each signed-in staff shell without changing API caching', () => {
  const provider = read('components/staff-query-provider.tsx')
  assert.match(provider, /QueryClientProvider/)
  assert.match(provider, /staleTime:\s*STAFF_READ_FRESH_MS/)
  assert.match(provider, /gcTime:\s*STAFF_PAGE_WARM_MS/)
  assert.match(provider, /client\.clear\(\)/)

  for (const file of ['app/admin/layout.tsx', 'components/editor-portal-shell.tsx']) {
    const source = read(file)
    assert.match(source, /<StaffQueryProvider key=/)
  }
  assert.match(read('components/use-cached-page-read.ts'), /useQueryClient/)
  assert.match(read('app/api/editor-workflow/filtering/route.ts'), /Cache-Control': 'private, no-store'/)
})

test('normal editor invalidation retains visible batches and auth-boundary invalidation discards them', () => {
  const cache = read('lib/editor-read-cache.ts')
  assert.match(cache, /invalidateEditorBatchCache\(discardPrivateData = false\)/)
  assert.match(cache, /if \(batchCache\) batchCache = \{ \.\.\.batchCache, cachedAt: 0 \}/)
  assert.match(cache, /if \(discardPrivateData\) \{[\s\S]*batchCache = null/)
  assert.match(read('lib/staff-cache-session.ts'), /invalidateEditorBatchCache\(true\)/)
})
