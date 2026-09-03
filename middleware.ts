import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/admin',
    '/filtering',
    '/filtering/:path*',
    '/api/bookings',
    '/api/bookings/:path*',
    '/api/notifications',
    '/api/notifications/:path*',
    '/api/ops-subscriptions',
    '/api/emails/logs',
    '/api/emails/send',
    '/api/emails/health',
    '/auth/callback',
  ],
}
