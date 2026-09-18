'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isAdminUser } from '@/lib/auth/admin'
import { recordAdminLoginEvent } from '@/lib/auth/admin-audit'
import { sendAdminLoginAlert } from '@/lib/auth/login-alert'
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  isLoginRateLimitEnabled,
  isLoginRateLimitConfigured,
  recordFailedLogin,
} from '@/lib/auth/login-rate-limit'
import type { LoginActionState } from '@/lib/auth/login-state'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function requestIp(requestHeaders: Headers) {
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

export async function loginAdmin(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const requestHeaders = await headers()
  const ip = requestIp(requestHeaders)
  const userAgent = requestHeaders.get('user-agent') ?? 'Unknown device'
  const loginRateLimitEnabled = isLoginRateLimitEnabled()

  if (loginRateLimitEnabled && !isLoginRateLimitConfigured() && process.env.NODE_ENV === 'production') {
    return { success: false, code: 'SERVER_ERROR', message: 'Login protection is temporarily unavailable.' }
  }

  try {
    if (loginRateLimitEnabled) {
      const limit = await checkLoginRateLimit(ip)
      if (limit.blocked) {
        await recordAdminLoginEvent({ ip, userAgent, success: false, failureReason: 'rate_limited' })
        return { success: false, code: 'RATE_LIMITED', message: 'Too many login attempts.', retryAfterSeconds: limit.retryAfterSeconds, retryAt: limit.retryAt }
      }
    }

    const emailValue = formData.get('email')
    const passwordValue = formData.get('password')
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : ''
    const password = typeof passwordValue === 'string' ? passwordValue : ''
    if (!email || email.length > 320 || !password || password.length > 1024) {
      if (loginRateLimitEnabled) await recordFailedLogin(ip)
      await recordAdminLoginEvent({ ip, userAgent, success: false, failureReason: 'invalid_input' })
      return invalidCredentials()
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user || !isAdminUser(data.user)) {
      if (data.user) await supabase.auth.signOut({ scope: 'local' })
      if (loginRateLimitEnabled) await recordFailedLogin(ip)
      await recordAdminLoginEvent({ userId: data.user?.id, ip, userAgent, success: false, failureReason: data.user ? 'unauthorized_role' : 'invalid_credentials' })
      return invalidCredentials()
    }

    if (loginRateLimitEnabled) {
      try { await clearLoginRateLimit(ip) } catch { console.error('Admin login rate-limit cleanup failed') }
    }
    await recordAdminLoginEvent({ userId: data.user.id, ip, userAgent, success: true })
    if (data.user.email) await sendAdminLoginAlert({ adminEmail: data.user.email, ip, userAgent })

  } catch {
    return { success: false, code: 'SERVER_ERROR', message: 'Unable to sign in securely right now. Please try again later.' }
  }

  redirect('/admin/dashboard')
}
