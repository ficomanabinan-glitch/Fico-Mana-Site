import type { Booking } from './data-store'
import { readStaffPage, staffPageCacheGeneration, writeStaffPage } from './staff-page-cache'
import { STAFF_READ_FRESH_MS } from './admin-cache-policy.ts'

const key = 'editor-filtering'
let pending: { generation: number; promise: Promise<Booking[]> } | null = null
let revision = 0
let loaded: { generation: number; at: number } | null = null
export function invalidateFilteringBookings() { revision += 1; pending = null; loaded = null }
export function peekFilteringBookings() { return readStaffPage<Booking[]>(key) }
export function fetchFilteringBookings({ force = false }: { force?: boolean } = {}): Promise<Booking[]> {
  const generation = staffPageCacheGeneration()
  const requestRevision = revision
  const cached = peekFilteringBookings()
  if (!force && cached !== undefined && loaded?.generation === generation && Date.now() - loaded.at < STAFF_READ_FRESH_MS) {
    return Promise.resolve(cached)
  }
  if (pending?.generation === generation) return pending.promise
  const promise = fetch('/api/editor-workflow/filtering', { cache: 'no-store', credentials: 'include' }).then(async response => {
    const body = await response.json()
    if (!response.ok || !Array.isArray(body)) throw new Error(body.error || 'Could not load selections. Try: refresh the page.')
    if (requestRevision !== revision) return fetchFilteringBookings()
    writeStaffPage(key, body, generation)
    loaded = { generation, at: Date.now() }
    return body as Booking[]
  }).finally(() => { if (pending?.promise === promise) pending = null })
  pending = { generation, promise }
  return promise
}
