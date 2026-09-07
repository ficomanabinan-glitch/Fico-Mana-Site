// Private, tab-local read snapshots only. Never persisted to browser storage or
// used to authorize a request. The shell binds this cache before showing pages.
const MAX_PAGES = 64
const pages = new Map<string, unknown>()
let owner: string | null = null
let generation = 0

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
  return pages.get(key) as T | undefined
}

export function writeStaffPage<T>(key: string, data: T, requestGeneration: number) {
  if (typeof window === 'undefined' || !owner || requestGeneration !== generation || data == null) return false
  pages.delete(key)
  pages.set(key, data)
  if (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value!)
  return true
}
