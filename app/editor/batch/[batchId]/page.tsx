import { redirect } from 'next/navigation'
import BatchDetailPage from '@/app/admin/filtering/batch/[batchId]/page'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { getStaffUser } from '@/lib/supabase/server'

export default async function EditorBatchPage(){const user=await getStaffUser();if(!user)redirect('/editor/login');const access=await getWorkflowAccess(user);if(!access)redirect('/editor/login');return <BatchDetailPage/>}
