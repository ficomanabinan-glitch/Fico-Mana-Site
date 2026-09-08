'use client'

import { useSearchParams } from 'next/navigation'
import EditorCapabilityGate from '@/components/editor-capability-gate'
import EditorUploadPhotos from '@/components/editor-upload-photos'

export default function EditorUploadPage() {
  const params = useSearchParams()
  return (
    <EditorCapabilityGate capability="edit" fallbackHref="/editor/onsite" skeleton="queue">
      <EditorUploadPhotos
        initialBatchId={params.get('batch') || ''}
        initialFailedOnly={params.get('retry') === '1'}
      />
    </EditorCapabilityGate>
  )
}
