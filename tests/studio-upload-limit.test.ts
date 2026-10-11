import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const hour = 60 * 60 * 1_000
const now = new Date('2026-10-11T08:00:00Z').getTime()
const staff = ['synthetic-staff', 'synthetic-workspace', 'raw-upload']

function environment(t: TestContext) {
  const keys = ['NODE_ENV', 'SECURITY_HASH_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const
  const env = process.env as Record<string, string | undefined>
  const previous = Object.fromEntries(keys.map(key => [key, env[key]]))
  t.after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete env[key]
      else env[key] = previous[key]
    }
  })
  Object.assign(env, { NODE_ENV: 'production', SECURITY_HASH_SECRET: 'synthetic-studio-upload-key' })
  delete env.UPSTASH_REDIS_REST_URL
  delete env.UPSTASH_REDIS_REST_TOKEN
  t.mock.timers.enable({ apis: ['Date'], now })
}

function request(action: string, booking = 'SYNTHETIC-A', ip = '192.0.2.1') {
  return new Request(`https://example.test/api/editor-workflow/raw/${booking}/${action}`, {
    method: 'POST', headers: { 'x-forwarded-for': ip },
  })
}

function limiter(database: unknown) {
  return loadTs<typeof import('../lib/security/api-rate-limit.ts')>('lib/security/api-rate-limit.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/security/request-security': { privateNoStoreHeaders: () => ({ 'Cache-Control': 'private, no-store' }) },
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => database },
  })
}

test('authenticated RAW uploads allow preparation and confirmation for 10,000 photos per hour', async t => {
  environment(t)
  const windows = new Map<string, { started: number; count: number }>()
  const api = limiter({ rpc: async (name: string, args: { p_key_hash: string; p_policy: string; p_limit: number; p_window_seconds: number }) => {
    assert.equal(name, 'consume_api_rate_limit')
    const key = `${args.p_policy}:${args.p_key_hash}`
    let window = windows.get(key)
    if (!window || Date.now() >= window.started + args.p_window_seconds * 1_000) {
      window = { started: Date.now(), count: 0 }
      windows.set(key, window)
    }
    window.count++
    return { data: [{
      allowed: window.count <= args.p_limit,
      remaining: Math.max(0, args.p_limit - window.count),
      reset_at: new Date(window.started + args.p_window_seconds * 1_000).toISOString(),
    }], error: null }
  } })
  const policy = api.API_RATE_LIMITS.editorUpload
  const prepare = request('upload-session')
  const confirm = request('complete-file', 'SYNTHETIC-B')

  for (let photo = 1; photo <= 10_000; photo++) {
    assert.equal(await api.enforceApiRateLimit(prepare, policy, staff), null, `Photo ${photo} must receive upload permission`)
    assert.equal(await api.enforceApiRateLimit(confirm, policy, staff), null, `Photo ${photo} must be confirmable`)
  }

  const blocked = await api.enforceApiRateLimit(prepare, policy, staff)
  assert.ok(blocked)
  assert.equal(blocked?.status, 429)
  assert.equal(blocked.headers.get('X-RateLimit-Limit'), '20000')
  assert.equal(blocked.headers.get('Retry-After'), '3600')
  assert.deepEqual(await blocked.json(), {
    error: 'Too many requests. Please wait and try again.', code: 'RATE_LIMITED',
    retryAt: new Date(now + hour).toISOString(),
  })

  // Other staff, workspaces, and addresses keep their existing isolated allowances.
  assert.equal(await api.enforceApiRateLimit(prepare, policy, ['other-staff', ...staff.slice(1)]), null)
  assert.equal(await api.enforceApiRateLimit(prepare, policy, [staff[0], 'other-workspace', staff[2]]), null)
  assert.equal(await api.enforceApiRateLimit(request('upload-session', 'SYNTHETIC-A', '192.0.2.2'), policy, staff), null)

  t.mock.timers.tick(hour - 1)
  assert.equal((await api.enforceApiRateLimit(prepare, policy, staff))?.status, 429)
  t.mock.timers.tick(1)
  assert.equal(await api.enforceApiRateLimit(prepare, policy, staff), null, 'The allowance resets after one hour')
})

test('Redis upload throttling uses the same 10,000-photo request budget', async t => {
  environment(t)
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'synthetic-redis-token'
  let count = 19_998
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init: RequestInit) => {
    const command = JSON.parse(String(init.body)) as Array<string | number>
    assert.equal(command[0], 'EVAL')
    assert.equal(command[4], 3600)
    return Response.json({ result: [++count, 3600] })
  })
  const api = limiter({ rpc: async () => { throw new Error('Redis should not fall back to the database in this test') } })
  assert.equal(await api.enforceApiRateLimit(request('upload-session'), api.API_RATE_LIMITS.editorUpload, staff), null)
  assert.equal(await api.enforceApiRateLimit(request('complete-file'), api.API_RATE_LIMITS.editorUpload, staff), null)
  assert.equal((await api.enforceApiRateLimit(request('upload-session'), api.API_RATE_LIMITS.editorUpload, staff))?.status, 429)
})

test('raising the authenticated upload budget leaves public and client limits unchanged', () => {
  const api = limiter(null)
  assert.deepEqual(api.API_RATE_LIMITS.editorUpload, {
    name: 'editor-upload', limit: 20_000, windowSeconds: 3600, failClosed: true,
  })
  assert.equal(api.API_RATE_LIMITS.portalPhotoRead.limit, 500)
  assert.equal(api.API_RATE_LIMITS.portalSingleDownload.limit, 60)
  assert.equal(api.API_RATE_LIMITS.portalRawDownload.limit, 10)
  assert.equal(api.API_RATE_LIMITS.rawSubmit.limit, 8)
  assert.equal(api.API_RATE_LIMITS.receiptUpload.limit, 10)
  assert.equal(api.API_RATE_LIMITS.storageOperation.limit, 120)
})

test('production studio uploads still fail closed when quota enforcement is unavailable', async t => {
  environment(t)
  const api = limiter({ rpc: async () => ({ data: null, error: { code: 'SYNTHETIC_OUTAGE' } }) })
  const response = await api.enforceApiRateLimit(request('upload-session'), api.API_RATE_LIMITS.editorUpload, staff)
  assert.ok(response)
  assert.equal(response?.status, 503)
  assert.equal((await response.json()).code, 'RATE_LIMIT_UNAVAILABLE')
})
