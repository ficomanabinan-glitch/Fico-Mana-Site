import { requireWorkflowAuth } from '@/lib/auth-api'
import { isAdminUser } from '@/lib/auth/admin'
import { ClientWorkspaceError, loadClientWorkspaceCore, loadClientWorkspaceDetails } from '@/lib/client-workspace'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const readPolicy = { name: 'admin-client-workspace-read', limit: 180, windowSeconds: 300, failClosed: true }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privateNoStoreHeaders() })
function privateResponse(response: Response) {
  Object.entries(privateNoStoreHeaders()).forEach(([key, value]) => response.headers.set(key, value))
  return response
}

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const { user, access, error } = await requireWorkflowAuth('admin', request)
    if (error) return privateResponse(error)
    if (!user || !access || !isAdminUser(user)) return json({ error: 'Only administrators can open the Client Workspace.' }, 403)
    const limited = await enforceApiRateLimit(request, readPolicy, [user.id, access.workspaceId])
    if (limited) return privateResponse(limited)
    const admin = getSupabaseAdmin()
    if (!admin) return json({ error: 'Client Workspace is temporarily unavailable. Retry in a moment.' }, 503)
    const { clientId } = await params
    const search = new URL(request.url).searchParams
    const section = search.get('section') || 'core'
    if (!['core', 'details'].includes(section)) return json({ error: 'Choose a valid Client Workspace section.' }, 400)
    const core = await loadClientWorkspaceCore(admin, access.workspaceId, clientId, search.get('booking'))
    return json(section === 'details' ? await loadClientWorkspaceDetails(admin, access.workspaceId, core) : core)
  } catch (error) {
    if (error instanceof ClientWorkspaceError) return json({ error: error.message }, error.status)
    return json({ error: 'Client Workspace could not be loaded. Retry in a moment.' }, 503)
  }
}
