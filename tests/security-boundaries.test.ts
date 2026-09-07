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
import * as packageWorkflow from '../lib/package-workflow.ts'
import * as packageWorkflowServer from '../lib/package-workflow-server.ts'

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

test('real workflow authorization rejects anonymous, role escalation and non-MFA admins', async () => {
  const roles = loadTs<typeof import('../lib/auth/workflow.ts')>('lib/auth/workflow.ts', { '@/lib/supabase/admin': {} })
  for (const [role, capability, level, expected] of [
    ['none', 'view', 'aal1', 401], ['onsite', 'edit', 'aal1', 403],
    ['editor', 'admin', 'aal2', 403], ['admin', 'view', 'aal1', 428],
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

function workflowFixture(options: { expired?: boolean; mismatchedPortal?: boolean } = {}) {
  const db = database({
    client_portals: [{ id: 'portal-row', public_id: 'portal-a', booking_id: 'booking-a', workspace_id: 'studio', status: 'active', expires_at: options.expired ? '2000-01-01' : '2099-01-01', bookings: { workspace_id: options.mismatchedPortal ? 'other' : 'studio' }, workspaces: { slug: 'fico-mana', status: 'active' } }],
    gallery_files: [
      { id: 'own', booking_id: 'booking-a', workspace_id: 'studio', drive_file_id: 'drive-own' },
      { id: 'foreign-client', booking_id: 'booking-b', workspace_id: 'studio', drive_file_id: 'drive-foreign' },
      { id: 'foreign-workspace', booking_id: 'booking-a', workspace_id: 'other', drive_file_id: 'drive-other' },
    ],
    deliverable_files: [{ id: 'foreign-deliverable', booking_id: 'booking-b', workspace_id: 'studio' }],
    photo_selections: [{ id: 'selection-a', booking_id: 'booking-a', workspace_id: 'studio', status: 'OPEN', included_limit: 1 }],
    batch_upload_files: [{ id: 'upload-file', batch_upload_items: { upload_job_id: 'upload-job', editing_job_id: 'foreign-job', booking_id: 'booking-b' } }],
    editing_jobs: [{ id: 'foreign-job', workspace_id: 'other', booking_id: 'booking-b' }],
  })
  const driveReads: string[] = []
  const workflow = loadTs<typeof import('../lib/editor-workflow.ts')>('lib/editor-workflow.ts', {
    '@/lib/google-drive': {
      downloadDriveFile: async (id: string) => { driveReads.push(id); return Buffer.from('synthetic') },
      getDriveFile: async (id: string) => { driveReads.push(id); throw new Error('unexpected Drive lookup') },
    },
    '@/lib/google-drive-scopes': {}, '@/lib/client-portal': {}, '@/lib/email': {},
    '@/lib/print-manifest': {}, '@/lib/print-workflow': {},
    '@/lib/portal-expiry': { hasPortalExpired: (value: string) => Date.parse(value) < Date.now() },
    '@/lib/booking-provisioning': {}, '@/lib/security/file-validation': {},
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/security/audit-metadata': { safeMetadata },
    '@/lib/package-workflow': packageWorkflow,
    '@/lib/package-workflow-server': packageWorkflowServer,
  })
  return { workflow, driveReads, db }
}

test('real portal file reader rejects cross-client/workspace files and expired or mismatched portals', async () => {
  const { workflow, driveReads } = workflowFixture()
  for (const fileId of ['foreign-client', 'foreign-workspace']) await assert.rejects(workflow.getPortalFile('portal-a', fileId, 'gallery'), /Photo not found/)
  await assert.rejects(workflow.getPortalFile('portal-a', 'foreign-deliverable', 'deliverable'), /Photo not found/)
  assert.equal(driveReads.length, 0)
  const own = await workflow.getPortalFile('portal-a', 'own', 'gallery')
  assert.equal(own.data.toString(), 'synthetic')
  assert.deepEqual(driveReads, ['drive-own'])
  await assert.rejects(workflowFixture({ expired: true }).workflow.getPortalFile('portal-a', 'own', 'gallery'), /expired/)
  await assert.rejects(workflowFixture({ mismatchedPortal: true }).workflow.getPortalFile('portal-a', 'own', 'gallery'), /Portal not found/)
})

test('real selection and edited completion reject foreign resources before Drive access', async () => {
  const { workflow, driveReads } = workflowFixture()
  await assert.rejects(workflow.submitPhotoSelection('portal-a', {
    fileIds: ['foreign-client'], includedFileIds: ['foreign-client'], acknowledgeNoRevision: true,
    printAllocations: ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R', 'WALLET_SIZE'].map(category => ({ category, fileId: 'foreign-client', quantity: category === 'WALLET_SIZE' ? 4 : 1 })) as never,
  }), /do not belong/)
  await assert.rejects(workflow.completeDeliverableUpload('studio', 'upload-job', 'upload-file', 'untrusted-drive-file', 'image/jpeg'), /outside this workspace/)
  assert.equal(driveReads.length, 0)
})

test('Drive thumbnail allowlist rejects local, non-TLS, credentials, alternate ports and deceptive hosts', () => {
  for (const url of ['http://lh3.googleusercontent.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://169.254.169.254/a', 'https://lh3.googleusercontent.com.attacker.example/a', 'https://lh3.googleusercontent.com:444/a', 'https://user:pass@lh3.googleusercontent.com/a', 'file:///a']) assert.throws(() => urls.googleThumbnailUrl(url))
  assert.equal(urls.googleThumbnailUrl('https://lh3.googleusercontent.com/a').hostname, 'lh3.googleusercontent.com')
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
    SUPABASE_SECRET_KEY: 'synthetic-service-key', PORTAL_SIGNING_SECRET: 'p'.repeat(43), GOOGLE_TOKEN_ENCRYPTION_KEY: 'g'.repeat(43),
    SECURITY_HASH_SECRET: 'h'.repeat(43), GOOGLE_OAUTH_STATE_SECRET: 's'.repeat(43), GOOGLE_CLIENT_ID: 'synthetic-client',
    GOOGLE_CLIENT_SECRET: 'synthetic-client-secret', GOOGLE_DRIVE_ALLOWED_EMAIL: 'sample@example.test', RESEND_API_KEY: 'synthetic-email-key',
  }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  Object.assign(process.env, values)
  assert.doesNotThrow(validateProductionSecurityEnvironment)
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = values.PORTAL_SIGNING_SECRET
  assert.throws(validateProductionSecurityEnvironment, /independent/)
  delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  assert.throws(validateProductionSecurityEnvironment, /GOOGLE_TOKEN_ENCRYPTION_KEY is missing/)
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
