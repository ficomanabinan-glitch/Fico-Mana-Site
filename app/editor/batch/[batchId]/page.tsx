import BatchDetailPage from '@/app/admin/filtering/batch/[batchId]/page'
import EditorCapabilityGate from '@/components/editor-capability-gate'

export default function EditorBatchPage() {
  return (
    <EditorCapabilityGate capability="edit" fallbackHref="/editor/onsite" skeleton="batch">
      <BatchDetailPage />
    </EditorCapabilityGate>
  )
}
