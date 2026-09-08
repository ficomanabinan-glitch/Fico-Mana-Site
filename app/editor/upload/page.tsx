import EditorCapabilityGate from '@/components/editor-capability-gate'
import EditorUploadPhotos from '@/components/editor-upload-photos'

export default async function EditorUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; retry?: string }>
}) {
  const params = await searchParams
  return (
    <EditorCapabilityGate capability="edit" fallbackHref="/editor/onsite" skeleton="queue">
      <EditorUploadPhotos
        initialBatchId={String(params.batch || '')}
        initialFailedOnly={params.retry === '1'}
      />
    </EditorCapabilityGate>
  )
}
