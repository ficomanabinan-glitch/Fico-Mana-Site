/**
 * Browser-only freshness policy for authenticated staff reads.
 *
 * API responses remain private/no-store. These values only control the
 * in-memory or tab-local snapshots that keep repeat navigation immediate.
 */
export const STAFF_READ_FRESH_MS = 5 * 60_000
export const STAFF_PAGE_WARM_MS = 60 * 60_000
export const STAFF_PAGE_CACHE_LIMIT = 64
export const STAFF_BACKGROUND_SYNC_MIN_MS = 15_000
export const STAFF_BACKGROUND_SYNC_INTERVAL_MS = 3 * 60_000
