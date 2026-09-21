import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'
import * as packageWorkflow from '../lib/package-workflow.ts'
import * as storageKeys from '../lib/storage/storage-keys.ts'

class RawUploadError extends Error {}
class PortalSelectionError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status = 409) {
    super(message)
    this.code = code
    this.status = status
  }
}

const publicId = '00000000-0000-4000-8000-000000000042'
const prefix = 'workspaces/studio/shoots/2026/09/14/booking'

function fixture() {
  let failedTable = ''
  let signings = 0
  let limited = false
  const db = memoryDb({
    client_portals: [{
      id: 'p', public_id: publicId, booking_id: 'booking', workspace_id: 'studio', status: 'active', expires_at: '2099-01-01',
      bookings: { workspace_id: 'studio' }, workspaces: { slug: 'fico-mana', status: 'active' },
    }],
    photo_selections: [{ workspace_id: 'studio', booking_id: 'booking', raw_reset_id: null, raw_upload_generation: 1, reopened_at: null }],
    gallery_files: [
      {
        id: 'own', workspace_id: 'studio', booking_id: 'booking', storage_provider: 'r2', storage_status: 'available',
        storage_key: `${prefix}/raw/own.jpg`, preview_reference: `${prefix}/preview/own.webp`,
        thumbnail_reference: `${prefix}/thumbnail/own.webp`, file_name: 'own.JPG', mime_type: 'image/jpeg',
        file_size: 100, checksum: 'version-1', updated_at: '2026-09-14', created_at: '2026-09-14',
      },
      {
        id: 'foreign', workspace_id: 'studio', booking_id: 'other-booking', storage_provider: 'r2', storage_status: 'available',
        storage_key: 'workspaces/studio/shoots/2026/09/14/other-booking/raw/foreign.jpg',
      },
      {
        id: 'foreign-workspace', workspace_id: 'other', booking_id: 'booking', storage_provider: 'r2', storage_status: 'available',
        storage_key: 'workspaces/other/shoots/2026/09/14/booking/raw/foreign.jpg',
      },
    ],
    deliverable_files: [{
      id: 'edited', workspace_id: 'studio', booking_id: 'booking', storage_provider: 'r2', storage_status: 'available',
      storage_key: `${prefix}/enhanced/edited.jpg`, mime_type: 'image/jpeg', file_name: 'edited.JPG',
      file_size: 120, checksum: 'edited-v1', published_at: '2026-09-14', created_at: '2026-09-14',
    }],
  }, table => table === failedTable)
  const workflow = loadTs<typeof import('../lib/editor-workflow.ts')>('lib/editor-workflow.ts', {
    sharp: () => ({}),
    '@/lib/client-portal': {},
    '@/lib/portal-expiry': { hasPortalExpired: (value: string) => Date.parse(value) <= Date.now() },
    '@/lib/email': {},
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/security/file-validation': {},
    '@/lib/security/audit-metadata': {},
    '@/lib/package-workflow-server': {},
    '@/lib/package-workflow': packageWorkflow,
    '@/lib/print-manifest': {},
    '@/lib/print-workflow': {},
    '@/lib/portal-selection-source': { PortalSelectionError },
    '@/lib/raw-upload-generation': {},
    '@/lib/addon-photo-rules': {},
    '@/lib/enhanced-upload-naming': {},
    '@/lib/storage/booking-storage': {},
    '@/lib/storage/storage-service': { getObject: async () => ({ Body: Readable.from([Buffer.from('private image bytes')]) }) },
    '@/lib/storage/storage-keys': storageKeys,
    '@/lib/storage/presigned-urls': {
      createDownloadUrl: async ({ key }: { key: string }) => {
        signings++
        return `https://signed.invalid/${encodeURIComponent(key)}?token=short-lived`
      },
    },
    '@/lib/storage/multipart-upload': {},
    '@/lib/portal-raw-downloads': {},
    '@/lib/private-download-manifest': {},
  })
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', {
    'next/server': {
      NextResponse: {
        json: (value: unknown, init?: ResponseInit) => Response.json(value, init),
        redirect: (url: string, init?: ResponseInit) => new Response(null, {
          ...init,
          headers: { ...Object.fromEntries(new Headers(init?.headers)), location: url },
        }),
      },
    },
    archiver: {},
    '@/lib/package-workflow': packageWorkflow,
    '@/lib/auth-api': {},
    '@/lib/auth/workflow': {},
    '@/lib/editor-workflow': workflow,
    '@/lib/portal-raw-downloads': {},
    '@/lib/private-download-manifest': {},
    '@/lib/storage/storage-service': { getObject: async () => ({ Body: Readable.from([Buffer.from('private image bytes')]) }) },
    '@/lib/portal-download-stream': {},
    '@/lib/security/api-rate-limit': {
      API_RATE_LIMITS: { portalRead: {} },
      enforceApiRateLimit: async () => limited ? new Response(null, { status: 429, headers: { 'cache-control': 'no-store' } }) : null,
    },
    '@/lib/security/file-validation': {},
    '@/lib/security/schemas': {},
    '@/lib/security/security-audit': {},
    '@/lib/security/upload-scanner': {},
    '@/lib/security/request-security': {},
    '@/lib/raw-upload-server': {},
    '@/lib/raw-upload-contract': { RawUploadError },
    '@/lib/onsite-photo-reset': {},
    '@/lib/selection-review': { SelectionReviewError: class SelectionReviewError extends Error {} },
    '@/lib/portal-page-payload': {},
  })
  const request = async (file = 'own', etag = '', kind = 'gallery', variant = 'preview') => {
    const url = `https://www.ficomana.com/api/editor-workflow/portal/${publicId}/file/${file}?kind=${kind}&variant=${variant}`
    const req = Object.assign(new Request(url, { headers: { 'if-none-match': etag } }), {
      nextUrl: new URL(url),
      cookies: { get: () => undefined },
    })
    return route.GET(req as never, { params: Promise.resolve({ path: ['portal', publicId, 'file', file] }) })
  }
  return {
    workflow, request, db,
    get signings() { return signings },
    limit: () => { limited = true },
    fail: (table: string) => { failedTable = table },
  }
}

test('authorized portal images are privately proxied and reuse private validators without exposing R2 URLs', async () => {
  const f = fixture()
  const first = await f.request()
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('location'), null)
  assert.equal(await first.text(), 'private image bytes')
  assert.match(first.headers.get('cache-control') || '', /private.*must-revalidate/)
  assert.equal(first.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(f.signings, 0)

  const direct = await f.workflow.getPortalFile(publicId, 'own', 'gallery')
  assert.equal(direct.notModified, false)
  const etag = direct.etag
  assert.ok(!etag.includes('workspaces/'))
  for (const validator of [etag, `"unrelated", ${etag}`, etag.replace(/^W\//, '')]) {
    const cached = await f.request('own', validator)
    assert.equal(cached.status, 304)
    assert.equal((await cached.arrayBuffer()).byteLength, 0)
    assert.equal(cached.headers.get('etag'), etag)
  }
  assert.equal(f.signings, 0, 'Portal reads never expose an R2 signed URL')
  f.db.tables.gallery_files[0].checksum = 'version-2'
  const changed = await f.request('own', etag)
  assert.equal(changed.status, 200)
  assert.equal(f.signings, 0)
})

test('thumbnail and deliverable requests expose only the owned server-side storage key', async () => {
  const f = fixture()
  const thumbnail = await f.workflow.getPortalFile(publicId, 'own', 'gallery', null, 'thumbnail')
  assert.equal(thumbnail.notModified, false)
  assert.ok('storageKey' in thumbnail)
  assert.match(String(thumbnail.storageKey), /thumbnail\/own\.webp/)
  const edited = await f.workflow.getPortalFile(publicId, 'edited', 'deliverable')
  assert.equal(edited.notModified, false)
  assert.ok('storageKey' in edited)
  assert.match(String(edited.storageKey), /enhanced\/edited\.jpg/)
  assert.equal(edited.mimeType, 'image/jpeg')
  assert.equal(edited.fileName, 'edited.JPG')
})

test('live portal state and exact workspace and booking ownership are checked before any R2 URL is signed', async () => {
  const f = fixture()
  for (const file of ['foreign', 'foreign-workspace', 'missing']) {
    await assert.rejects(f.workflow.getPortalFile(publicId, file, 'gallery', '*'), /Photo not found/)
  }
  assert.equal(f.signings, 0)
  f.db.tables.photo_selections[0].raw_reset_id = 'private-reset-id'
  await assert.rejects(f.workflow.getPortalFile(publicId, 'own', 'gallery'), (error: any) => error.code === 'PHOTOS_RESETTING')
  assert.equal(f.signings, 0)

  f.db.tables.photo_selections[0].raw_reset_id = null
  for (const change of [{ status: 'disabled' }, { status: 'expired' }, { status: 'active', expires_at: '2000-01-01' }]) {
    Object.assign(f.db.tables.client_portals[0], change)
    await assert.rejects(f.workflow.getPortalFile(publicId, 'own', 'gallery'))
  }
  f.db.tables.client_portals = []
  await assert.rejects(f.workflow.getPortalFile(publicId, 'own', 'gallery'), /Portal not found/)
  assert.equal(f.signings, 0)
})

test('database failure and rate limiting fail closed without signing an R2 URL', async () => {
  const f = fixture()
  for (const table of ['client_portals', 'gallery_files']) {
    f.fail(table)
    await assert.rejects(f.workflow.getPortalFile(publicId, 'own', 'gallery'), /Synthetic database failure|Photo availability could not be checked/)
    f.fail('')
  }
  f.limit()
  assert.equal((await f.request()).status, 429)
  assert.equal(f.signings, 0)
})

test('proxy delegates only exact portal file GETs and keeps private no-store on other requests and redirects', async () => {
  let next = true
  const middleware = loadTs<typeof import('../proxy.ts')>('proxy.ts', {
    '@/lib/supabase/middleware': { updateSession: async () => new Response(null, { status: next ? 200 : 307, headers: next ? { 'x-middleware-next': '1' } : { location: '/admin' } }) },
  })
  const imagePath = `/api/editor-workflow/portal/${publicId}/file/own`
  const request = (pathname: string, method = 'GET') => ({ method, nextUrl: { pathname }, headers: new Headers() }) as never
  assert.equal((await middleware.proxy(request(imagePath))).headers.get('cache-control'), null)
  for (const path of ['/portal/private', '/api/editor-workflow/portal/private', `/api/editor-workflow/portal/${publicId}/selection`, imagePath + '/extra', '/api/bookings']) {
    assert.match((await middleware.proxy(request(path))).headers.get('cache-control') || '', /private.*no-store/)
  }
  for (const method of ['POST', 'HEAD', 'DELETE']) assert.match((await middleware.proxy(request(imagePath, method))).headers.get('cache-control') || '', /no-store/)
  next = false
  assert.match((await middleware.proxy(request(imagePath))).headers.get('cache-control') || '', /no-store/)
})
