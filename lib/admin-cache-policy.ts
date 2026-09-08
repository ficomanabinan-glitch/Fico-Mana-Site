/** Shared client-side cache policy for authenticated admin/editor reads.
 * Private responses remain no-store on the network; only already-authorized
 * browser snapshots use this policy.
 */
export const ADMIN_QUERY_STALE_MS = 5 * 60_000
export const ADMIN_QUERY_GC_MS = 60 * 60_000
export const ADMIN_BACKGROUND_SYNC_MIN_MS = 15_000
