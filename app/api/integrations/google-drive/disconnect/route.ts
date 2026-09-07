import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'
import { secureErrorResponse } from '@/lib/security/error-response'

export async function POST(request: Request) {
  const { user, error: authError } = await requireStaffAuth(request)
  if (authError) return authError
  const rateLimit = await enforceApiRateLimit(request, API_RATE_LIMITS.driveOperation, [
    user?.id,
    'disconnect',
  ])
  if (rateLimit) return rateLimit

  try {
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'This service is temporarily unavailable. Try: refresh the page, or contact your administrator.' }, { status: 500 })
    const now = new Date().toISOString()
    const { error } = await admin
      .from('google_drive_settings')
      .update({
        account_email: null,
        refresh_token_encrypted: null,
        granted_scopes: null,
        disconnected_at: now,
        updated_at: now,
      })
      .eq('id', 1)
    if (error) throw new Error(error.message)

    await admin.from('provisioning_audit').insert({
      booking_id: null,
      action: 'google_drive_disconnected',
      actor_type: 'staff',
      actor_id: user?.id || null,
      metadata: {},
    })
    await recordSecurityAuditEvent({
      eventType: 'google_drive_disconnected',
      outcome: 'success',
      actorId: user?.id,
      route: '/api/integrations/google-drive/disconnect',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return secureErrorResponse(error, 'Could not disconnect Google Drive.', {
      request,
      context: 'POST /api/integrations/google-drive/disconnect',
    })
  }
}
