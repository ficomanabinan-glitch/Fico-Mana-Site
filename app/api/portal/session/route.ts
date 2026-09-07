import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  createPortalCookieValue,
  PORTAL_SESSION_COOKIE,
  verifyPortalSignature,
} from '@/lib/client-portal'
import { hasPortalExpired } from '@/lib/portal-expiry'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders, rejectUntrustedMutation } from '@/lib/security/request-security'
import { portalSessionSchema } from '@/lib/security/schemas'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'

export async function POST(request: Request) {
  try {
    const originError = rejectUntrustedMutation(request)
    if (originError) return originError
    const parsed = portalSessionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid portal access link.' }, { status: 401, headers: privateNoStoreHeaders() })
    const { publicId, signature } = parsed.data
    const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.portalSession, [publicId])
    if (limited) return limited
    if (!publicId || !verifyPortalSignature(publicId, signature)) {
      await recordSecurityAuditEvent({ eventType: 'portal_verification_failed', outcome: 'blocked', route: '/api/portal/session' })
      return NextResponse.json({ error: 'Invalid portal access link.' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Portal unavailable.' }, { status: 503 })
    const { data: portal } = await admin
      .from('client_portals')
      .select('status,expires_at')
      .eq('public_id', publicId)
      .maybeSingle()

    if (hasPortalExpired(portal?.expires_at)) {
      await admin.from('client_portals').update({ status: 'expired' }).eq('public_id', publicId)
      return NextResponse.json({ error: 'Portal access has expired.' }, { status: 403 })
    }
    if (!portal || portal.status === 'expired') {
      return NextResponse.json({ error: 'Portal access has expired.' }, { status: 403 })
    }
    if (portal.status !== 'active') {
      return NextResponse.json({ error: 'Portal access is disabled.' }, { status: 403 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(PORTAL_SESSION_COOKIE, createPortalCookieValue(publicId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    Object.entries(privateNoStoreHeaders()).forEach(([key, value]) => response.headers.set(key, value))
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    console.error('POST /api/portal/session', error)
    return NextResponse.json({ error: 'Could not remember this device.' }, { status: 500 })
  }
}
