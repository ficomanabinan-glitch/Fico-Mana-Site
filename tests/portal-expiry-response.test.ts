import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { type TestContext } from 'node:test'
import { hasPortalExpired } from '../lib/portal-expiry.ts'
import { loadTs } from './helpers/load-ts.ts'

const publicId = '00000000-0000-4000-8000-000000000002'
const now = Date.parse('2026-10-01T04:00:00Z')
const expiryMessage = 'This client portal has expired. Try: contact FICO MANA to request access again.'
const { PortalSelectionError } = loadTs<typeof import('../lib/portal-selection-source.ts')>('lib/portal-selection-source.ts', {
  '@/lib/storage/storage-keys': {}, '@/lib/storage/storage-service': {},
})

function setup(t: TestContext, options: { expiresAt?: string | null; status?: string; mismatch?: boolean; databaseError?: boolean; limited?: boolean; source?: string } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now })
  const environment: Record<string, string | undefined> = process.env
  const previousEnvironment = environment.NODE_ENV
  environment.NODE_ENV = 'production'
  t.after(() => { if (previousEnvironment === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = previousEnvironment })
  t.mock.method(console, 'error', () => {})
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  const portal = { workspace_id: 'studio', booking_id: 'booking', bookings: { workspace_id: options.mismatch ? 'other' : 'studio' },
    status: options.status ?? 'active', expires_at: options.expiresAt === undefined ? '2026-10-02T04:00:00Z' : options.expiresAt,
    access_email_sent_at: '2026-09-01T04:00:00Z', deliverables_uploaded_at: null }
  const admin = { from(table: string) {
    assert.ok(['client_portals', 'gallery_files', 'photo_selections'].includes(table), `Unexpected private read: ${table}`)
    const entry = { table, filters: [] as Array<[string, unknown]> }
    reads.push(entry)
    const result = () => table === 'client_portals'
      ? { data: options.databaseError ? null : portal, error: options.databaseError ? { message: 'Database internal sentinel' } : null }
      : table === 'photo_selections' ? { data: { raw_upload_generation: 3, raw_reset_id: null, reopened_at: null }, error: null }
        : { data: [{ id: 'photo', created_at: '2026-09-30T04:00:00Z' }], error: null, count: 1 }
    const query = {
      select() { return query }, eq(key: string, value: unknown) { entry.filters.push([key, value]); return query },
      limit() { return query }, order() { return query }, maybeSingle: async () => result(),
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve) },
    }
    return query
  } }
  const workflowStubs: Record<string, unknown> = {
    sharp: {}, '@/lib/client-portal': {}, '@/lib/portal-expiry': { hasPortalExpired }, '@/lib/email': {},
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin }, '@/lib/portal-selection-source': { PortalSelectionError },
  }
  for (const name of ['security/file-validation', 'security/audit-metadata', 'package-workflow-server', 'package-workflow',
    'print-manifest', 'print-workflow', 'raw-upload-generation', 'storage/booking-storage', 'storage/storage-service',
    'storage/storage-keys', 'storage/presigned-urls', 'portal-raw-downloads', 'storage/multipart-upload']) workflowStubs[`@/lib/${name}`] = {}
  const workflow = loadTs<typeof import('../lib/editor-workflow.ts')>('lib/editor-workflow.ts', workflowStubs, options.source)
  const rateLimit = { API_RATE_LIMITS: { portalRead: 'read-policy' }, enforceApiRateLimit: async () => options.limited ? new Response(null, { status: 429 }) : null }
  const stubs: Record<string, unknown> = {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/editor-workflow': workflow,
    '@/lib/security/api-rate-limit': rateLimit, '@/lib/security/request-security': { rejectUntrustedMutation: () => null },
    '@/lib/package-workflow': { GraduationWorkflowOnlyError: class extends Error {} },
    '@/lib/raw-upload-contract': { RawUploadError: class extends Error {} }, '@/lib/selection-review': { SelectionReviewError: class extends Error {} },
  }
  for (const name of ['auth-api', 'auth/workflow', 'portal-raw-downloads', 'storage/storage-service', 'security/file-validation',
    'security/schemas', 'security/security-audit', 'security/upload-scanner', 'raw-upload-server', 'onsite-photo-reset', 'private-download-manifest']) stubs[`@/lib/${name}`] = {}
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', stubs)
  const get = async (id = publicId, revision = false) => {
    const path = ['portal', id, ...(revision ? ['photo-revision'] : [])]
    const url = new URL(`https://ficomana.com/api/editor-workflow/${path.join('/')}`)
    return route.GET(Object.assign(new Request(url), { nextUrl: url }) as never, { params: Promise.resolve({ path }) })
  }
  const page = loadTs<{ default: (props: { params: Promise<{ id: string }> }) => Promise<any> }>('app/portal/[id]/page.tsx', {
    'next/headers': { headers: async () => new Headers() }, '@/lib/editor-workflow': workflow,
    '@/lib/security/api-rate-limit': rateLimit, '@/components/client-portal-page': () => null, '@/components/portal-page-skeleton': () => null,
  })
  const render = async () => {
    const shell = await page.default({ params: Promise.resolve({ id: publicId }) })
    return shell.props.children.type(shell.props.children.props)
  }
  return { reads, get, render }
}

for (const [label, options] of [
  ['past deadline', { expiresAt: '2026-10-01T03:59:59Z' }],
  ['exact deadline', { expiresAt: '2026-10-01T04:00:00Z' }],
  ['explicit expired status with a future deadline', { status: 'expired' }],
] as const) test(`expired portal at ${label} returns safe 410 without downstream private reads`, async (t) => {
  const { get, reads } = setup(t, options)
  const response = await get()
  assert.equal(response.status, 410)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.equal(body.code, 'PORTAL_EXPIRED')
  assert.equal(body.error, expiryMessage)
  assert.equal(typeof body.requestId, 'string')
  assert.equal(body.booking, undefined)
  assert.deepEqual(reads, [{ table: 'client_portals', filters: [['public_id', publicId], ['workspaces.slug', 'fico-mana'], ['workspaces.status', 'active']] }])
})

for (const expiresAt of ['2026-10-02T04:00:00Z', null]) test(`active portal revision remains available with deadline ${expiresAt}`, async (t) => {
  const { get, reads } = setup(t, { expiresAt })
  const response = await get(publicId, true)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { generation: 3, resetting: false, reopenedAt: null, galleryCount: 1,
    lastUploadAt: '2026-09-30T04:00:00Z', expiresAt, portalReadyEmailSentAt: '2026-09-01T04:00:00Z', deliverablesUploadedAt: null })
  for (const read of reads.slice(1)) assert.deepEqual(read.filters.slice(0, 2), [['workspace_id', 'studio'], ['booking_id', 'booking']])
})

for (const options of [{ mismatch: true }, { databaseError: true }]) test(`untrusted portal failure stays generic: ${JSON.stringify(options)}`, async (t) => {
  const { get, render, reads } = setup(t, { ...options, expiresAt: '2026-09-30T04:00:00Z' })
  const response = await get()
  assert.equal(response.status, 500)
  const body = await response.json()
  assert.equal(body.error, 'Editor workflow request failed.')
  assert.equal(body.code, undefined)
  const result = await render()
  assert.equal(result.props.initialData, null)
  assert.equal(result.props.initialError, 'This client portal is unavailable. Try: refresh this page or ask FICO MANA staff to check your private portal link.')
  assert.ok(reads.every((read) => read.table === 'client_portals'))
})

test('malformed and rate-limited reads never query portal metadata', async (t) => {
  const { get, reads } = setup(t, { limited: true })
  assert.equal((await get('invalid')).status, 404)
  assert.equal((await get()).status, 429)
  assert.deepEqual(reads, [])
})

test('initial server rendering explains actual expiry without private data', async (t) => {
  const { render, reads } = setup(t, { expiresAt: '2026-10-01T04:00:00Z' })
  const result = await render()
  assert.equal(result.props.initialData, null)
  assert.equal(result.props.initialError, expiryMessage)
  assert.deepEqual(reads.map((read) => read.table), ['client_portals'])
})

test('expiry response is deterministic across ten fixed-input reads', async (t) => {
  const { get, reads } = setup(t, { expiresAt: '2026-10-01T04:00:00Z' })
  for (let iteration = 0; iteration < 10; iteration++) {
    const response = await get()
    assert.equal(response.status, 410)
    assert.equal((await response.json()).error, expiryMessage)
  }
  assert.equal(reads.length, 10)
})

test('in-memory revert proves the expiry response regression detects the original defect', async (t) => {
  const currentSource = readFileSync('lib/editor-workflow.ts', 'utf8')
  const source = currentSource.replace(
    /new PortalSelectionError\('This client portal has expired\. Try: contact FICO MANA to request access again\.', 'PORTAL_EXPIRED', 410\)/g,
    "new Error('Portal expired.')",
  )
  assert.notEqual(source, currentSource, 'The revert must replace the actual typed expiry guard, not silently test an unchanged source')
  const { get } = setup(t, { expiresAt: '2026-10-01T04:00:00Z', source })
  const response = await get()
  assert.equal(response.status, 500)
  assert.equal((await response.json()).error, 'Editor workflow request failed.')
})
