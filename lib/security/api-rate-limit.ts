import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

export type ApiRateLimitPolicy = {
  name: string
  limit: number
  windowSeconds: number
  failClosed?: boolean
  aggregateLimit?: number
}

export const API_RATE_LIMITS = {
  bookingCreate: { name: 'booking-create', limit: 10, aggregateLimit: 30, windowSeconds: 60 * 60, failClosed: true },
  bookingLookup: { name: 'booking-lookup', limit: 12, aggregateLimit: 60, windowSeconds: 15 * 60, failClosed: true },
  receiptUpload: { name: 'receipt-upload', limit: 10, windowSeconds: 60 * 60, failClosed: true },
  receiptAccess: { name: 'receipt-access', limit: 120, windowSeconds: 15 * 60, failClosed: true },
  rawLookup: { name: 'raw-lookup', limit: 12, aggregateLimit: 60, windowSeconds: 15 * 60, failClosed: true },
  rawSubmit: { name: 'raw-submit', limit: 8, windowSeconds: 60 * 60, failClosed: true },
  portalSession: { name: 'portal-session', limit: 20, aggregateLimit: 100, windowSeconds: 15 * 60, failClosed: true },
  portalRead: { name: 'portal-read', limit: 240, windowSeconds: 5 * 60, failClosed: true },
  portalSelection: { name: 'portal-selection', limit: 10, windowSeconds: 10 * 60, failClosed: true },
  portalSubmissionPin: { name: 'portal-submission-pin', limit: 5, windowSeconds: 15 * 60, failClosed: true },
  portalDownload: { name: 'portal-download', limit: 12, windowSeconds: 60 * 60, failClosed: true },
  // Abuse control only. The completed-download business allowance is enforced
  // atomically in the database so interrupted transfers do not consume access.
  portalRawDownload: { name: 'portal-raw-download', limit: 10, windowSeconds: 60 * 60, failClosed: true },
  portalRawDownloadRequest: { name: 'portal-raw-download-request', limit: 3, windowSeconds: 24 * 60 * 60, failClosed: true },
  editorUpload: { name: 'editor-upload', limit: 1_000, windowSeconds: 60 * 60, failClosed: true },
  websiteMediaUpload: { name: 'website-media-upload', limit: 60, windowSeconds: 60 * 60, failClosed: true },
  storageOperation: { name: 'storage-operation', limit: 120, windowSeconds: 15 * 60, failClosed: true },
  adminMutation: { name: 'admin-mutation', limit: 180, windowSeconds: 5 * 60, failClosed: true },
} as const satisfies Record<string, ApiRateLimitPolicy>

type DatabaseRow = { allowed: boolean; remaining: number; reset_at: string }
type RedisResponse<T> = { result?: T; error?: string }

function rateLimitSecret() {
  return (
    process.env.SECURITY_HASH_SECRET ||
    process.env.LOGIN_RATE_LIMIT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    ''
  )
}

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token && rateLimitSecret() ? { url, token } : null
}

export function requestClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-vercel-forwarded-for')?.trim() ||
    'unknown'
  )
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function rateLimitKey(request: Request, policy: ApiRateLimitPolicy, dimensions: string[]) {
  const secret = rateLimitSecret()
  if (!secret) throw new Error('API_RATE_LIMIT_NOT_CONFIGURED')
  const safeDimensions = dimensions.map((value) => value.trim().slice(0, 300)).filter(Boolean)
  return sha256(`${secret}:${policy.name}:${requestClientIp(request)}:${safeDimensions.join(':')}`)
}

async function redisCommand<T>(command: Array<string | number>) {
  const config = upstashConfig()
  if (!config) throw new Error('UPSTASH_NOT_CONFIGURED')
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('UPSTASH_UNAVAILABLE')
  const payload = (await response.json()) as RedisResponse<T>
  if (payload.error || payload.result === undefined) throw new Error('UPSTASH_UNAVAILABLE')
  return payload.result
}

async function consumeWithRedis(key: string, policy: ApiRateLimitPolicy) {
  const script = [
    "local count = redis.call('INCR', KEYS[1])",
    "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
    "local ttl = redis.call('TTL', KEYS[1])",
    'return {count, ttl}',
  ].join('\n')
  const [count, ttl] = await redisCommand<[number, number]>([
    'EVAL',
    script,
    1,
    `fico-mana:api:${policy.name}:${key}`,
    policy.windowSeconds,
  ])
  const attempts = Number(count)
  const retryAfterSeconds = Math.max(1, Number(ttl))
  return {
    allowed: attempts <= policy.limit,
    remaining: Math.max(0, policy.limit - attempts),
    retryAfterSeconds,
    resetAt: new Date(Date.now() + retryAfterSeconds * 1_000).toISOString(),
  }
}

async function consumeWithDatabase(key: string, policy: ApiRateLimitPolicy) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('RATE_LIMIT_DB_NOT_CONFIGURED')
  const { data, error } = await admin.rpc('consume_api_rate_limit', {
    p_key_hash: key,
    p_policy: policy.name,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  })
  if (error) throw new Error('RATE_LIMIT_DB_UNAVAILABLE')
  const row = (Array.isArray(data) ? data[0] : data) as DatabaseRow | undefined
  if (!row) throw new Error('RATE_LIMIT_DB_INVALID_RESPONSE')
  const resetAt = String(row.reset_at)
  return {
    allowed: Boolean(row.allowed),
    remaining: Number(row.remaining),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 1_000)),
  }
}

export async function enforceApiRateLimit(
  request: Request,
  policy: ApiRateLimitPolicy,
  dimensions: Array<string | null | undefined> = [],
): Promise<NextResponse | null> {
  // A broader IP quota stops identifier rotation without penalizing ordinary
  // shared-network traffic at the tighter per-resource quota.
  if (policy.aggregateLimit) {
    const aggregateError = await enforceApiRateLimit(request, {
      name: `${policy.name}-aggregate`, limit: policy.aggregateLimit,
      windowSeconds: policy.windowSeconds, failClosed: policy.failClosed,
    })
    if (aggregateError) return aggregateError
  }
  try {
    const key = await rateLimitKey(
      request,
      policy,
      dimensions.filter((value): value is string => typeof value === 'string'),
    )
    let result
    if (upstashConfig()) {
      try {
        result = await consumeWithRedis(key, policy)
      } catch {
        result = await consumeWithDatabase(key, policy)
      }
    } else {
      result = await consumeWithDatabase(key, policy)
    }

    if (result.allowed) return null
    await recordSecurityAuditEvent({
      eventType: 'rate_limit_violation',
      outcome: 'blocked',
      route: new URL(request.url).pathname,
      metadata: { policy: policy.name },
    })
    return NextResponse.json(
      {
        error: 'Too many requests. Please wait and try again.',
        code: 'RATE_LIMITED',
        retryAt: result.resetAt,
      },
      {
        status: 429,
        headers: {
          ...privateNoStoreHeaders(),
          'Retry-After': String(result.retryAfterSeconds),
          'X-RateLimit-Limit': String(policy.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    )
  } catch {
    if (process.env.NODE_ENV === 'production' && policy.failClosed) {
      return NextResponse.json(
        { error: 'This operation is temporarily unavailable.', code: 'RATE_LIMIT_UNAVAILABLE' },
        { status: 503, headers: privateNoStoreHeaders() },
      )
    }
    return null
  }
}
