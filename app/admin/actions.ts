'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/auth/admin'
import { recordAdminLoginEvent } from '@/lib/auth/admin-audit'
import { sendAdminLoginAlert } from '@/lib/auth/login-alert'
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  isLoginRateLimitConfigured,
  recordFailedLogin,
} from '@/lib/auth/login-rate-limit'
import type { LoginActionState } from '@/lib/auth/login-state'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function requestIp(requestHeaders: Headers) {
  // Vercel overwrites x-forwarded-for at its edge, preventing normal clients
  // from spoofing this value. x-real-ip is only a local/non-Vercel fallback.
  const forwarded = requestHeaders.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return requestHeaders.get('x-real-ip')?.trim() || 'unknown'
}

function invalidCredentials(): LoginActionState {
  return {
    success: false,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  }
}

function rateLimited(retryAfterSeconds: number, retryAt: number): LoginActionState {
  return {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many login attempts.',
    retryAfterSeconds,
    retryAt,
  }
}

export async function loginAdmin(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const requestHeaders = await headers()
  const ip = requestIp(requestHeaders)
  const userAgent = requestHeaders.get('user-agent') ?? 'Unknown device'

  if (!isLoginRateLimitConfigured() && process.env.NODE_ENV === 'production') {
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: 'Login protection is temporarily unavailable. Please try again later.',
    }
  }

  try {
    const limit = await checkLoginRateLimit(ip)
    if (limit.blocked) {
      await recordAdminLoginEvent({
        ip,
        userAgent,
        success: false,
        failureReason: 'rate_limited',
      })
      return rateLimited(limit.retryAfterSeconds, limit.retryAt)
    }

    const emailValue = formData.get('email')
    const passwordValue = formData.get('password')
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : ''
    const password = typeof passwordValue === 'string' ? passwordValue : ''

    // Bound input size before passing data into the authentication provider.
    if (!email || email.length > 320 || !password || password.length > 1024) {
      await recordFailedLogin(ip)
      await recordAdminLoginEvent({
        ip,
        userAgent,
        success: false,
        failureReason: 'invalid_input',
      })
      return invalidCredentials()
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      await recordFailedLogin(ip)
      await recordAdminLoginEvent({
        ip,
        userAgent,
        success: false,
        failureReason: 'invalid_credentials',
      })
      return invalidCredentials()
    }

    // Authentication alone is not authorization. A valid Supabase user who is
    // not an admin is immediately signed out and receives the same generic error.
    if (!isAdminUser(data.user)) {
      await supabase.auth.signOut()
      await recordFailedLogin(ip)
      await recordAdminLoginEvent({
        userId: data.user.id,
        ip,
        userAgent,
        success: false,
        failureReason: 'unauthorized_role',
      })
      return invalidCredentials()
    }

    try {
      await clearLoginRateLimit(ip)
    } catch {
      // Authentication already succeeded; a Redis cleanup outage should not
      // destroy the valid session. The key will expire on its own.
      console.error('Admin login rate-limit cleanup failed')
    }

    await recordAdminLoginEvent({
      userId: data.user.id,
      ip,
      userAgent,
      success: true,
    })

    if (data.user.email) {
      await sendAdminLoginAlert({ adminEmail: data.user.email, ip, userAgent })
    }
  } catch {
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: 'Unable to sign in securely right now. Please try again later.',
    }
  }

  redirect('/admin/dashboard')
}
