import type { SupabaseClient } from '@supabase/supabase-js'

export const INQUIRY_RATE_LIMIT = 20
export const INQUIRY_RATE_WINDOW_SECONDS = 24 * 60 * 60

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-vercel-forwarded-for')?.trim() ||
    'unknown'
  )
}

async function hashClientIp(request: Request): Promise<string> {
  const ip = getClientIp(request)
  const salt =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'fico-mana-inquiry-rate-limit'
  const bytes = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function consumeInquiryRateLimit(admin: SupabaseClient, request: Request) {
  const { data, error } = await admin.rpc('consume_inquiry_rate_limit', {
    p_ip_hash: await hashClientIp(request),
    p_limit: INQUIRY_RATE_LIMIT,
    p_window_seconds: INQUIRY_RATE_WINDOW_SECONDS,
  })

  if (error) throw new Error(`Rate limit check failed: ${error.message}`)

  const row = Array.isArray(data) ? data[0] : data
  return {
    allowed: Boolean(row?.allowed),
    remaining: Number(row?.remaining ?? 0),
    resetAt: row?.reset_at ? String(row.reset_at) : null,
  }
}
