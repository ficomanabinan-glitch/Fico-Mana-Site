import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { loadTs } from './helpers/load-ts.ts'
import * as localStore from '../lib/security/local-file-store.ts'
import * as urls from '../lib/security/outbound-url.ts'
import { safeMetadata, safeAuditRoute } from '../lib/security/audit-metadata.ts'
import { isAllowedRequestOrigin } from '../lib/security/origin.ts'
import { validateProductionSecurityEnvironment } from '../lib/security/environment.ts'
import { validateReceiptImageContent, detectFileSignature } from '../lib/security/file-validation.ts'
import { escapeEmailText, safeEmailUrl, renderTemplate } from '../lib/email-templates.ts'

const json = { NextResponse: { json: Response.json } }
const noStore = { privateNoStoreHeaders: () => ({ 'Cache-Control': 'private, no-store' }), rejectUntrustedMutation: () => null }
const user = { id: 'synthetic-user', email: 'sample@example.test', app_metadata: { role: 'admin' } }

// Query doubles execute filters and record mutations; no provider is contacted.
function database(tables: Record<string, Array<Record<string, any>>>) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]>; mutation?: string }> = []
  return { queries, from(table: string) {
    const query = { table, filters: [] as Array<[string, unknown]>, mutation: undefined as string | undefined }
    queries.push(query)
    const predicates: Array<(row: Record<string, any>) => boolean> = []
    const field = (row: Record<string, any>, key: string) => key.split('.').reduce((value, part) => value?.[part], row as any)
    const result = () => ({ data: (tables[table] || []).filter(row => predicates.every(predicate => predicate(row))), error: null })
    const builder = {
      select() { return builder }, order() { return builder }, range() { return builder }, limit() { return builder },
      eq(key: string, value: unknown) { query.filters.push([key, value]); predicates.push(row => field(row, key) === value); return builder },
      is(key: string, value: unknown) { query.filters.push([key, value]); predicates.push(row => (field(row, key) ?? null) === value); return builder },
      in(key: string, values: unknown[]) { predicates.push(row => values.includes(field(row, key))); return builder },
      update() { query.mutation = 'update'; return builder },
      insert() { query.mutation = 'insert'; return builder },
      single: async () => ({ ...result(), data: result().data[0] ?? null }),
      maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve) },
    }
    return builder
  } }
}

test('production cannot use local records even with the explicit flag', () => {
  assert.equal(localStore.localFileStoreAllowed({ NODE_ENV: 'production', ALLOW_LOCAL_FILE_STORE: 'true' }), false)
  assert.equal(localStore.localFileStoreAllowed({ NODE_ENV: 'development' }), false)
  assert.equal(localStore.localFileStoreAllowed({ NODE_ENV: 'test', ALLOW_LOCAL_FILE_STORE: 'true' }), true)
})

test('real booking loader respects authoritative deletion and never reads disk after online failure', async () => {
  let diskReads = 0
  let onlineError = false
  const loader = loadTs<typeof import('../lib/booking-load.ts')>('lib/booking-load.ts', {
    '@/lib/booking-id': { resolveBookingReference: (id: string) => id },
    '@/lib/server-store': { getBookingById: () => { diskReads++; return { id: 'stale-snapshot' } } },
    '@/lib/supabase/env': { isSupabaseConfigured: () => true },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({}) },
    '@/lib/supabase-store': { getBookingFromDb: () => { if (onlineError) throw new Error('offline'); return null } },
    '@/lib/security/local-file-store': localStore,
  })
  assert.equal(await loader.loadBookingById('FM-123456'), null)
  onlineError = true
  await assert.rejects(loader.loadBookingById('FM-123456'), /offline/)
  assert.equal(diskReads, 0)
})

test('revoked/disabled/foreign workspace membership cannot be recreated from an admin claim', async () => {
  for (const rows of [[], [{ workspace_id: 'studio', role: 'admin', user_id: user.id, workspaces: { slug: 'fico-mana', status: 'disabled' } }], [{ workspace_id: 'other', role: 'owner', user_id: user.id, workspaces: { slug: 'other', status: 'active' } }]]) {
    const db = database({ workspace_members: rows })
    const auth = loadTs<typeof import('../lib/auth/workflow.ts')>('lib/auth/workflow.ts', { '@/lib/supabase/admin': { getSupabaseAdmin: () => db } })
    assert.equal(await auth.getWorkflowAccess(user as never), null)
    assert.equal(db.queries.some(query => query.mutation), false)
  }
})

test('real workflow authorization rejects anonymous users and role escalation without requiring MFA', async () => {
  const roles = loadTs<typeof import('../lib/auth/workflow.ts')>('lib/auth/workflow.ts', { '@/lib/supabase/admin': {} })
  for (const [role, capability, level, expected] of [
    ['none', 'view', 'aal1', 401], ['onsite', 'edit', 'aal1', 403],
    ['editor', 'admin', 'aal2', 403], ['admin', 'view', 'aal1', 200],
    ['owner', 'admin', 'aal2', 200], ['editor', 'edit', 'aal1', 200],
  ] as const) {
    const auth = loadTs<typeof import('../lib/auth-api.ts')>('lib/auth-api.ts', {
      'next/server': json,
      '@/lib/supabase/server': { getStaffAuthContext: async () => ({ user: role === 'none' ? null : user, assurance: { currentLevel: level } }) },
      '@/lib/auth/workflow': { ...roles, getWorkflowAccess: async () => ({ role }) },
      '@/lib/security/request-security': noStore,
      '@/lib/security/api-rate-limit': {},
    })
    const response = await auth.requireWorkflowAuth(capability)
    assert.equal(response.error?.status ?? 200, expected)
  }
})

test('bounded external reads reject oversized declared and streamed bodies', async () => {
  await assert.rejects(urls.readBoundedResponse(new Response('abcdef', { headers: { 'content-length': '6' } }), 5), /size/)
  await assert.rejects(urls.readBoundedResponse(new Response('abcdef'), 5), /size/)
  assert.equal((await urls.readBoundedResponse(new Response('abc'), 5)).toString(), 'abc')
})

test('truncated receipt pixels are rejected even when metadata can be read; RAF signature remains supported', async () => {
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toBuffer()
  const truncated = png.subarray(0, png.indexOf('IDAT') + 8)
  await assert.rejects(validateReceiptImageContent(truncated, 'image/png', 'receipt.png'), /valid decodable/)
  assert.equal(detectFileSignature(Buffer.from('FUJIFILMCCD-RAW\u0020\u0000')), 'raf')
})

test('production rejects missing origins despite a forged same-site fetch hint', t => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const previous = mutableEnv.NODE_ENV
  t.after(() => { if (previous === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = previous })
  mutableEnv.NODE_ENV = 'production'
  assert.equal(isAllowedRequestOrigin(new Request('https://admin.ficomana.com/api/test', { method: 'POST', headers: { 'sec-fetch-site': 'same-site' } })), false)
})

test('audit metadata and routes redact bearer links, credentials and recipient addresses', () => {
  const text = JSON.stringify(safeMetadata({ detail: 'https://example.test/portal/a?sig=private sample@example.test', token: 'private', nested: { error: 'password=private' } }))
  assert.ok(!text.includes('private') && !text.includes('sample@example.test'))
  assert.equal(safeAuditRoute('/api/shoot-response/synthetic-token?sig=private'), '/api/shoot-response/[token]')
})

test('email escaping preserves visible text and rejects executable links', () => {
  assert.equal(escapeEmailText('A & B <Sample>'), 'A &amp; B &lt;Sample&gt;')
  assert.equal(safeEmailUrl('javascript:alert(1)'), '#')
  const result = renderTemplate({ id: 'payment_received', name: 'Test', subject: 'Hello {{name}}', body: '<p>{{name}}</p>' }, { name: '<b>Sample</b>' })
  assert.equal(result.subject, 'Hello <b>Sample</b>')
  assert.ok(result.body.includes('&lt;b&gt;Sample&lt;/b&gt;'))
})

test('production security keys must be present and independent without exposing values', t => {
  const values = {
    NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public',
    SUPABASE_SECRET_KEY: 'synthetic-service-key', PORTAL_SIGNING_SECRET: 'p'.repeat(43),
    SECURITY_HASH_SECRET: 'h'.repeat(43), CLOUDFLARE_ACCOUNT_ID: 'synthetic-account',
    R2_ACCESS_KEY_ID: 'synthetic-access-key', R2_SECRET_ACCESS_KEY: 'r'.repeat(43),
    R2_BUCKET_NAME: 'synthetic-private-bucket', R2_ENDPOINT: 'https://synthetic-account.r2.cloudflarestorage.com',
    RESEND_API_KEY: 'synthetic-email-key',
  }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  Object.assign(process.env, values)
  assert.doesNotThrow(validateProductionSecurityEnvironment)
  process.env.R2_SECRET_ACCESS_KEY = values.PORTAL_SIGNING_SECRET
  assert.throws(validateProductionSecurityEnvironment, /independent/)
  delete process.env.R2_SECRET_ACCESS_KEY
  assert.throws(validateProductionSecurityEnvironment, /R2_SECRET_ACCESS_KEY is missing/)
})

test('distributed rate limiting returns 429 and retains the extra aggregate bucket', async () => {
  const calls: string[] = []
  const limiter = loadTs<typeof import('../lib/security/api-rate-limit.ts')>('lib/security/api-rate-limit.ts', {
    'next/server': json, '@/lib/security/request-security': noStore,
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ rpc: async (_name: string, args: Record<string, any>) => {
      calls.push(args.p_policy)
      return { data: [{ allowed: !args.p_policy.endsWith('-aggregate'), remaining: 0, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null }
    } }) },
  })
  const previous = process.env.SECURITY_HASH_SECRET
  process.env.SECURITY_HASH_SECRET = 'synthetic-rate-key'
  try {
    const response = await limiter.enforceApiRateLimit(new Request('https://example.test/api/lookup'), limiter.API_RATE_LIMITS.bookingLookup, ['changing-id'])
    assert.equal(response?.status, 429)
    assert.deepEqual(calls, ['booking-lookup-aggregate'])
  } finally { if (previous === undefined) delete process.env.SECURITY_HASH_SECRET; else process.env.SECURITY_HASH_SECRET = previous }
})
