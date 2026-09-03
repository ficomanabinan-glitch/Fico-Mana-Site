import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseUrl, getSupabaseKey } from '@/lib/supabase/env'

const INQUIRY_LIMIT = 20
const INQUIRY_WINDOW_SECONDS = 24 * 60 * 60

async function hashIp(ip: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

async function enforceInquiryRateLimit(request: NextRequest) {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    return NextResponse.json(
      { error: 'Booking service is temporarily unavailable.' },
      { status: 503 },
    )
  }

  const ipHash = await hashIp(requestIp(request), secret)
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/consume_inquiry_rate_limit`, {
    method: 'POST',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_ip_hash: ipHash,
      p_limit: INQUIRY_LIMIT,
      p_window_seconds: INQUIRY_WINDOW_SECONDS,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    console.error('Inquiry rate limit RPC failed:', response.status)
    return NextResponse.json(
      { error: 'Booking service is temporarily unavailable.' },
      { status: 503 },
    )
  }

  const rows = (await response.json()) as Array<{
    allowed: boolean
    remaining: number
    reset_at: string
  }>
  const result = rows[0]

  if (!result?.allowed) {
    return NextResponse.json(
      {
        error: 'Too many submissions from this connection. Please try again after the 24-hour limit resets.',
        limit: INQUIRY_LIMIT,
        remaining: 0,
        resetAt: result?.reset_at ?? null,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(INQUIRY_WINDOW_SECONDS),
          'X-RateLimit-Limit': String(INQUIRY_LIMIT),
          'X-RateLimit-Remaining': '0',
        },
      },
    )
  }

  return null
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAdminLogin = pathname === '/admin'
  const isAdminRoute = pathname.startsWith('/admin')
  const isFilteringRoute = pathname === '/filtering' || pathname.startsWith('/filtering/')
  const isPublicBookingSubmission = pathname === '/api/bookings' && request.method === 'POST' && !user

  if (isPublicBookingSubmission) {
    const limited = await enforceInquiryRateLimit(request)
    if (limited) return limited
  }

  if (isAdminRoute && !isAdminLogin && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    return NextResponse.redirect(url)
  }

  if (isFilteringRoute && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = '?redirect=/admin/filtering'
    return NextResponse.redirect(url)
  }

  if (isAdminLogin && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
