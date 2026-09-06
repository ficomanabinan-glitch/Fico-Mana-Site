import type { User } from '@supabase/supabase-js'
import { isAdminUser } from '@/lib/auth/admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export type WorkflowRole = 'owner' | 'admin' | 'editor' | 'staff'
export type WorkflowCapability = 'view' | 'onsite' | 'edit' | 'admin'

export type WorkflowAccess = {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  role: WorkflowRole
  displayName: string
}

const CAPABILITIES: Record<WorkflowRole, ReadonlySet<WorkflowCapability>> = {
  owner: new Set(['view', 'onsite', 'edit', 'admin']),
  admin: new Set(['view', 'onsite', 'edit', 'admin']),
  editor: new Set(['view', 'onsite', 'edit']),
  staff: new Set(['view', 'onsite']),
}

function adminClient() {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('Editor authorization is not configured.')
  return admin
}

function workspaceRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined
  return value as Record<string, unknown> | undefined
}

export function canUseWorkflow(access: WorkflowAccess, capability: WorkflowCapability) {
  return CAPABILITIES[access.role].has(capability)
}

/** Resolve server-authoritative workspace membership. Admin claims may bootstrap the default workspace. */
export async function getWorkflowAccess(user: User): Promise<WorkflowAccess | null> {
  const admin = adminClient()
  const { data: membership, error } = await admin
    .from('workspace_members')
    .select('workspace_id,role,display_name,workspaces(name,slug,status)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (membership?.workspace_id) {
    const workspace = workspaceRecord(membership.workspaces)
    if (String(workspace?.status || '') !== 'active') return null
    const role = String(membership.role) as WorkflowRole
    if (!(role in CAPABILITIES)) return null
    return {
      workspaceId: String(membership.workspace_id),
      workspaceName: String(workspace?.name || 'FICO MANA Studio'),
      workspaceSlug: String(workspace?.slug || 'fico-mana'),
      role,
      displayName: String(membership.display_name || user.email?.split('@')[0] || 'Staff'),
    }
  }

  if (!isAdminUser(user)) return null
  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('id,name,slug,status')
    .eq('slug', 'fico-mana')
    .eq('status', 'active')
    .single()
  if (workspaceError || !workspace) throw new Error('Studio workspace is not configured.')
  const displayName = user.email?.split('@')[0] || 'Administrator'
  const { error: memberError } = await admin.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user.id,
    role: 'admin',
    display_name: displayName,
  })
  if (memberError) throw new Error(memberError.message)
  return {
    workspaceId: String(workspace.id),
    workspaceName: String(workspace.name),
    workspaceSlug: String(workspace.slug),
    role: 'admin',
    displayName,
  }
}
