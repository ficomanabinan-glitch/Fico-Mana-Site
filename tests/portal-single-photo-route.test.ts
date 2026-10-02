import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'
import * as storageKeys from '../lib/storage/storage-keys.ts'

const publicId = '77777777-7777-4777-8777-777777777777'
const ownId = '88888888-8888-4888-8888-000000000001'
const foreignId = '88888888-8888-4888-8888-000000000002'
class PortalSelectionError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status = 409) { super(message); this.code = code; this.status = status }
}

function fixture(routeSource?: string, workflowSource?: string) {
  const db = memoryDb({
    client_portals: [{ public_id: publicId, workspace_id: 'studio', booking_id: 'booking', status: 'active', expires_at: null,
      bookings: { workspace_id: 'studio' }, workspaces: { slug: 'fico-mana', status: 'active' } }],
    photo_selections: [{ workspace_id: 'studio', booking_id: 'booking', status: 'OPEN', raw_reset_id: null }],
    bookings: [{ id: 'booking', workspace_id: 'studio', package_id: 'package' }],
    packages: [{ id: 'package', category: 'graduation' }],
    gallery_files: [ownId, foreignId].map((id, i) => ({ id, workspace_id: 'studio', booking_id: i ? 'foreign-booking' : 'booking',
      storage_provider: 'r2', storage_status: 'available', file_name: 'SYNTHETIC.JPG', file_size: 100,
      storage_key: `workspaces/studio/shoots/2026/10/03/${i ? 'foreign-booking' : 'booking'}/raw/photo.jpg` })),
    deliverable_files: [{ id: ownId, workspace_id: 'studio', booking_id: 'booking', storage_provider: 'r2',
      storage_status: 'available', published_at: null, file_name: 'ENHANCED.JPG', file_size: 120,
      storage_key: 'workspaces/studio/shoots/2026/10/03/booking/enhanced/photo.jpg' }],
  })
  const stubs: Record<string, unknown> = {
    sharp: {}, '@/lib/supabase/admin': { getSupabaseAdmin: () => db },
    '@/lib/portal-expiry': { hasPortalExpired: () => false },
    '@/lib/portal-selection-source': { PortalSelectionError }, '@/lib/storage/storage-keys': storageKeys,
  }
  for (const name of ['client-portal', 'email', 'security/file-validation', 'security/audit-metadata', 'package-workflow-server',
    'package-workflow', 'print-manifest', 'print-workflow', 'raw-upload-generation', 'storage/booking-storage',
    'storage/storage-service', 'storage/presigned-urls', 'portal-raw-downloads', 'storage/multipart-upload']) stubs[`@/lib/${name}`] = {}
  const workflow = loadTs<typeof import('../lib/editor-workflow.ts')>('lib/editor-workflow.ts', stubs, workflowSource)
  const manifests: unknown[] = []
  let quotaCalls = 0
  const routeStubs: Record<string, unknown> = {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/editor-workflow': workflow,
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async () => null },
    '@/lib/security/request-security': { rejectUntrustedMutation: () => null },
    '@/lib/package-workflow': { GraduationWorkflowOnlyError: class extends Error {} },
    '@/lib/raw-upload-contract': { RawUploadError: class extends Error {} },
    '@/lib/selection-review': { SelectionReviewError: class extends Error {} },
    '@/lib/portal-raw-downloads': { beginPortalRawDownload: () => { quotaCalls++; throw new Error('Must not consume a bulk slot') } },
    '@/lib/private-download-manifest': { createPortalDownloadRedirect: async (input: unknown) => {
      manifests.push(input); return `https://downloads.invalid/file/${ownId}?token=synthetic`
    } },
  }
  for (const name of ['auth-api', 'auth/workflow', 'storage/storage-service', 'security/file-validation', 'security/schemas',
    'security/security-audit', 'security/upload-scanner', 'raw-upload-server', 'onsite-photo-reset']) routeStubs[`@/lib/${name}`] = {}
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', routeStubs, routeSource)
  const request = async (id = ownId, kind = 'original') => {
    const url = new URL(`https://ficomana.com/api/editor-workflow/portal/${publicId}/single-photo/${id}?kind=${kind}`)
    return route.POST(Object.assign(new Request(url, { method: 'POST' }), { nextUrl: url }) as never,
      { params: Promise.resolve({ path: ['portal', publicId, 'single-photo', id] }) })
  }
  return { workflow, request, manifests, db, quotaCalls: () => quotaCalls }
}

test('valid UUID single-photo downloads work during selection without using bulk quota', async () => {
  const f = fixture()
  const response = await f.request()
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()))
  assert.match((await response.json()).url, /\/file\//)
  assert.deepEqual(f.manifests, [{ publicId, kind: 'PORTAL_ORIGINAL_SINGLE', format: 'file', fileName: 'SYNTHETIC.JPG',
    entries: [{ name: 'SYNTHETIC.JPG', storageKey: 'workspaces/studio/shoots/2026/10/03/booking/raw/photo.jpg', byteSize: 100 }] }])
  assert.equal(f.quotaCalls(), 0)
  await assert.rejects(f.workflow.preparePortalRawPhotos(publicId), /Submit your photo selection/)
})

test('individual access still rejects malformed IDs, foreign photos, unpublished deliverables and expired portals', async () => {
  const f = fixture()
  assert.equal((await f.request('not-a-photo')).status, 400)
  assert.equal((await f.request('88888888-8888-4888-000000000001')).status, 400)
  assert.equal((await f.request(foreignId)).status, 404)
  assert.equal((await f.request(ownId, 'deliverable')).status, 404)
  f.db.tables.client_portals[0].status = 'expired'
  assert.equal((await f.request()).status, 410)
  assert.equal(f.manifests.length, 0)
})

test('published enhanced photo has its own private attachment during selection', async () => {
  const f = fixture()
  f.db.tables.deliverable_files[0].published_at = '2026-10-03T01:00:00Z'
  const response = await f.request(ownId, 'deliverable')
  assert.equal(response.status, 200)
  assert.deepEqual(f.manifests, [{ publicId, kind: 'PORTAL_DELIVERABLES', format: 'file', fileName: 'ENHANCED.JPG',
    entries: [{ name: 'ENHANCED.JPG', storageKey: 'workspaces/studio/shoots/2026/10/03/booking/enhanced/photo.jpg', byteSize: 120 }] }])
  assert.equal(f.quotaCalls(), 0)
})

test('single-file access retains reset, workspace, private key and availability protections', async () => {
  for (const [scenario, mutate] of [
    ['reset', (f: ReturnType<typeof fixture>) => { f.db.tables.photo_selections[0].raw_reset_id = 'reset-active' }],
    ['foreign workspace', (f: ReturnType<typeof fixture>) => { f.db.tables.gallery_files[0].workspace_id = 'other' }],
    ['foreign storage key', (f: ReturnType<typeof fixture>) => { f.db.tables.gallery_files[0].storage_key = 'workspaces/studio/shoots/2026/10/03/other/raw/photo.jpg' }],
    ['missing storage object', (f: ReturnType<typeof fixture>) => { f.db.tables.gallery_files[0].storage_status = 'deleted' }],
    ['disabled portal', (f: ReturnType<typeof fixture>) => { f.db.tables.client_portals[0].status = 'disabled' }],
  ] as const) {
    const f = fixture()
    mutate(f)
    await assert.rejects(f.workflow.preparePortalSinglePhoto(publicId, ownId, 'original'), error => error instanceof Error, scenario)
    assert.equal(f.manifests.length, 0)
  }
})

test('regression proves rejection without each server fix and stable success with both fixes', async () => {
  const routeSource = readFileSync('app/api/editor-workflow/[...path]/route.ts', 'utf8')
  const invalidUuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)'
  const oldRoute = routeSource.replace(invalidUuidPattern, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)')
  assert.notEqual(oldRoute, routeSource, 'mutation must remove the actual route fix')
  const workflowSource = readFileSync('lib/editor-workflow.ts', 'utf8')
  const marker = workflowSource.indexOf('export async function preparePortalSinglePhoto(')
  const oldWorkflow = workflowSource.slice(0, marker) + workflowSource.slice(marker).replace('await portalRecord(publicId)',
    "kind === 'original' ? await portalOriginalsReady(publicId) : await portalRecord(publicId)")
  assert.notEqual(oldWorkflow, workflowSource, 'mutation must remove the actual selection-access fix')
  for (let run = 0; run < 10; run++) {
    assert.equal((await fixture(oldRoute).request()).status, 400)
    assert.equal((await fixture(undefined, oldWorkflow).request()).status, 409)
    assert.equal((await fixture().request()).status, 200)
  }
})

test('real portal selection keeps individual icons visible; sample stays non-downloadable', () => {
  const source = readFileSync('components/client-photo-selection.tsx', 'utf8')
  assert.match(source, /canDownloadIndividual=\{!sampleMode\}/)
})
