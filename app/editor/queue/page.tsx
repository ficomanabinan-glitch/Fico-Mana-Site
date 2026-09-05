import { redirect } from 'next/navigation'
import EditorQueue from '@/components/editor-queue'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { getStaffUser } from '@/lib/supabase/server'

export default async function EditorQueuePage(){const user=await getStaffUser();if(!user)redirect('/editor/login');const access=await getWorkflowAccess(user);if(!access)redirect('/editor/login');if(!canUseWorkflow(access,'edit'))redirect('/editor/onsite');return <EditorQueue basePath="/editor" driveSettingsHref={null}/>}
