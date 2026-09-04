import { type NextRequest, type NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

function isDocumentLikePath(pathname: string) {
  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? ''
  return pathname === '/' || !lastSegment.includes('.')
}

function shouldDisableCaching(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (request.method !== 'GET' && request.method !== 'HEAD') return true

  return (
    isDocumentLikePath(pathname) ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/portal/') ||
    pathname.startsWith('/filtering') ||
    pathname.startsWith('/submit-raw-photo')
  )
}

function applyResponseHardening(request: NextRequest, response: NextResponse) {
  // Do not advertise wildcard CORS. Same-origin pages and APIs do not need CORS;
  // setting the response origin to itself makes cross-origin browser reads fail.
  const selfOrigin = `${request.nextUrl.protocol}//${request.nextUrl.host}`
  response.headers.set('Access-Control-Allow-Origin', selfOrigin)

  // HTML, auth, admin, portal and API responses may contain user-specific or
  // security-sensitive state. Prevent browser/proxy storage of those responses.
  if (shouldDisableCaching(request)) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }

  return response
}

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)
  return applyResponseHardening(request, response)
}

export const config = {
  // Host-based admin routing cannot be expressed in a path-only matcher. Match
  // application requests broadly, then return immediately for ordinary public
  // pages inside updateSession. Security headers for excluded Next.js internals
  // are provided by next.config.mjs.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png).*)'],
}
