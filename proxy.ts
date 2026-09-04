import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Host-based admin routing cannot be expressed in a path-only matcher. Match
  // application requests broadly, then return immediately for ordinary public
  // pages inside updateSession. Static Next.js assets never enter Proxy.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icon.png).*)'],
}
