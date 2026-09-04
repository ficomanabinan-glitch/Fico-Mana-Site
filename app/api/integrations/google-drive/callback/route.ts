import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import {
  encryptGoogleRefreshToken,
  exchangeGoogleAuthorizationCode,
  verifyGoogleOAuthState,
} from '@/lib/google-oauth'

function redirectWith(params: Record<string, string>) {
  const url = new URL('/admin/provisioning', getSiteUrl())
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return redirectWith({ drive_error: 'Your admin session expired. Sign in again, then reconnect Google Drive.' })

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

    return redirectWith({ drive_connected: token.email })
  } catch (error) {
    console.error('Google Drive OAuth callback failed:', error)
    return redirectWith({ drive_error: error instanceof Error ? error.message : 'Google Drive connection failed.' })
  }
}
