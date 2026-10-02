import { requireWorkflowAuth } from '@/lib/auth-api'
import { isAdminUser } from '@/lib/auth/admin'
import { loadClientWorkspaceAttention } from '@/lib/client-workspace'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const attentionPolicy = { name: 'admin-client-workspace-attention', limit: 60, windowSeconds: 300, failClosed: true }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: privateNoStoreHeaders() })
function privateResponse(response: Response) {
  Object.entries(privateNoStoreHeaders()).forEach(([key, value]) => response.headers.set(key, value))
  return response
}

export async function GET(request: Request) {
  try {
    const { user, access, error } = await requireWorkflowAuth('admin', request)
    if (error) return privateResponse(error)
    if (!user || !access || !isAdminUser(user)) return json({ error: 'Only administrators can view production attention.' }, 403)
    const limited = await enforceApiRateLimit(request, attentionPolicy, [user.id, access.workspaceId])
    if (limited) return privateResponse(limited)
    const admin = getSupabaseAdmin()
    if (!admin) return json({ error: 'Production attention is temporarily unavailable. Retry in a moment.' }, 503)
    return json(await loadClientWorkspaceAttention(admin, access.workspaceId))
  } catch {
    return json({ error: 'Production attention could not be loaded. Retry in a moment.' }, 503)
  }
}
