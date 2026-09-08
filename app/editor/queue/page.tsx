'use client'

import EditorCapabilityGate from '@/components/editor-capability-gate'
import EditorQueue from '@/components/editor-queue'

export default function EditorQueuePage() {
  return (
    <EditorCapabilityGate capability="edit" fallbackHref="/editor/onsite" skeleton="queue">
      <EditorQueue basePath="/editor" driveSettingsHref={null} />
    </EditorCapabilityGate>
  )
}
