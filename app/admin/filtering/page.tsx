'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AdminLoadingSkeleton from '@/components/admin-loading-skeleton'
import FilteringDashboard, { type FilteringDashTab } from '@/components/filtering-dashboard'

const VALID_TABS = new Set<FilteringDashTab>(['overview', 'queue', 'calendar', 'editor'])

export default function AdminFilteringPage() {
  return (
    <Suspense fallback={<AdminLoadingSkeleton />}>
      <AdminFilteringContent />
    </Suspense>
  )
}

function AdminFilteringContent() {
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search')?.trim() ?? ''
  const tabParam = searchParams.get('tab')?.trim() as FilteringDashTab | null
  const initialTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : undefined

  return <FilteringDashboard initialSearch={initialSearch} initialTab={initialTab} />
}
