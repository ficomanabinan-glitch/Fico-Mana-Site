import { clearAdminReadCaches } from './data-store'
import { invalidateEditorBatchCache } from './editor-read-cache'
import { clearManagedPackageCache } from './package-manager-cache'
import { clearSalesReadCache } from './sales-read-cache'
import { setStaffPageCacheOwner } from './staff-page-cache'

export function bindStaffReadCache(userId: string | null) {
  if (!setStaffPageCacheOwner(userId)) return false
  clearAdminReadCaches()
  clearSalesReadCache()
  clearManagedPackageCache()
  invalidateEditorBatchCache(true)
  return true
}
