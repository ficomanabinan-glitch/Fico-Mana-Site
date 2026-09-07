export const provisioningStatuses = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'PROVISIONING', label: 'Provisioning' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PARTIAL_FAILURE', label: 'Partial Failure' },
  { value: 'FAILED', label: 'Failed' },
] as const

export type ProvisioningStatus = typeof provisioningStatuses[number]['value']
export type PortalListSort = 'newest' | 'oldest' | 'status' | 'client'
type PortalListItem = {
  bookingId: string; customerName: string; customerEmail: string; packageName: string
  shootDate: string; provisioningStatus: ProvisioningStatus
}
const statusRank: Record<ProvisioningStatus, number> = {
  FAILED: 0, PARTIAL_FAILURE: 1, NOT_STARTED: 2, PROVISIONING: 3, ACTIVE: 4,
}

export function filterAndSortClientPortals<T extends PortalListItem>(
  items: readonly T[], search: string, status: 'ALL' | ProvisioningStatus, sort: PortalListSort,
): T[] {
  const term = search.trim().toLowerCase()
  return items.filter(item => (status === 'ALL' || item.provisioningStatus === status) &&
    (!term || [item.bookingId,item.customerName,item.customerEmail,item.packageName,item.shootDate]
      .some(value => (value || '').toLowerCase().includes(term))))
    .sort((a,b) => {
      const newest = b.shootDate.localeCompare(a.shootDate)
      const tie = a.customerName.localeCompare(b.customerName) || a.bookingId.localeCompare(b.bookingId)
      if (sort === 'oldest') return -newest || tie
      if (sort === 'status') return statusRank[a.provisioningStatus]-statusRank[b.provisioningStatus] || newest || tie
      if (sort === 'client') return a.customerName.localeCompare(b.customerName) || newest || tie
      return newest || tie
    })
}
