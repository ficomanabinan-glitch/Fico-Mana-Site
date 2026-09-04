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

function getConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const secret =
    process.env.LOGIN_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !token || !secret) return null
  return { url, token, secret }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function keyForIp(ip: string, secret: string) {
  const hash = await sha256(`${secret}:${ip}`)
  return `fico-mana:admin-login:${hash}`
}

async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  const config = getConfig()
  if (!config) throw new Error('LOGIN_RATE_LIMIT_NOT_CONFIGURED')

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  })

  if (!response.ok) throw new Error('LOGIN_RATE_LIMIT_UNAVAILABLE')

  const payload = (await response.json()) as RedisResponse<T>
  if (payload.error || payload.result === undefined) {
    throw new Error('LOGIN_RATE_LIMIT_UNAVAILABLE')
  }
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

export function isLoginRateLimitConfigured() {
  return !!getConfig()
}

/** Check before authenticating. The sixth attempt is blocked after five failures. */
export async function checkLoginRateLimit(ip: string): Promise<LoginRateLimitState> {
  const config = getConfig()
  if (!config) return state(0, 0, false)

  const key = await keyForIp(ip, config.secret)
  const attempts = Number((await redisCommand<string | number | null>(['GET', key])) ?? 0)
  if (attempts < LOGIN_LIMIT) return state(attempts, 0)

  const ttl = Number(await redisCommand<number>(['TTL', key]))
  return state(attempts, Math.max(1, ttl))
}

/** Atomically increments the failed-attempt counter and starts the 15-minute window. */
export async function recordFailedLogin(ip: string): Promise<LoginRateLimitState> {
  const config = getConfig()
  if (!config) return state(0, 0, false)

  const key = await keyForIp(ip, config.secret)
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
    key,
    LOGIN_WINDOW_SECONDS,
  ])

  return state(Number(attempts), Math.max(1, Number(ttl)))
}

export async function clearLoginRateLimit(ip: string) {
  const config = getConfig()
  if (!config) return
  const key = await keyForIp(ip, config.secret)
  await redisCommand<number>(['DEL', key])
}

export const loginRateLimitPolicy = {
  limit: LOGIN_LIMIT,
  windowSeconds: LOGIN_WINDOW_SECONDS,
} as const
