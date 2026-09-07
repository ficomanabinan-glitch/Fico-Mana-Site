import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import { portalSelectionSchema } from '../lib/security/schemas.ts'
import { safeMetadata, redactDiagnostic } from '../lib/security/audit-metadata.ts'

const portal = '00000000-0000-4000-8000-000000000042'

test('PIN schema rejects missing, numeric, malformed and injected contact values', () => {
  const input = { fileIds: [portal], pin: '0042', acknowledgeNoRevision: true }
  assert.equal(portalSelectionSchema.safeParse(input).success, true)
  for (const pin of [undefined, 42, '42', '00042', 'abcd', ' 0042', '１２３４']) {
    assert.equal(portalSelectionSchema.safeParse({ ...input, pin }).success, false)
  }
  assert.equal(portalSelectionSchema.safeParse({ ...input, customer_phone: '09000000042' }).success, false)
})

test('PIN quota is IP-only: shared across devices/portals on one IP, independent across IPs, and fails closed', async t => {
  const keys = ['NODE_ENV', 'SECURITY_HASH_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] as const
  const env = process.env as Record<string, string | undefined>
  const previous = Object.fromEntries(keys.map(key => [key, env[key]]))
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete env[key]; else env[key] = previous[key] } })
  env.NODE_ENV = 'production'
  env.SECURITY_HASH_SECRET = 'synthetic-ip-pin-rate-test'
  delete env.UPSTASH_REDIS_REST_URL
  delete env.UPSTASH_REDIS_REST_TOKEN
  const counts = new Map<string, number>()
  let offline = false
  const limiter = loadTs<typeof import('../lib/security/api-rate-limit.ts')>('lib/security/api-rate-limit.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/security/request-security': { privateNoStoreHeaders: () => ({ 'cache-control': 'private, no-store' }) },
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ rpc: async (_name: string, args: { p_policy: string; p_key_hash: string; p_limit: number; p_window_seconds: number }) => {
      assert.equal(args.p_policy, 'portal-submission-pin')
      assert.equal(args.p_limit, 5)
      assert.equal(args.p_window_seconds, 900)
      if (offline) throw new Error('Synthetic offline database')
      const count = (counts.get(args.p_key_hash) || 0) + 1
      counts.set(args.p_key_hash, count)
      return { data: [{ allowed: count <= args.p_limit, remaining: Math.max(0, args.p_limit - count), reset_at: new Date(Date.now() + 900_000).toISOString() }], error: null }
    } }) },
  })
  const request = (ip: number, device = 1, portalId = portal) => new Request('https://www.ficomana.com/api/editor-workflow/portal/' + portalId + '/selection', {
    headers: { 'x-forwarded-for': '192.0.2.' + ip, 'user-agent': 'Synthetic device ' + device },
  })
  for (let device = 1; device <= 5; device++) assert.equal(await limiter.enforceApiRateLimit(request(1, device), limiter.API_RATE_LIMITS.portalSubmissionPin), null)
  const blocked = await limiter.enforceApiRateLimit(request(1, 6, 'other-portal'), limiter.API_RATE_LIMITS.portalSubmissionPin)
  assert.equal(blocked?.status, 429)
  assert.equal(counts.size, 1, 'Devices and portal URLs on one IP consume one quota')
  assert.ok(Number(blocked?.headers.get('retry-after')) > 0)
  assert.match(blocked?.headers.get('cache-control') || '', /no-store/)
  assert.equal(await limiter.enforceApiRateLimit(request(2), limiter.API_RATE_LIMITS.portalSubmissionPin), null)
  assert.equal(counts.size, 2, 'A different IP can submit even for the same portal')
  offline = true
  assert.equal((await limiter.enforceApiRateLimit(request(7), limiter.API_RATE_LIMITS.portalSubmissionPin))?.status, 503)
})

test('PIN fields are redacted defensively and never saved with client drafts', () => {
  const result = safeMetadata({ pin: '0042', submissionPin: '0042', pin_code: '0042', nested: { pin: '0042' } })
  assert.ok(!JSON.stringify(result).includes('0042'))
  assert.ok(!redactDiagnostic('pin=0042 submissionPin=0042').includes('0042'))
  const draft = readFileSync('lib/portal-selection-draft.ts', 'utf8')
  assert.doesNotMatch(draft, /submissionPin|\bpin\s*:/)
  const component = readFileSync('components/client-photo-selection.tsx', 'utf8')
  assert.match(component, /pin: submissionPin/)
  assert.match(component, /finally\s*\{\s*setSubmissionPin\(''\)/)
})
