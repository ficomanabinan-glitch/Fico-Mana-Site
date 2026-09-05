'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { recordAdminLoginEvent } from '@/lib/auth/admin-audit'
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
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

export async function loginEditor(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const requestHeaders = await headers()
  const ip = requestIp(requestHeaders)
  const userAgent = requestHeaders.get('user-agent') ?? 'Unknown device'
  if (!isLoginRateLimitConfigured() && process.env.NODE_ENV === 'production') {
    return { success: false, code: 'SERVER_ERROR', message: 'Login protection is temporarily unavailable.' }
  }
  try {
    const limit = await checkLoginRateLimit(ip)
    if (limit.blocked) return { success: false, code: 'RATE_LIMITED', message: 'Too many login attempts.', retryAfterSeconds: limit.retryAfterSeconds, retryAt: limit.retryAt }
    const emailValue = formData.get('email')
    const passwordValue = formData.get('password')
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : ''
    const password = typeof passwordValue === 'string' ? passwordValue : ''
    if (!email || email.length > 320 || !password || password.length > 1024) {
      await recordFailedLogin(ip)
      return { success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
    }
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    const access = data.user ? await getWorkflowAccess(data.user) : null
    if (error || !data.user || !access) {
      if (data.user) await supabase.auth.signOut()
      await recordFailedLogin(ip)
      await recordAdminLoginEvent({ userId: data.user?.id, ip, userAgent, success: false, failureReason: data.user ? 'unauthorized_editor_role' : 'invalid_credentials' })
      return { success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid login or this account has no editor workspace access.' }
    }
    await clearLoginRateLimit(ip).catch(() => undefined)
    await recordAdminLoginEvent({ userId: data.user.id, ip, userAgent, success: true })
  } catch {
    return { success: false, code: 'SERVER_ERROR', message: 'Unable to sign in securely right now. Please try again later.' }
  }
  redirect('/editor')
}
