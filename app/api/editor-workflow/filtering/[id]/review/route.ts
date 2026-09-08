import { requireWorkflowAuth } from '@/lib/auth-api'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { reviewSelection, SelectionReviewError } from '@/lib/selection-review'

export const dynamic = 'force-dynamic'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, access, error } = await requireWorkflowAuth('edit', request)
  if (error) return error
  const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.adminMutation, [user!.id])
  if (limited) return limited
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const { id } = await params
    const result = await reviewSelection(access!.workspaceId, user!.id, id, await request.json())
    return Response.json(result, { headers })
  } catch (error) {
    console.error('Selection review failed:', error)
    return Response.json({ error: error instanceof SelectionReviewError ? error.message : 'Could not save the review. Try: refresh the queue and try again.' },
      { status: error instanceof SelectionReviewError ? 409 : 503, headers })
  }
}
