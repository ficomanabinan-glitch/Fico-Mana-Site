'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import FilteringDashboard, { type FilteringDashTab } from '@/components/filtering-dashboard'

const VALID_TABS = new Set<FilteringDashTab>(['overview', 'queue', 'calendar', 'editor'])

export default function AdminFilteringPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        </div>
      }
    >
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
