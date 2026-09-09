import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'
import * as packageWorkflow from '../lib/package-workflow.ts'
import * as printManifest from '../lib/print-manifest.ts'
import * as schemas from '../lib/security/schemas.ts'
import type { DriveFile } from '../lib/google-drive.ts'

test('fresh devices can load the bare portal URL and legacy signed URLs without cookies; phone and PIN stay server-side', async () => {
  const f = fixture()
  const seenQuotas: string[][] = []
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', {
    '@/lib/onsite-photo-reset': {},
    '@/lib/selection-review': { SelectionReviewError: class SelectionReviewError extends Error {}, reviewSelection: async () => ({ success: true }) },
    "@/lib/portal-download-stream": {},
    'next/server': { NextResponse: { json: Response.json } }, archiver: {},
    '@/lib/editor-workflow': f.workflow, '@/lib/package-workflow': packageWorkflow, '@/lib/auth-api': {}, '@/lib/auth/workflow': {}, '@/lib/google-drive': {},
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async (_request: Request, _policy: unknown, dimensions: string[]) => { seenQuotas.push(dimensions); return null } },
    '@/lib/security/file-validation': {}, '@/lib/security/schemas': schemas,
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} }, '@/lib/security/upload-scanner': {},
    '@/lib/security/request-security': { rejectUntrustedMutation: () => null },
    '@/lib/raw-upload-server': {}, '@/lib/raw-upload-contract': { RawUploadError: class extends Error {} },
  })
  const request = async (query = '', id = '00000000-0000-4000-8000-000000000042') => {
    const url = 'https://www.ficomana.com/api/editor-workflow/portal/' + id + query
    const req = Object.assign(new Request(url), { nextUrl: new URL(url), cookies: { get: () => undefined } })
    return route.GET(req as never, { params: Promise.resolve({ path: ['portal', id] }) })
  }
  for (const query of ['', '?sig=legacy-shared-link']) {
    const response = await request(query)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('set-cookie'), null)
    const data = await response.json()
    assert.equal(data.booking.customerName, 'Synthetic Client')
    assert.equal(data.gallery.length, 2)
    assert.equal(data.booking.customer_phone, undefined)
    assert.equal(data.booking.pin, undefined)
    assert.ok(!JSON.stringify(data).includes('900 000'))
  }
  assert.equal((await request('', 'FM-641357')).status, 404, 'Sequential booking references cannot be used as portal links')
  assert.equal(seenQuotas.length, 2)
})


test('PIN must match the saved booking before any selection, billing, manifest or Drive mutation', async () => {
  for (const pin of [undefined, '', '42', '00420', '１２３４', '0000', 42, ' 0042']) {
    const f = fixture()
    await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', { ...f.input, pin } as never),
      (error: any) => error.code === 'SELECTION_PIN_INVALID' && error.status === 403 && !error.message.includes('0042'))
    assert.equal(f.db.tables.photo_selections[0].status, 'COPY_FAILED')
    assert.equal(f.copies.length, 0)
    assert.equal(f.manifests.length, 0)
    assert.ok(f.db.operations.every(op => op.action === 'select'))
  }
})

test('missing phone and failed booking lookup never allow PIN submission', async () => {
  for (const phone of ['', null, '123', '1234567890123456']) {
    const f = fixture()
    f.db.tables.bookings[0].customer_phone = phone
    await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input),
      (error: any) => error.code === 'SELECTION_PHONE_REQUIRED' && /Try:/.test(error.message))
    assert.ok(f.db.operations.every(op => op.action === 'select'))
  }
  const f = fixture()
  f.fail((table) => table === 'bookings')
  await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input),
    (error: any) => error.code === 'SELECTION_PIN_UNAVAILABLE' && error.status === 503)
  assert.ok(f.db.operations.every(op => op.action === 'select'))
})

test('PIN uses the saved phone with formatting and leading zeros; a changed phone invalidates the old PIN', async () => {
  for (const phone of ['09000000042', '+63 (900) 000-0042']) {
    const f = fixture()
    f.db.tables.bookings[0].customer_phone = phone
    const result = await f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input)
    assert.equal(result.selection?.status, 'SUBMITTED')
    assert.equal((result.booking as any).customer_phone, undefined)
    assert.equal((result.booking as any).pin, undefined)
    assert.ok(!JSON.stringify(f.manifests).includes('0042'))
  }
  const f = fixture()
  f.db.tables.bookings[0].customer_phone = '09000009999'
  await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input),
    (error: any) => error.code === 'SELECTION_PIN_INVALID')
})


class GoogleDriveRequestError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
const bytes = Buffer.from('Synthetic camera original; never a client photo')
const checksum = createHash('sha256').update(bytes).digest('hex')
const md5 = createHash('md5').update(bytes).digest('hex')
const source = { id: 'old-gallery', workspace_id: 'studio', booking_id: 'booking', drive_file_id: 'old-drive', file_name: 'BNI00372.JPG', file_size: bytes.length, checksum, created_at: '2026-09-07T15:38:00Z' }

function fixture() {
  let fail: (table: string, action: string) => boolean = () => false
  const db = memoryDb({
    client_portals: [{ id: 'portal', public_id: '00000000-0000-4000-8000-000000000042', workspace_id: 'studio', booking_id: 'booking', status: 'active', expires_at: '2099-01-01', bookings: { workspace_id: 'studio' }, workspaces: { slug: 'fico-mana', status: 'active' } }],
    bookings: [{ id: 'booking', workspace_id: 'studio', client_id: 'client', booking_date: '2026-09-08', customer_name: 'Synthetic Client', customer_phone: '+63 900 000 0042', selection_limit: 1, price: 1200 }],
    photo_selections: [{ id: 'selection', workspace_id: 'studio', booking_id: 'booking', included_limit: 1, required_count: 1, status: 'COPY_FAILED' }],
    editing_batches: [{ id: 'batch', workspace_id: 'studio', display_id: 'FM-BATCH-2026-09-08-MAIN' }],
    editing_jobs: [{ id: 'job', workspace_id: 'studio', booking_id: 'booking', batch_id: 'batch', status: 'WAITING_FOR_SELECTION' }],
    gallery_files: [{ ...source }, { ...source, id: 'new-gallery', drive_file_id: 'new-drive', created_at: '2026-09-07T15:41:00Z' }],
  }, (table, action) => fail(table, action))
  const files = new Map<string, DriveFile>([['new-drive', { id: 'new-drive', name: source.file_name, mimeType: 'image/jpeg', size: String(bytes.length), sha256Checksum: checksum, md5Checksum: md5, parents: ['raw'], appProperties: { bookingId: 'booking' } }]])
  const errors = new Map<string, number>()
  const copies: Array<Record<string, string>> = []
  const manifests: unknown[] = []
  const reads: string[] = [], hashReads: Array<{ id: string; maximum: number }> = []
  let copyFailureAt = -1
  const drive = {
    GoogleDriveRequestError,
    getDriveFile: async (id: string) => {
      reads.push(id)
      if (errors.has(id)) throw new GoogleDriveRequestError('Provider diagnostic with private ID', errors.get(id)!)
      const file = files.get(id)
      if (!file) throw new GoogleDriveRequestError(`File not found: ${id}.`, 404)
      return file
    },
    hashDriveFileSha256: async (id: string, maximum: number) => { hashReads.push({ id, maximum }); assert.ok(bytes.length <= maximum); return { checksum, bytes: bytes.length } },
    ensureShootHierarchy: async () => ({ ...Object.fromEntries(['root', 'month', 'day', 'client', 'raw', 'selected', 'edited', 'deliverables'].map(id => [id, { id, name: id }])), clientUrl: 'https://drive.google.com/drive/folders/client' }),
    findOrCreateFolder: async (_parent: string, name: string) => ({ id: name, name }),
    copyDriveFile: async (input: Record<string, string>) => {
      if (copies.length === copyFailureAt) { copyFailureAt = -1; throw new Error('Synthetic copy interruption') }
      assert.ok(files.has(input.fileId), 'Copy must reference an available original')
      let copied = copies.find(copy => copy.galleryFileId === input.galleryFileId)
      if (!copied) { copied = { ...input, id: `copy-${copies.length}` }; copies.push(copied) }
      return copied
    },
  }
  const resolver = loadTs<typeof import('../lib/portal-selection-source.ts')>('lib/portal-selection-source.ts', { '@/lib/google-drive': drive })
  const workflow = loadTs<typeof import('../lib/editor-workflow.ts')>('lib/editor-workflow.ts', {
    '@/lib/raw-upload-generation': {}, '@/lib/onsite-drive-sync': {},
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db }, '@/lib/google-drive': drive,
    '@/lib/google-drive-scopes': {}, '@/lib/client-portal': { portalUrl: (id: string) => `/portal/${id}` }, '@/lib/email': {},
    '@/lib/portal-expiry': { hasPortalExpired: (date: string) => Date.parse(date) <= Date.now() },
    '@/lib/booking-provisioning': {}, '@/lib/security/file-validation': {}, '@/lib/security/audit-metadata': { safeMetadata: (value: unknown) => value },
    '@/lib/package-workflow': packageWorkflow, '@/lib/package-workflow-server': { assertGraduationBooking: async () => {} },
    '@/lib/print-manifest': printManifest, '@/lib/print-workflow': { savePrintManifest: async (_id: string, manifest: unknown) => { manifests.push(manifest) } },
    '@/lib/drive-folder-mappings': { saveShootFolderMappings: async () => {} }, '@/lib/portal-selection-source': resolver,
  })
  const input = {
    pin: '0042',
    fileIds: ['old-gallery'], includedFileIds: ['old-gallery'], preferences: [{ fileId: 'old-gallery', preference: 'less' as const }], acknowledgeNoRevision: true,
    printAllocations: (['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R', 'WALLET_SIZE'] as const).map(category => ({ category, fileId: 'old-gallery', quantity: category === 'WALLET_SIZE' ? 4 : 1 })),
  }
  const resolve = () => resolver.resolvePortalSelectionSources(db as never, 'studio', 'booking', 'raw', [db.tables.gallery_files[0] as typeof source])
  return { db, workflow, resolver, files, errors, reads, hashReads, copies, manifests, input, resolve,
    fail: (callback: typeof fail) => { fail = callback }, failCopy: (index: number) => { copyFailureAt = index } }
}

function driveFolderFixture() {
  const f = fixture()
  f.db.tables.drive_folders = [
    { id: 'raw-map', workspace_id: 'studio', booking_id: 'booking', folder_type: 'RAW', drive_folder_id: 'client-raw' },
    { id: 'client-map', workspace_id: 'studio', booking_id: 'booking', folder_type: 'CLIENT', drive_folder_id: 'client-folder' },
  ]
  f.db.tables.booking_provisioning = [{ booking_id: 'booking', drive_client_folder_id: 'client-folder', drive_root_folder_id: 'root' }]
  f.db.tables.google_drive_settings = [{ id: 1, workspace_id: 'studio', root_folder_id: 'root' }]
  f.files.set('client-raw', { id: 'client-raw', name: 'RAW', mimeType: 'application/vnd.google-apps.folder', parents: ['client-folder'], webViewLink: 'https://malicious.invalid/' })
  f.files.set('client-folder', { id: 'client-folder', name: 'CLIENT', mimeType: 'application/vnd.google-apps.folder', parents: ['day'], appProperties: { bookingId: 'booking' } })
  return f
}

test('physical add-on photo choices are validated before Drive copies and saved for portal and editor reads', async () => {
  for (const photoIds of [[], ['foreign-gallery'], ['old-gallery', 'old-gallery'], ['old-gallery', 'new-gallery']]) {
    const f = fixture()
    f.db.tables.addon_catalog = [{ id: 'frame', workspace_id: 'studio', status: 'active', name: '8R Frame', price_amount: 1000, pricing_type: 'fixed', max_quantity: 1, photo_limit: 1 }]
    await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', { ...f.input, addons: [{ addonId: 'frame', quantity: 1, photoCount: 0, photoIds }] }), { code: 'SELECTION_INVALID' })
    assert.equal(f.copies.length, 0)
    assert.equal(f.manifests.length, 0)
  }
  const f = fixture()
  f.db.tables.addon_catalog = [{ id: 'frame', workspace_id: 'studio', status: 'active', name: '8R Frame', price_amount: 1175, pricing_type: 'fixed', max_quantity: 1, photo_limit: 1 }]
  const result = await f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', { ...f.input, addons: [{ addonId: 'frame', quantity: 1, photoCount: 0, photoIds: ['old-gallery'] }] })
  assert.deepEqual(result.selection?.addonOrders[0].photoIds, ['old-gallery'])
  assert.equal(result.selection?.addonOrders[0].total, 1175, 'Live catalog remains the pricing authority')
  assert.deepEqual(f.db.tables.client_addon_orders[0].photo_ids, ['old-gallery'])
})

test('PIN-gated View All Photos returns only the current RAW folder and performs no writes/downloads', async () => {
  const f = driveFolderFixture()
  assert.deepEqual(await f.workflow.getPortalDrivePhotos('00000000-0000-4000-8000-000000000042', '0042'), { url: 'https://drive.google.com/drive/folders/client-raw' })
  assert.deepEqual(f.reads.sort(), ['client-folder', 'client-raw'])
  assert.ok(f.db.operations.every(op => op.action === 'select'))
  assert.equal(f.hashReads.length + f.copies.length + f.manifests.length, 0)
  assert.equal(f.db.tables.photo_selections[0].status, 'COPY_FAILED')
})

test('Drive link lookup blocks wrong PINs and inactive, expired or cross-workspace portals before Drive reads', async () => {
  for (const mutate of [
    (f: ReturnType<typeof driveFolderFixture>) => { f.db.tables.bookings[0].customer_phone = '09000009999' },
    (f: ReturnType<typeof driveFolderFixture>) => { f.db.tables.client_portals[0].status = 'disabled' },
    (f: ReturnType<typeof driveFolderFixture>) => { f.db.tables.client_portals[0].expires_at = '2000-01-01' },
    (f: ReturnType<typeof driveFolderFixture>) => { f.db.tables.client_portals[0].bookings.workspace_id = 'other' },
  ]) {
    const f = driveFolderFixture(); mutate(f)
    await assert.rejects(f.workflow.getPortalDrivePhotos('00000000-0000-4000-8000-000000000042', '0042'))
    assert.equal(f.reads.length, 0)
    assert.ok(f.db.operations.every(op => op.action === 'select'))
  }
})

test('Drive link lookup rejects stale roots, wrong clients, ambiguous mappings, moved folders, shortcuts, Trash and provider errors', async () => {
  const mutations: Array<(f: ReturnType<typeof driveFolderFixture>) => void> = [
    f => { f.db.tables.drive_folders[0].booking_id = 'other' },
    f => { f.db.tables.drive_folders[0].workspace_id = 'other' },
    f => { f.db.tables.drive_folders.push({ ...f.db.tables.drive_folders[0], id: 'duplicate' }) },
    f => { f.db.tables.google_drive_settings[0].root_folder_id = 'new-root' },
    f => { f.db.tables.booking_provisioning[0].drive_client_folder_id = 'other-client' },
    f => { f.files.get('client-raw')!.parents = ['other-client'] },
    f => { f.files.get('client-raw')!.mimeType = 'application/vnd.google-apps.shortcut' },
    f => { f.files.get('client-raw')!.trashed = true },
    f => { f.files.get('client-folder')!.appProperties = { bookingId: 'other-client' } },
    f => { f.files.delete('client-raw') },
    f => { f.fail(table => table === 'drive_folders') },
  ]
  for (const mutate of mutations) {
    const f = driveFolderFixture(); mutate(f)
    await assert.rejects(f.workflow.getPortalDrivePhotos('00000000-0000-4000-8000-000000000042', '0042'), (error: any) => error.code === 'PORTAL_DRIVE_UNAVAILABLE' && /Try:/.test(error.message) && !error.message.includes('client-raw'))
    assert.ok(f.db.operations.every(op => op.action === 'select'))
  }
})

test('missing original with cached preview recovers the exact re-upload, preserves photo/print IDs and locks only after saving', async () => {
  const f = fixture()
  const result = await f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input)
  assert.equal(result.selection?.status, 'SUBMITTED')
  assert.equal(f.db.tables.bookings[0].raw_photo_status, 'Pending Review')
  assert.equal(f.db.tables.bookings[0].raw_photo_approved_at, null)
  assert.equal(f.db.tables.editing_jobs[0].status, 'WAITING_FOR_SELECTION')
  assert.equal(f.copies[0].fileId, 'new-drive')
  assert.equal(f.copies[0].galleryFileId, 'old-gallery')
  assert.equal(f.db.tables.photo_selection_items[0].enhancement_preference, 'less')
  assert.equal(f.db.tables.photo_selections[0].no_revision_acknowledged, true)
  assert.equal(f.db.tables.print_allocations.length, 4)
  assert.ok(f.db.tables.print_allocations.every(row => row.gallery_file_id === 'old-gallery' && row.drive_file_id === null), 'Prints wait for enhanced uploads')
  assert.equal(f.manifests.length, 1)
  assert.equal(f.hashReads.length, 0, 'Use the provider checksum without downloading the camera original')
  assert.equal(f.db.tables.gallery_files[0].drive_file_id, 'old-drive', 'Do not mutate gallery identity or originals')
  await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input), /already submitted and locked/)
  assert.equal(f.copies.length, 1)
})

test('available original remains unchanged; 50 MB re-upload recovery uses metadata, with bounded streaming fallback', async () => {
  const f = fixture()
  f.files.set('old-drive', { ...f.files.get('new-drive')!, id: 'old-drive' })
  assert.equal((await f.resolve()).get('old-gallery'), 'old-drive')
  assert.deepEqual(f.reads, ['old-drive'])
  f.files.delete('old-drive')
  for (const row of f.db.tables.gallery_files) row.file_size = 50 * 1024 * 1024
  f.files.get('new-drive')!.size = String(50 * 1024 * 1024)
  assert.equal((await f.resolve()).get('old-gallery'), 'new-drive')
  assert.equal(f.hashReads.length, 0)
  for (const row of f.db.tables.gallery_files) row.file_size = bytes.length
  f.files.get('new-drive')!.size = String(bytes.length)
  delete f.files.get('new-drive')!.sha256Checksum
  assert.equal((await f.resolve()).get('old-gallery'), 'new-drive')
  assert.deepEqual(f.hashReads, [{ id: 'new-drive', maximum: bytes.length }])
  f.db.tables.gallery_files[0].checksum = md5
  assert.equal((await f.resolve()).get('old-gallery'), 'new-drive', 'Sync Drive MD5 identities are supported')
})

test('recovery rejects lookalikes, wrong clients/workspaces/parents, shortcuts, pending uploads, missing metadata and Trash', async () => {
  const changes: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.files.get('new-drive')!.sha256Checksum = '0'.repeat(64) },
    f => { f.db.tables.gallery_files[1].booking_id = 'other-client' },
    f => { f.db.tables.gallery_files[1].workspace_id = 'other-studio' },
    f => { f.files.get('new-drive')!.parents = ['other-raw'] },
    f => { f.files.get('new-drive')!.appProperties = { bookingId: 'other-client' } },
    f => { f.files.get('new-drive')!.mimeType = 'application/vnd.google-apps.shortcut' },
    f => { f.files.get('new-drive')!.appProperties = { rawVerification: 'pending' } },
    f => { f.files.get('new-drive')!.trashed = true },
    f => { f.files.get('new-drive')!.size = '1' },
    f => { f.files.get('new-drive')!.name = 'other.JPG' },
    f => { f.db.tables.gallery_files[0].checksum = null },
    f => { f.db.tables.gallery_files[0].file_size = null },
  ]
  for (const change of changes) {
    const f = fixture(); change(f)
    await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input), error => {
      assert.ok(error instanceof f.resolver.PortalSelectionError)
      assert.equal(error.code, 'SELECTION_ORIGINAL_UNAVAILABLE')
      assert.match(error.message, /BNI00372.JPG.*Try:.*restore or re-upload/)
      assert.ok(!error.message.includes('old-drive'))
      return true
    })
    assert.equal(f.copies.length, 0, 'Preflight must not copy anything if a selected original cannot be resolved')
    assert.equal(f.db.tables.photo_selections[0].status, 'COPY_FAILED')
    assert.equal(f.db.tables.photo_selection_items?.length || 0, 0)
  }
})

test('Drive permission/quota/server errors are not treated as deleted originals', async t => {
  t.mock.method(console, 'error', () => {})
  for (const status of [403, 429, 500]) {
    const f = fixture(); f.errors.set('old-drive', status)
    await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input), /Try: submit again/)
    assert.deepEqual(f.reads, ['old-drive'])
    assert.equal(f.copies.length, 0)
    assert.equal(f.db.tables.photo_selections[0].status, 'COPY_FAILED')
  }
})

test('copy interruption remains retryable and creates no duplicate selected copies or print allocations', async t => {
  t.mock.method(console, 'error', () => {})
  const f = fixture()
  f.db.tables.photo_selections[0].included_limit = 2
  f.db.tables.gallery_files.push({ ...source, id: 'second-gallery', drive_file_id: 'second-drive', file_name: 'SECOND.JPG' })
  f.files.set('second-drive', { ...f.files.get('new-drive')!, id: 'second-drive', name: 'SECOND.JPG' })
  f.input.fileIds.push('second-gallery'); f.input.includedFileIds.push('second-gallery')
  f.failCopy(1)
  await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input), /could not be completed/)
  assert.equal(f.copies.length, 1)
  assert.equal(f.db.tables.photo_selections[0].status, 'COPY_FAILED')
  await f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input)
  assert.equal(f.copies.length, 2)
  assert.equal(f.db.tables.photo_selection_items.length, 2)
  assert.equal(f.db.tables.print_allocations.length, 4)
})

test('five included plus one extra retains the configured PHP 400 charge, with no duplicated orders on retry', async t => {
  t.mock.method(console, 'error', () => {})
  const f = fixture()
  f.db.tables.photo_selections[0].included_limit = 5
  f.db.tables.addon_catalog = [{ id: 'extra', workspace_id: 'studio', name: 'Extra Edit', status: 'active', price_amount: 400, pricing_type: 'per_photo', max_quantity: 200 }]
  for (let index = 1; index < 6; index++) {
    f.db.tables.gallery_files.push({ ...source, id: `gallery-${index}`, drive_file_id: `drive-${index}`, file_name: `PHOTO-${index}.JPG` })
    f.files.set(`drive-${index}`, { ...f.files.get('new-drive')!, id: `drive-${index}`, name: `PHOTO-${index}.JPG` })
  }
  const included = ['old-gallery', 'gallery-1', 'gallery-2', 'gallery-3', 'gallery-4']
  const input = { ...f.input, fileIds: [...included, 'gallery-5'], includedFileIds: included, extraEditFileIds: ['gallery-5'], addons: [{ addonId: 'extra', quantity: 1, photoCount: 1 }] }
  f.fail((table, action) => table === 'client_addon_orders' && action === 'insert')
  await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', input), /could not be completed/)
  assert.equal(f.copies.length, 6)
  f.fail(() => false)
  const result = await f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', input)
  assert.equal(f.copies.length, 6)
  assert.equal(f.copies.filter(copy => copy.purpose === 'extra-edit').length, 1)
  assert.equal(f.db.tables.client_addon_orders.length, 1)
  assert.equal(f.db.tables.client_addon_orders[0].total_amount, 400)
  assert.equal(result.selection?.totalAddonAmount, 400)
  assert.equal(f.db.tables.photo_selection_items.filter(row => !row.is_extra_edit).length, 5)
})

test('database errors are checked, transport errors unlock retry, and post-submit refresh failure never reopens a saved selection', async t => {
  t.mock.method(console, 'error', () => {})
  for (const [table, action] of [['photo_selection_items', 'delete'], ['photo_selection_items', 'insert'], ['print_allocations', 'insert'], ['editing_jobs', 'update'], ['bookings', 'update'], ['photo_selections', 'finalize']]) {
    const f = fixture()
    let updates = 0
    f.fail((target, operation) => target === table && (action === 'finalize' ? operation === 'update' && ++updates === 2 : operation === action))
    await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input), /could not be completed/)
    assert.equal(f.db.tables.photo_selections[0].status, 'COPY_FAILED')
    assert.equal(f.db.tables.workflow_audit_logs.some(row => row.action === 'SELECTION_SUBMITTED'), false)
  }
  const interrupted = fixture()
  interrupted.fail((table, action) => { if (table === 'gallery_files' && action === 'select') throw new Error('Synthetic transport failure'); return false })
  await assert.rejects(interrupted.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', interrupted.input), /could not be completed/)
  assert.equal(interrupted.db.tables.photo_selections[0].status, 'COPY_FAILED')
  const refresh = fixture()
  refresh.fail((table, action) => table === 'bookings' && action === 'select' && refresh.db.tables.photo_selections[0].status === 'SUBMITTED')
  await assert.rejects(refresh.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', refresh.input), /Your selection was submitted.*refresh the portal/)
  assert.equal(refresh.db.tables.photo_selections[0].status, 'SUBMITTED')
})

test('validation, private portal access and concurrent submissions remain protected', async () => {
  const f = fixture()
  await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', { ...f.input, acknowledgeNoRevision: false }), /acknowledge/)
  await assert.rejects(f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', { ...f.input, printAllocations: [] }), /every free print/)
  assert.equal(f.db.tables.photo_selections[0].status, 'OPEN')
  const [first, second] = await Promise.allSettled([f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input), f.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', f.input)])
  assert.equal([first, second].filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(f.copies.length, 1)
  for (const patch of [{ status: 'disabled' }, { expires_at: '2000-01-01' }, { bookings: { workspace_id: 'other' } }]) {
    const privatePortal = fixture(); Object.assign(privatePortal.db.tables.client_portals[0], patch)
    await assert.rejects(privatePortal.workflow.submitPhotoSelection('00000000-0000-4000-8000-000000000042', privatePortal.input))
    assert.equal(privatePortal.reads.length, 0)
    assert.equal(privatePortal.copies.length, 0)
  }
})

test('production API exposes only safe selection errors with no-store, preserves origin, PIN and rate checks without a session', async t => {
  const f = fixture(); f.files.clear()
  let trusted = true, limited = false
  const testEnv = process.env as Record<string, string | undefined>
  const previous = testEnv.NODE_ENV; testEnv.NODE_ENV = 'production'
  t.after(() => { if (previous === undefined) delete testEnv.NODE_ENV; else testEnv.NODE_ENV = previous })
  const route = loadTs<typeof import('../app/api/editor-workflow/[...path]/route.ts')>('app/api/editor-workflow/[...path]/route.ts', {
    '@/lib/onsite-photo-reset': {},
    '@/lib/selection-review': { SelectionReviewError: class SelectionReviewError extends Error {}, reviewSelection: async () => ({ success: true }) },
    "@/lib/portal-download-stream": {},
    'next/server': { NextResponse: { json: Response.json } }, archiver: {},
    '@/lib/editor-workflow': f.workflow, '@/lib/package-workflow': packageWorkflow, '@/lib/auth-api': {}, '@/lib/auth/workflow': {}, '@/lib/google-drive': {},
    '@/lib/security/api-rate-limit': { API_RATE_LIMITS: {}, enforceApiRateLimit: async () => limited ? Response.json({}, { status: 429 }) : null },
    '@/lib/security/file-validation': {}, '@/lib/security/schemas': { ...schemas, portalSelectionSchema: { safeParse: (data: unknown) => ({ success: true, data }) } },
    '@/lib/security/security-audit': { recordSecurityAuditEvent: async () => {} }, '@/lib/security/upload-scanner': {},
    '@/lib/security/request-security': { rejectUntrustedMutation: () => trusted ? null : Response.json({}, { status: 403 }) },
    '@/lib/raw-upload-server': {}, '@/lib/raw-upload-contract': { RawUploadError: class extends Error {} },
  })
  const request = () => {
    const url = 'https://www.ficomana.com/api/editor-workflow/portal/00000000-0000-4000-8000-000000000042/selection'
    const req = Object.assign(new Request(url, { method: 'POST', body: JSON.stringify(f.input), headers: { 'content-type': 'application/json' } }), { nextUrl: new URL(url), cookies: { get: () => undefined } })
    return route.POST(req as never, { params: Promise.resolve({ path: ['portal', '00000000-0000-4000-8000-000000000042', 'selection'] }) })
  }
  const failed = await request()
  assert.equal(failed.status, 409)
  assert.equal(failed.headers.get('cache-control'), 'no-store')
  const body = await failed.json()
  assert.equal(body.code, 'SELECTION_ORIGINAL_UNAVAILABLE')
  assert.match(body.error, /BNI00372.JPG.*Try:/)
  assert.ok(body.requestId)
  assert.ok(!JSON.stringify(body).includes('old-drive'))
  trusted = false; assert.equal((await request()).status, 403)
  trusted = true; limited = true; assert.equal((await request()).status, 429)
})
