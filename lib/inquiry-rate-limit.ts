import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const INQUIRY_RATE_LIMIT = 20
export const INQUIRY_RATE_WINDOW_SECONDS = 24 * 60 * 60

function getClientIp(request: Request): string {
  const headers = request.headers
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return headers.get('x-real-ip')?.trim() || headers.get('x-vercel-forwarded-for')?.trim() || 'unknown'
}

function hashClientIp(request: Request): string {
  const ip = getClientIp(request)
  const salt = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fico-mana-inquiry-rate-limit'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

export async function consumeInquiryRateLimit(admin: SupabaseClient, request: Request) {
  const { data, error } = await admin.rpc('consume_inquiry_rate_limit', {
    p_ip_hash: hashClientIp(request),
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
