'use client'

import { useSearchParams } from 'next/navigation'
import EditorCapabilityGate from '@/components/editor-capability-gate'
import OnsiteUpload from '@/components/onsite-upload'

export default function OnsiteUploadPage() {
  const params = useSearchParams()
  return (
    <EditorCapabilityGate capability="onsite" fallbackHref="/editor/queue" skeleton="onsite">
      <OnsiteUpload
        initialDate={params.get('date') || ''}
        initialBooking={params.get('booking') || ''}
      />
    </EditorCapabilityGate>
  )
}
