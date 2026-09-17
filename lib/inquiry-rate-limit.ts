import type { SupabaseClient } from '@supabase/supabase-js'

export const INQUIRY_RATE_LIMIT = 10
export const INQUIRY_RATE_WINDOW_SECONDS = 60 * 60
export const BOOKING_DEVICE_COOKIE = 'fico_booking_device'

function hashSecret() {
  const secret = process.env.SECURITY_HASH_SECRET || process.env.LOGIN_RATE_LIMIT_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'fico-mana-local-booking-device')
  if (!secret) throw new Error('INQUIRY_RATE_LIMIT_NOT_CONFIGURED')
  return secret
}

async function deviceSignature(id: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(hashSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`booking-device:${id}`))
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** A signed browser identity, not invasive hardware fingerprinting. */
export async function resolveBookingDeviceCookie(value?: string) {
  const [id, signature, extra] = (value ?? '').split('.')
  if (!extra && /^[a-f0-9-]{36}$/.test(id ?? '') && /^[a-f0-9]{64}$/.test(signature ?? '')) {
    const expected = await deviceSignature(id)
    let difference = 0
    for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
    if (difference === 0) return { id, value: value!, created: false }
  }
  const newId = crypto.randomUUID()
  return { id: newId, value: `${newId}.${await deviceSignature(newId)}`, created: true }
}

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
    process.env.SECURITY_HASH_SECRET ||
    process.env.LOGIN_RATE_LIMIT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'fico-mana-inquiry-rate-limit')
  if (!salt) throw new Error('INQUIRY_RATE_LIMIT_NOT_CONFIGURED')
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
