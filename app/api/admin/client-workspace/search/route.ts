import { requireWorkflowAuth } from '@/lib/auth-api'
import { isAdminUser } from '@/lib/auth/admin'
import { ClientWorkspaceError, searchClientWorkspace } from '@/lib/client-workspace'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const searchPolicy = { name: 'admin-client-workspace-search', limit: 120, windowSeconds: 300, failClosed: true }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privateNoStoreHeaders() })
function privateResponse(response: Response) {
  Object.entries(privateNoStoreHeaders()).forEach(([key, value]) => response.headers.set(key, value))
  return response
}

export async function GET(request: Request) {
  try {
    const { user, access, error } = await requireWorkflowAuth('admin', request)
    if (error) return privateResponse(error)
    if (!user || !access || !isAdminUser(user)) return json({ error: 'Only administrators can search the Client Workspace.' }, 403)
    const limited = await enforceApiRateLimit(request, searchPolicy, [user.id, access.workspaceId])
    if (limited) return privateResponse(limited)
    const admin = getSupabaseAdmin()
    if (!admin) return json({ error: 'Client search is temporarily unavailable. Retry in a moment.' }, 503)
    return json(await searchClientWorkspace(admin, access.workspaceId, new URL(request.url).searchParams.get('q') || ''))
  } catch (error) {
    if (error instanceof ClientWorkspaceError) return json({ error: error.message }, error.status)
    return json({ error: 'Client search could not be loaded. Retry in a moment.' }, 503)
  }
}
