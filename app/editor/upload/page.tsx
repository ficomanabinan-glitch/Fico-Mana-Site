import EditorUploadPhotos from '@/components/editor-upload-photos'
import EditorCapabilityGate from '@/components/editor-capability-gate'

export default async function EditorUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; retry?: string }>
}) {
  const params = await searchParams
  return (
    <EditorCapabilityGate capability="edit" fallback="/editor/onsite">
      <EditorUploadPhotos
        initialBatchId={String(params.batch || '')}
        initialFailedOnly={params.retry === '1'}
      />
    </EditorCapabilityGate>
  )
}
