import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { buildGoogleAuthorizationUrl, googleOAuthSiteUrl } from '@/lib/google-oauth'

export async function GET() {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError

  try {
    const loginHint = process.env.GOOGLE_DRIVE_ALLOWED_EMAIL?.trim() || undefined
    return NextResponse.redirect(buildGoogleAuthorizationUrl(loginHint))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Drive connection could not start.'
    return NextResponse.redirect(
      new URL(`/admin/provisioning?drive_error=${encodeURIComponent(message)}`, googleOAuthSiteUrl()),
    )
  }
}
