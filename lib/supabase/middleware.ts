import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAdminHost, isAdminUser, isEditorHost } from '@/lib/auth/admin'
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

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach(({ name, value, ...options }) => {
    target.cookies.set(name, value, options)
  })
  return target
}

function isStaticAsset(pathname: string) {
  return /\.[a-z0-9]{1,8}$/i.test(pathname)
}

function isAdminHostPassThrough(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    isStaticAsset(pathname)
  )
}

function adminSubdomainAlias(request: NextRequest) {
  if (!isAdminHost(request.headers.get('host'))) return null
  const { pathname } = request.nextUrl
  if (isAdminHostPassThrough(pathname)) return null

  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? '/admin' : `/admin${pathname}`
  return NextResponse.redirect(url)
}

function maybeEnforceAdminSubdomain(request: NextRequest) {
  if (process.env.ADMIN_ENFORCE_SUBDOMAIN !== 'true') return null
  if (isAdminHost(request.headers.get('host'))) return null
  if (!request.nextUrl.pathname.startsWith('/admin')) return null

  const url = request.nextUrl.clone()
  url.protocol = 'https:'
  url.host = process.env.ADMIN_HOSTNAME?.trim() || 'admin.ficomana.com'
  return NextResponse.redirect(url)
}

function maybeEnforceEditorSubdomain(request: NextRequest) {
  if (process.env.EDITOR_ENFORCE_SUBDOMAIN !== 'true') return null
  if (isEditorHost(request.headers.get('host'))) return null
  if (!request.nextUrl.pathname.startsWith('/editor')) return null
  const url = request.nextUrl.clone()
  url.protocol = 'https:'
  url.host = process.env.EDITOR_HOSTNAME?.trim() || 'editor.ficomana.com'
  return NextResponse.redirect(url)
}

function isEditorHostPassThrough(pathname: string) {
  return (
    pathname.startsWith('/editor') ||
    pathname.startsWith('/api/editor-workflow') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    isStaticAsset(pathname)
  )
}

function editorSubdomainAlias(request: NextRequest) {
  if (!isEditorHost(request.headers.get('host'))) return null
  const { pathname } = request.nextUrl
  if (isEditorHostPassThrough(pathname)) return null
  const url = request.nextUrl.clone()
  url.pathname = pathname === '/' ? '/editor' : `/editor${pathname}`
  return NextResponse.redirect(url)
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
  const editorAlias = editorSubdomainAlias(request)
  if (editorAlias) return editorAlias

  const alias = adminSubdomainAlias(request)
  if (alias) return alias

  const enforceSubdomain = maybeEnforceAdminSubdomain(request)
  if (enforceSubdomain) return enforceSubdomain

  const enforceEditorSubdomain = maybeEnforceEditorSubdomain(request)
  if (enforceEditorSubdomain) return enforceEditorSubdomain

  const { pathname } = request.nextUrl
  const isAdminLogin = pathname === '/admin'
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/')
  const isEditorLogin = pathname === '/editor/login'
  const isEditorRoute = pathname === '/editor' || pathname.startsWith('/editor/')
  const isFilteringRoute = pathname === '/filtering' || pathname.startsWith('/filtering/')
  const isBookingApi = pathname === '/api/bookings' || pathname.startsWith('/api/bookings/')
  const isSensitiveApi =
    isBookingApi ||
    pathname.startsWith('/api/notifications') ||
    pathname.startsWith('/api/ops-subscriptions') ||
    pathname.startsWith('/api/emails') ||
    pathname.startsWith('/api/sales') ||
    pathname.startsWith('/api/provisioning') ||
    pathname.startsWith('/api/editor-workflow') ||
    pathname.startsWith('/api/integrations') ||
    pathname.startsWith('/api/sync')
  const isAuthCallback = pathname === '/auth/callback'

  // Broad matching is needed for admin.ficomana.com aliases. Avoid doing any
  // Supabase work for ordinary public-site requests.
  if (!isAdminRoute && !isEditorRoute && !isFilteringRoute && !isSensitiveApi && !isAuthCallback) {
    return NextResponse.next()
  }

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

  // getUser validates the token with Supabase Auth; getSession alone is not
  // sufficient for authorization at this trust boundary.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const admin = isAdminUser(user)
  const isPublicBookingSubmission = pathname === '/api/bookings' && request.method === 'POST' && !user

  if (isPublicBookingSubmission) {
    const limited = await enforceInquiryRateLimit(request)
    if (limited) return limited
  }

  if (isAdminRoute && !isAdminLogin && !admin) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = ''
    url.searchParams.set('error', user ? 'unauthorized' : 'auth')
    url.searchParams.set('redirect', pathname)
    return copyResponseCookies(supabaseResponse, NextResponse.redirect(url))
  }

  if (isFilteringRoute && !admin) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = ''
    return copyResponseCookies(supabaseResponse, NextResponse.redirect(url))
  }

  if (isAdminLogin && admin) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/dashboard'
    url.search = ''
    return copyResponseCookies(supabaseResponse, NextResponse.redirect(url))
  }

  if (isEditorRoute && !isEditorLogin && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/editor/login'
    url.search = ''
    return copyResponseCookies(supabaseResponse, NextResponse.redirect(url))
  }

  if (isEditorLogin && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/editor'
    url.search = ''
    return copyResponseCookies(supabaseResponse, NextResponse.redirect(url))
  }

  return supabaseResponse
}
