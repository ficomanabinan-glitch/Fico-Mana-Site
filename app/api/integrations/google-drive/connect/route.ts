import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { buildGoogleAuthorizationUrl, googleOAuthSiteUrl } from '@/lib/google-oauth'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { secureErrorMessage } from '@/lib/security/error-response'

export async function GET(request: Request) {
  const { user, error: authError } = await requireStaffAuth(request)
  if (authError) return authError
  const rateLimit = await enforceApiRateLimit(request, API_RATE_LIMITS.driveOperation, [
    user?.id,
    'connect',
  ])
  if (rateLimit) return rateLimit

  try {
    const loginHint = process.env.GOOGLE_DRIVE_ALLOWED_EMAIL?.trim() || undefined
    return NextResponse.redirect(buildGoogleAuthorizationUrl(loginHint))
  } catch (error) {
    const message = secureErrorMessage(error, 'Google Drive connection could not start.')
    return NextResponse.redirect(
      new URL(`/admin/provisioning?drive_error=${encodeURIComponent(message)}`, googleOAuthSiteUrl()),
    )
  }
}
