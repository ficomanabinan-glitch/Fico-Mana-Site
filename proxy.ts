import { type NextRequest, type NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

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
  response.headers.set('X-Request-ID', request.headers.get('x-request-id') || crypto.randomUUID())
  if (shouldDisableCaching(request)) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }
  if (request.nextUrl.pathname.startsWith('/portal/') || request.nextUrl.pathname.startsWith('/shoot-response/')) {
    response.headers.set('Referrer-Policy', 'no-referrer')
  }
  return response
}

export async function proxy(request: NextRequest) {
  return applyResponseHardening(request, await updateSession(request))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png).*)'],
}
