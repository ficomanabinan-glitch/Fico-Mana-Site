import { redirect } from 'next/navigation'
import EditorUploadPhotos from '@/components/editor-upload-photos'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { getStaffUser } from '@/lib/supabase/server'

export default async function EditorUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; retry?: string }>
}) {
  const user = await getStaffUser()
  if (!user) redirect('/editor/login')
  const access = await getWorkflowAccess(user)
  if (!access) redirect('/editor/login')
  if (!canUseWorkflow(access, 'edit')) redirect('/editor/onsite')
  const params = await searchParams
  return (
    <EditorUploadPhotos
      initialBatchId={String(params.batch || '')}
      initialFailedOnly={params.retry === '1'}
    />
  )
}
