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
    pathname.startsWith('/editor') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/portal/') ||
    pathname.startsWith('/filtering') ||
    pathname.startsWith('/submit-raw-photo')
  )
}

function applyResponseHardening(request: NextRequest, response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', `${request.nextUrl.protocol}//${request.nextUrl.host}`)
  if (shouldDisableCaching(request)) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }
  return response
}

export async function proxy(request: NextRequest) {
  return applyResponseHardening(request, await updateSession(request))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png).*)'],
}
