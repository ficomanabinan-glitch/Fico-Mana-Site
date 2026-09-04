import { getSupabaseAdmin } from '@/lib/supabase/admin'

export type AdminLoginAuditEvent = {
  userId?: string | null
  ip: string
  userAgent: string
  success: boolean
  failureReason?: string | null
}

async function hashIp(ip: string) {
  const secret =
    process.env.LOGIN_AUDIT_HASH_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!secret) return null

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${ip}`),
  )

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Audit failures must never expose secrets or prevent a legitimate login. */
export async function recordAdminLoginEvent(event: AdminLoginAuditEvent) {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) return

    const ipHash = await hashIp(event.ip)
    if (!ipHash) return

    const userAgent = event.userAgent.replace(/[\r\n]/g, ' ').slice(0, 500)
    const failureReason = event.failureReason?.slice(0, 100) ?? null

    const { error } = await admin.from('admin_login_events').insert({
      user_id: event.userId ?? null,
      ip_hash: ipHash,
      user_agent: userAgent,
      success: event.success,
      failure_reason: failureReason,
    })

    if (error) console.error('Admin login audit insert failed:', error.code)
  } catch {
    console.error('Admin login audit unavailable')
  }
}
