import EditorQueue from '@/components/editor-queue'
import EditorCapabilityGate from '@/components/editor-capability-gate'

export default function EditorQueuePage() {
  return (
    <EditorCapabilityGate capability="edit" fallback="/editor/onsite">
      <EditorQueue basePath="/editor" />
    </EditorCapabilityGate>
  )
}
