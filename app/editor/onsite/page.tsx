import { redirect } from 'next/navigation'
import OnsiteUpload from '@/components/onsite-upload'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { getStaffUser } from '@/lib/supabase/server'

export default async function OnsiteUploadPage(){const user=await getStaffUser();if(!user)redirect('/editor/login');const access=await getWorkflowAccess(user);if(!access)redirect('/editor/login');if(!canUseWorkflow(access,'onsite'))redirect('/editor/queue');return <OnsiteUpload/>}
