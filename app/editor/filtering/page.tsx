import FilteringDashboard, { type FilteringDashTab } from '@/components/filtering-dashboard'
import EditorCapabilityGate from '@/components/editor-capability-gate'

export default async function EditorFilteringPage({ searchParams }: { searchParams: Promise<{ search?: string; tab?: string }> }) {
  const query = await searchParams
  const tab = ['overview', 'queue', 'calendar', 'editor'].includes(query.tab || '') ? query.tab as FilteringDashTab : undefined
  return (
    <EditorCapabilityGate capability="edit" fallback="/editor/onsite">
      <FilteringDashboard key={`${query.search || ''}:${tab || ''}`} initialSearch={query.search || ''} initialTab={tab} />
    </EditorCapabilityGate>
  )
}
