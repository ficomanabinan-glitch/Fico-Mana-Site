import EditorQueue from '@/components/editor-queue'
import EditorCapabilityGate from '@/components/editor-capability-gate'

export default async function EditorQueuePage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { search } = await searchParams
  return (
    <EditorCapabilityGate capability="edit" fallback="/editor/onsite">
      <EditorQueue basePath="/editor" initialSearch={search?.trim() || ''} />
    </EditorCapabilityGate>
  )
}
