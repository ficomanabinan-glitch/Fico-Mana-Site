import { ADMIN_QUERY_GC_MS } from './admin-cache-policy'

// Private, tab-local read snapshots only. Never persisted to browser storage or
// used to authorize a request. The shell binds this cache before showing pages.
const MAX_PAGES = 64
type PageEntry = { data: unknown; touchedAt: number }
const pages = new Map<string, PageEntry>()
let owner: string | null = null
let generation = 0

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of pages) {
    if (now - entry.touchedAt >= ADMIN_QUERY_GC_MS) pages.delete(key)
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

export function readStaffPage<T>(key: string): T | undefined {
  if (typeof window === 'undefined' || !owner) return undefined
  const now = Date.now()
  pruneExpired(now)
  const entry = pages.get(key)
  if (!entry) return undefined
  pages.delete(key)
  pages.set(key, { ...entry, touchedAt: now })
  return entry.data as T
}

export function writeStaffPage<T>(key: string, data: T, requestGeneration: number) {
  if (typeof window === 'undefined' || !owner || requestGeneration !== generation || data == null) return false
  const now = Date.now()
  pruneExpired(now)
  pages.delete(key)
  pages.set(key, { data, touchedAt: now })
  if (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value!)
  return true
}
