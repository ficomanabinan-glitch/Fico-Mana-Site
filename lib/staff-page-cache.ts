import { STAFF_PAGE_CACHE_LIMIT, STAFF_PAGE_WARM_MS } from './admin-cache-policy.ts'

// Private, tab-local read snapshots only. Never persisted to browser storage or
// used to authorize a request. The shell binds this cache before showing pages.
type StaffPageEntry = { data: unknown; touchedAt: number }

const pages = new Map<string, StaffPageEntry>()
let owner: string | null = null
let generation = 0

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of pages) {
    if (now - entry.touchedAt >= STAFF_PAGE_WARM_MS) pages.delete(key)
  }
}

export function setStaffPageCacheOwner(nextOwner: string | null) {
  if (owner === nextOwner) return false
  owner = nextOwner
  generation += 1
  pages.clear()
  return true
}

export function staffPageCacheGeneration() {
  return generation
}

/** Invalidate related folder snapshots after a successful write. */
export function invalidateStaffPages(prefix: string) {
  for (const key of pages.keys()) {
    if (key.startsWith(prefix)) pages.delete(key)
  }
}

export function readStaffPage<T>(key: string): T | undefined {
  if (typeof window === 'undefined' || !owner) return undefined
  const entry = pages.get(key)
  if (!entry) return undefined
  const now = Date.now()
  if (now - entry.touchedAt >= STAFF_PAGE_WARM_MS) {
    pages.delete(key)
    return undefined
  }
  // Touch and move the entry to the end so the least-recent page is evicted.
  pages.delete(key)
  pages.set(key, { ...entry, touchedAt: now })
  return entry.data as T
}

export function writeStaffPage<T>(key: string, data: T, requestGeneration: number) {
  if (typeof window === 'undefined' || !owner || requestGeneration !== generation || data == null) return false
  const now = Date.now()
  pruneExpired(now)
  pages.delete(key)
  pages.set(key, { data, touchedAt: Date.now() })
  if (pages.size > STAFF_PAGE_CACHE_LIMIT) pages.delete(pages.keys().next().value!)
  return true
}
