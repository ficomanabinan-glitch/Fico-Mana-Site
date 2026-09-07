import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'
import * as packageWorkflow from '../lib/package-workflow.ts'
class RawUploadError extends Error {}

function fixture() {
  let failedTable = ''
  const db = memoryDb({
    client_portals: [{ id: 'p', public_id: 'private', booking_id: 'booking', workspace_id: 'studio', status: 'active', expires_at: '2099-01-01',
      bookings: { workspace_id: 'studio' }, workspaces: { slug: 'fico-mana', status: 'active' } }],
    gallery_files: [
      { id: 'own', workspace_id: 'studio', booking_id: 'booking', drive_file_id: 'drive-own', thumbnail_reference: 'studio/booking/version1.jpg', checksum: 'version-1' },
      { id: 'foreign', workspace_id: 'studio', booking_id: 'other-booking', drive_file_id: 'drive-foreign' },
      { id: 'foreign-workspace', workspace_id: 'other', booking_id: 'booking', drive_file_id: 'drive-other' },
    ],
    deliverable_files: [{ id: 'edited', workspace_id: 'studio', booking_id: 'booking', drive_file_id: 'drive-edited', mime_type: 'image/jpeg', file_name: 'edited.JPG', checksum: 'v1' }],
  }, table => table === failedTable)
  let reads = 0
  const admin = { ...db, storage: { from: () => ({ download: async () => { reads++; return { data: new Blob(['private-preview']), error: null } } }) } }
  const workflow = loadTs<typeof import('../lib/editor-workflow.ts')>('lib/editor-workflow.ts', {
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin },
    '@/lib/google-drive': { downloadDriveFile: async () => { reads++; return Buffer.from('private-deliverable') } },
    '@/lib/google-drive-scopes': {}, '@/lib/client-portal': {}, '@/lib/email': {},
    '@/lib/portal-expiry': { hasPortalExpired: (value: string) => Date.parse(value) <= Date.now() },
    '@/lib/booking-provisioning': {}, '@/lib/security/file-validation': {}, '@/lib/security/audit-metadata': {},
    '@/lib/package-workflow': packageWorkflow, '@/lib/package-workflow-server': {},
    '@/lib/print-manifest': {}, '@/lib/print-workflow': {}, '@/lib/drive-folder-mappings': {},
  })
  let authorized = true
  let limited = false
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, archiver: {},
    '@/lib/package-workflow': packageWorkflow, '@/lib/auth-api': {}, '@/lib/auth/workflow': {},
    '@/lib/editor-workflow': workflow, '@/lib/google-drive': {},
    '@/lib/client-portal': { PORTAL_SESSION_COOKIE: 'private-cookie', verifyPortalSignature: () => false, verifyPortalCookie: () => authorized },
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async () => limited ? new Response(null, { status: 429, headers: { 'cache-control': 'no-store' } }) : null },
    '@/lib/security/file-validation': {}, '@/lib/security/schemas': {},
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} },
    '@/lib/security/upload-scanner': {}, '@/lib/security/request-security': {},
    '@/lib/raw-upload-server': {}, '@/lib/raw-upload-contract': { RawUploadError },
  })
  const request = async (file = 'own', etag = '', kind = 'gallery') => {
    const req = Object.assign(new Request(`https://www.ficomana.com/api/editor-workflow/portal/private/file/${file}?kind=${kind}`, { headers: { 'if-none-match': etag } }), {
      nextUrl: new URL(`https://www.ficomana.com/api/editor-workflow/portal/private/file/${file}?kind=${kind}`),
      cookies: { get: () => ({ value: 'synthetic-cookie' }) },
    })
    return route.GET(req as never, { params: Promise.resolve({ path: ['portal', 'private', 'file', file] }) })
  }
  return { workflow, request, db, get reads() { return reads }, authorize: (value: boolean) => { authorized = value }, limit: () => { limited = true }, fail: (table: string) => { failedTable = table } }
}

test('authorized images use private browser validators; repeat gallery/print/zoom requests transfer no image bytes or provider reads', async () => {
  const f = fixture()
  const first = await f.request()
  assert.equal(first.status, 200)
  assert.equal(await first.text(), 'private-preview')
  assert.equal(first.headers.get('cache-control'), 'private, no-cache, must-revalidate')
  assert.equal(first.headers.get('vary'), 'Cookie')
  assert.equal(first.headers.get('cdn-cache-control'), 'no-store')
  assert.equal(first.headers.get('vercel-cdn-cache-control'), 'no-store')
  const etag = first.headers.get('etag')!
  assert.ok(!etag.includes('drive-own'))
  for (const validator of [etag, `"unrelated", ${etag}`, etag.replace(/^W\//, '')]) {
    const cached = await f.request('own', validator)
    assert.equal(cached.status, 304)
    assert.equal((await cached.arrayBuffer()).byteLength, 0)
    assert.equal(cached.headers.get('etag'), etag)
  }
  assert.equal(f.reads, 1)
  assert.ok(f.db.operations.filter(op => op.table === 'client_portals').length >= 4, 'Live portal access is checked on every conditional request')
  f.db.tables.gallery_files[0].checksum = 'version-2'
  const changed = await f.request('own', etag)
  assert.equal(changed.status, 200)
  assert.notEqual(changed.headers.get('etag'), etag)
  assert.equal(f.reads, 2)
})

test('edited delivery images reuse bytes too, with distinct versions and correct content headers', async () => {
  const f = fixture()
  const first = await f.request('edited', '', 'deliverable')
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('content-type'), 'image/jpeg')
  assert.match(first.headers.get('content-disposition') || '', /edited.JPG/)
  const next = await f.request('edited', first.headers.get('etag')!, 'deliverable')
  assert.equal(next.status, 304)
  assert.equal(f.reads, 1)
})

test('cached validators cannot bypass signature, expiry, disabled state, workspace/file ownership, database failure or rate limits', async t => {
  t.mock.method(console, 'error', () => {})
  const f = fixture()
  const etag = (await f.request()).headers.get('etag')!
  f.authorize(false)
  const denied = await f.request('own', etag)
  assert.equal(denied.status, 403)
  assert.match(denied.headers.get('cache-control') || '', /no-store/)
  f.authorize(true)
  for (const table of ['client_portals', 'gallery_files']) {
    f.fail(table)
    await assert.rejects(f.workflow.getPortalFile('private', 'own', 'gallery', etag), /Synthetic database failure/)
  }
  f.fail('')
  for (const file of ['foreign', 'foreign-workspace', 'missing']) {
    await assert.rejects(f.workflow.getPortalFile('private', file, 'gallery', '*'), /Photo not found/)
  }
  for (const change of [{ status: 'disabled' }, { status: 'expired' }, { status: 'active', expires_at: '2000-01-01' }]) {
    Object.assign(f.db.tables.client_portals[0], change)
    const response = await f.request('own', etag)
    assert.notEqual(response.status, 304)
    assert.match(response.headers.get('cache-control') || '', /no-store/)
  }
  f.db.tables.client_portals = []
  await assert.rejects(f.workflow.getPortalFile('private', 'own', 'gallery', etag), /Portal not found/)
  f.limit()
  assert.equal((await f.request('own', etag)).status, 429)
  assert.equal(f.reads, 1)
})

test('proxy delegates only exact portal file GETs and keeps private no-store on other requests and redirects', async () => {
  let next = true
  const middleware = loadTs<typeof import('../proxy.ts')>('proxy.ts', {
    '@/lib/supabase/middleware': { updateSession: async () => new Response(null, { status: next ? 200 : 307, headers: next ? { 'x-middleware-next': '1' } : { location: '/admin' } }) },
  })
  const imagePath = '/api/editor-workflow/portal/private/file/own'
  const request = (pathname: string, method = 'GET') => ({ method, nextUrl: { pathname }, headers: new Headers() }) as never
  assert.equal((await middleware.proxy(request(imagePath))).headers.get('cache-control'), null)
  for (const path of ['/portal/private', '/api/editor-workflow/portal/private', '/api/editor-workflow/portal/private/selection', imagePath + '/extra', '/api/bookings']) {
    assert.match((await middleware.proxy(request(path))).headers.get('cache-control') || '', /private.*no-store/)
  }
  for (const method of ['POST', 'HEAD', 'DELETE']) assert.match((await middleware.proxy(request(imagePath, method))).headers.get('cache-control') || '', /no-store/)
  next = false
  assert.match((await middleware.proxy(request(imagePath))).headers.get('cache-control') || '', /no-store/)
})
