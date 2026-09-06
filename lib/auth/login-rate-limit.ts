import { getSupabaseAdmin } from '@/lib/supabase/admin'

const LOGIN_LIMIT = 5
const LOGIN_WINDOW_SECONDS = 15 * 60

export type LoginRateLimitState = {
  configured: boolean
  blocked: boolean
  attempts: number
  retryAfterSeconds: number
  retryAt: number
}

type RedisResponse<T> = {
  result?: T
  error?: string
}

type DatabaseRateLimitRow = {
  attempts: number
  blocked: boolean
  retry_after_seconds: number
}

function serviceSecret() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
}

function hashSecret() {
  return (
    process.env.LOGIN_RATE_LIMIT_SECRET ||
    process.env.SECURITY_HASH_SECRET ||
    (process.env.NODE_ENV === 'production' ? undefined : serviceSecret())
  )
}

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const secret = hashSecret()
  if (!url || !token || !secret) return null
  return { url, token, secret }
}

function hasSupabaseFallback() {
  return !!(serviceSecret() && hashSecret())
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function keyForIp(ip: string) {
  const secret = hashSecret()
  if (!secret) throw new Error('LOGIN_RATE_LIMIT_NOT_CONFIGURED')
  return sha256(`${secret}:admin-login:${ip}`)
}

async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  const config = getUpstashConfig()
  if (!config) throw new Error('UPSTASH_NOT_CONFIGURED')

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  })

  if (!response.ok) throw new Error('UPSTASH_UNAVAILABLE')

  const payload = (await response.json()) as RedisResponse<T>
  if (payload.error || payload.result === undefined) throw new Error('UPSTASH_UNAVAILABLE')
  return payload.result
}

function state(attempts: number, ttl: number, configured = true): LoginRateLimitState {
  const retryAfterSeconds = Math.max(0, ttl)
  return {
    configured,
    blocked: attempts >= LOGIN_LIMIT && retryAfterSeconds > 0,
    attempts,
    retryAfterSeconds,
    retryAt: Math.floor(Date.now() / 1000) + retryAfterSeconds,
  }
}

function parseDatabaseRow(data: unknown) {
  if (!Array.isArray(data) || data.length === 0) throw new Error('RATE_LIMIT_DB_INVALID_RESPONSE')
  const row = data[0] as DatabaseRateLimitRow
  return state(Number(row.attempts), Number(row.retry_after_seconds))
}

async function databaseCheck(key: string) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('RATE_LIMIT_DB_NOT_CONFIGURED')
  const { data, error } = await admin.rpc('check_admin_login_rate_limit', {
    p_key_hash: key,
    p_limit: LOGIN_LIMIT,
    p_window_seconds: LOGIN_WINDOW_SECONDS,
  })
  if (error) throw new Error('RATE_LIMIT_DB_UNAVAILABLE')
  return parseDatabaseRow(data)
}

async function databaseRecordFailure(key: string) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('RATE_LIMIT_DB_NOT_CONFIGURED')
  const { data, error } = await admin.rpc('record_admin_login_failure', {
    p_key_hash: key,
    p_limit: LOGIN_LIMIT,
    p_window_seconds: LOGIN_WINDOW_SECONDS,
  })
  if (error) throw new Error('RATE_LIMIT_DB_UNAVAILABLE')
  return parseDatabaseRow(data)
}

async function databaseClear(key: string) {
  const admin = getSupabaseAdmin()
  if (!admin) return
  const { error } = await admin.rpc('clear_admin_login_rate_limit', { p_key_hash: key })
  if (error) throw new Error('RATE_LIMIT_DB_UNAVAILABLE')
}

export function isLoginRateLimitConfigured() {
  return !!getUpstashConfig() || hasSupabaseFallback()
}

/** Check before authenticating. The sixth attempt is blocked after five failures. */
export async function checkLoginRateLimit(ip: string): Promise<LoginRateLimitState> {
  const key = await keyForIp(ip)
  const upstash = getUpstashConfig()

  if (upstash) {
    try {
      const redisKey = `fico-mana:admin-login:${key}`
      const attempts = Number((await redisCommand<string | number | null>(['GET', redisKey])) ?? 0)
      if (attempts < LOGIN_LIMIT) return state(attempts, 0)
      const ttl = Number(await redisCommand<number>(['TTL', redisKey]))
      return state(attempts, Math.max(1, ttl))
    } catch {
      if (!hasSupabaseFallback()) throw new Error('LOGIN_RATE_LIMIT_UNAVAILABLE')
    }
  }

  return databaseCheck(key)
}

/** Atomically increments the failed-attempt counter and starts the 15-minute window. */
export async function recordFailedLogin(ip: string): Promise<LoginRateLimitState> {
  const key = await keyForIp(ip)
  const upstash = getUpstashConfig()

  if (upstash) {
    try {
      const redisKey = `fico-mana:admin-login:${key}`
      const script = [
        "local count = redis.call('INCR', KEYS[1])",
        "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
        "local ttl = redis.call('TTL', KEYS[1])",
        'return {count, ttl}',
      ].join('\n')
      const [attempts, ttl] = await redisCommand<[number, number]>([
        'EVAL',
        script,
        1,
        redisKey,
        LOGIN_WINDOW_SECONDS,
      ])
      return state(Number(attempts), Math.max(1, Number(ttl)))
    } catch {
      if (!hasSupabaseFallback()) throw new Error('LOGIN_RATE_LIMIT_UNAVAILABLE')
    }
  }

  return databaseRecordFailure(key)
}

export async function clearLoginRateLimit(ip: string) {
  const key = await keyForIp(ip)
  let cleared = false

  if (getUpstashConfig()) {
    try {
      await redisCommand<number>(['DEL', `fico-mana:admin-login:${key}`])
      cleared = true
    } catch {
      // Supabase fallback is cleared below when available.
    }
  }

  if (hasSupabaseFallback()) {
    await databaseClear(key)
    cleared = true
  }

  if (!cleared) throw new Error('LOGIN_RATE_LIMIT_UNAVAILABLE')
}

export const loginRateLimitPolicy = {
  limit: LOGIN_LIMIT,
  windowSeconds: LOGIN_WINDOW_SECONDS,
} as const
