import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  createPortalCookieValue,
  PORTAL_SESSION_COOKIE,
  verifyPortalSignature,
} from '@/lib/client-portal'

type Body = { publicId?: string; signature?: string }

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const publicId = body.publicId?.trim() || ''
    const signature = body.signature?.trim() || ''
    if (!publicId || !verifyPortalSignature(publicId, signature)) {
      return NextResponse.json({ error: 'Invalid portal access link.' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Portal unavailable.' }, { status: 503 })
    const { data: portal } = await admin
      .from('client_portals')
      .select('status,expires_at')
      .eq('public_id', publicId)
      .maybeSingle()

    if (!portal || portal.status !== 'active') {
      return NextResponse.json({ error: 'Portal access is disabled.' }, { status: 403 })
    }
    if (portal.expires_at && new Date(portal.expires_at).getTime() <= Date.now()) {
      await admin.from('client_portals').update({ status: 'expired' }).eq('public_id', publicId)
      return NextResponse.json({ error: 'Portal access has expired.' }, { status: 403 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(PORTAL_SESSION_COOKIE, createPortalCookieValue(publicId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: `/portal/${publicId}`,
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  } catch (error) {
    console.error('POST /api/portal/session', error)
    return NextResponse.json({ error: 'Could not remember this device.' }, { status: 500 })
  }
}
