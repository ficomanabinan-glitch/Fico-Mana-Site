import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  encryptGoogleRefreshToken,
  exchangeGoogleAuthorizationCode,
  googleOAuthSiteUrl,
  verifyGoogleOAuthState,
} from '@/lib/google-oauth'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'

function redirectWith(params: Record<string, string>) {
  const url = new URL('/admin/provisioning', googleOAuthSiteUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const { user, error: authError } = await requireStaffAuth(request)
  if (authError) return redirectWith({ drive_error: 'Your admin session expired. Sign in again, then reconnect Google Drive.' })
  const rateLimit = await enforceApiRateLimit(request, API_RATE_LIMITS.driveOperation, [
    user?.id,
    'callback',
  ])
  if (rateLimit) return rateLimit

  try {
    const url = new URL(request.url)
    const oauthError = url.searchParams.get('error')
    if (oauthError) return redirectWith({ drive_error: `Google authorization was not completed (${oauthError}).` })

    const code = url.searchParams.get('code')
    const state = verifyGoogleOAuthState(url.searchParams.get('state'))
    if (!code || !state) return redirectWith({ drive_error: 'Invalid or expired Google OAuth callback.' })

    const token = await exchangeGoogleAuthorizationCode(code)
    const allowedEmail = process.env.GOOGLE_DRIVE_ALLOWED_EMAIL?.trim().toLowerCase() || ''
    if (allowedEmail && token.email.toLowerCase() !== allowedEmail) {
      return redirectWith({ drive_error: `Connect ${allowedEmail}, not ${token.email}.` })
    }

    const admin = getSupabaseAdmin()
    if (!admin) return redirectWith({ drive_error: 'Database admin client unavailable.' })

    const now = new Date().toISOString()
    const { error } = await admin
      .from('google_drive_settings')
      .update({
        account_email: token.email,
        refresh_token_encrypted: encryptGoogleRefreshToken(token.refreshToken),
        granted_scopes: token.scopes,
        connected_at: now,
        disconnected_at: null,
        updated_at: now,
      })
      .eq('id', 1)
    if (error) throw new Error(error.message)

    await admin.from('provisioning_audit').insert({
      booking_id: null,
      action: 'google_drive_connected',
      actor_type: 'staff',
      actor_id: user?.id || null,
      metadata: { accountEmail: token.email, scopes: token.scopes },
    })
    await recordSecurityAuditEvent({
      eventType: 'google_drive_connected',
      outcome: 'success',
      actorId: user?.id,
      route: '/api/integrations/google-drive/callback',
      metadata: { accountEmail: token.email },
    })

    return redirectWith({ drive_connected: token.email })
  } catch (error) {
    const requestId = crypto.randomUUID()
    console.error(`Google Drive OAuth callback failed [${requestId}]:`, error)
    await recordSecurityAuditEvent({
      eventType: 'google_drive_connection_failed',
      outcome: 'failure',
      actorId: user?.id,
      route: '/api/integrations/google-drive/callback',
    })
    return redirectWith({
      drive_error: process.env.NODE_ENV === 'production'
        ? `Google Drive connection failed. Reference: ${requestId}`
        : error instanceof Error
          ? error.message
          : 'Google Drive connection failed.',
    })
  }
}
