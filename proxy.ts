import { type NextRequest, type NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { isAdminHost, isEditorHost } from '@/lib/auth/admin'
import { isNewAdminHost } from '@/lib/new-admin/routing'
import { isPrivatePagePath } from '@/lib/public-page-policy'
import { PORTAL_DEVICE_COOKIE, validPortalDeviceId } from '@/lib/security/portal-device'

function shouldDisableCaching(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (request.method !== 'GET' && request.method !== 'HEAD') return true
  if (pathname.startsWith('/api/')) return true
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/newadmin') ||
    pathname.startsWith('/editor') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/portal/') ||
    pathname.startsWith('/shoot-response/') ||
    pathname.startsWith('/filtering') ||
    pathname.startsWith('/submit-raw-photo')
  )
}

function applyResponseHardening(request: NextRequest, response: NextResponse) {
  const host = request.headers.get('host')
  if (isAdminHost(host) || isEditorHost(host) || isNewAdminHost(host) || isPrivatePagePath(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }
  response.headers.set('X-Request-ID', request.headers.get('x-request-id') || crypto.randomUUID())
  // Only this exact GET delegates cache headers to its authorized file handler.
  // Middleware errors/redirects and all other private routes remain no-store.
  const portalImagePassThrough = request.method === 'GET' &&
    /^\/api\/editor-workflow\/portal\/[^/]+\/file\/[^/]+$/.test(request.nextUrl.pathname) &&
    response.headers.get('x-middleware-next') === '1'
  if (shouldDisableCaching(request) && !portalImagePassThrough) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }
  if (request.nextUrl.pathname.startsWith('/portal/') || request.nextUrl.pathname.startsWith('/shoot-response/')) {
    response.headers.set('Referrer-Policy', 'no-referrer')
  }
  if (request.nextUrl.pathname.startsWith('/portal/') || request.nextUrl.pathname.startsWith('/api/editor-workflow/portal/')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
    response.headers.set('Referrer-Policy', 'no-referrer')
  }
  return response
}

export async function proxy(request: NextRequest) {
  const response = applyResponseHardening(request, await updateSession(request))
  // An HttpOnly random cookie distinguishes devices without fingerprinting.
  // Direct image/API calls without it still fall back to the IP allowance.
  if (request.method === 'GET' && /^\/portal\/[0-9a-f-]{36}\/?$/i.test(request.nextUrl.pathname) &&
    !validPortalDeviceId(request.cookies.get(PORTAL_DEVICE_COOKIE)?.value)) {
    response.cookies.set(PORTAL_DEVICE_COOKIE, crypto.randomUUID(), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: 60 * 60 * 24 * 30,
    })
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png).*)'],
}
