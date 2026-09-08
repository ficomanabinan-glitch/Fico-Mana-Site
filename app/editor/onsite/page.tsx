import EditorCapabilityGate from '@/components/editor-capability-gate'
import OnsiteUpload from '@/components/onsite-upload'

export default async function OnsiteUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; booking?: string }>
}) {
  const params = await searchParams
  return (
    <EditorCapabilityGate capability="onsite" fallbackHref="/editor/queue" skeleton="onsite">
      <OnsiteUpload
        initialDate={String(params.date || '')}
        initialBooking={String(params.booking || '')}
      />
    </EditorCapabilityGate>
  )
}
