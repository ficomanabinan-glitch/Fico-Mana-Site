import OnsiteUpload from '@/components/onsite-upload'
import EditorCapabilityGate from '@/components/editor-capability-gate'

export default async function OnsiteUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; booking?: string }>
}) {
  const params = await searchParams
  return (
    <EditorCapabilityGate capability="onsite" fallback="/editor/queue">
      <OnsiteUpload initialDate={String(params.date || '')} initialBooking={String(params.booking || '')} />
    </EditorCapabilityGate>
  )
}
