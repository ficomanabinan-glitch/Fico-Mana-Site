import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { memoryDb } from './helpers/memory-db.ts'
import { saveShootFolderMappings } from '../lib/drive-folder-mappings.ts'
import * as bookingDb from '../lib/booking-db.ts'

const MIME = 'application/vnd.google-apps.folder'
type Folder = { id: string; name: string; mimeType: string; parents: string[]; trashed?: boolean; appProperties?: Record<string, string> }
function fixture(t: TestContext) {
  const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
  const before = names.map(name => process.env[name])
  names.forEach(name => { process.env[name] = 'synthetic-root-retry' })
  t.after(() => names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index] }))
  const folders: Folder[] = [{ id: 'new-root', name: 'FICOMANA SHOOTS', mimeType: MIME, parents: ['root'] }]
  const calls: Array<{ method: string; id: string }> = []
  const errors = new Map<string, number>()
  let failChild = ''
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    if (String(input).includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'synthetic', expires_in: 3600 })
    const url = new URL(input), method = init?.method || 'GET'
    assert.equal(url.origin, 'https://www.googleapis.com')
    const id = url.pathname.split('/files/')[1] || ''
    calls.push({ method, id })
    if (id) {
      if (errors.has(id)) return Response.json({ error: { message: 'Synthetic Drive failure' } }, { status: errors.get(id) })
      const file = folders.find(folder => folder.id === id)
      if (!file) return Response.json({ error: { message: `File not found: ${id}.` } }, { status: 404 })
      if (method === 'PATCH') {
        Object.assign(file, JSON.parse(String(init?.body)))
        if (url.searchParams.has('addParents')) file.parents = [url.searchParams.get('addParents')!]
      } else assert.equal(method, 'GET', 'No delete request is allowed')
      return Response.json(file)
    }
    if (method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Omit<Folder, 'id'>
      if (body.name === failChild) { failChild = ''; return Response.json({ error: { message: 'Synthetic temporary failure' } }, { status: 503 }) }
      const file = { ...body, id: `new-${folders.length}` }; folders.push(file); return Response.json(file)
    }
    assert.equal(method, 'GET')
    const q = url.searchParams.get('q') || ''
    const parent = q.match(/^'([^']+)' in parents/)?.[1]
    const name = q.match(/name = '([^']+)'/)?.[1]
    const booking = q.match(/key='bookingId' and value='([^']+)'/)?.[1]
    return Response.json({ files: folders.filter(file => !file.trashed && file.parents.includes(parent || '') &&
      (!name || file.name === name) && (!booking || file.appProperties?.bookingId === booking && file.appProperties?.purpose === 'client-shoot-folder')) })
  })
  const drive = loadTs<typeof import('../lib/google-drive.ts')>('lib/google-drive.ts', {
    '@/lib/supabase/admin': { getSupabaseAdmin: () => null }, '@/lib/google-oauth': {},
    '@/lib/security/outbound-url': {}, '@/lib/security/origin': {},
    '@/lib/package-workflow-server': { assertGraduationBooking: async () => {} },
  })
  const db = memoryDb({ google_drive_settings: [{ id: 1, workspace_id: 'studio', root_folder_id: 'new-root', root_folder_name: 'FICOMANA SHOOTS' }] })
  const input = { admin: db as never, bookingId: 'FM-TEST', shootDate: '2026-09-08', clientName: 'Synthetic client', existingRootFolderId: 'old-root', existingClientFolderId: 'missing-old-client' }
  return { drive, db, folders, calls, errors, input, failNextChild: (name: string) => { failChild = name } }
}

test('root change builds a new hierarchy without reading/moving old client folders, then retry reuses it', async t => {
  const f = fixture(t)
  const first = await f.drive.ensureShootHierarchy(f.input)
  const count = f.folders.length
  const second = await f.drive.ensureShootHierarchy(f.input)
  assert.equal(first.root.id, 'new-root')
  assert.deepEqual(first, second)
  assert.equal(f.folders.length, count)
  assert.equal(f.calls.some(call => call.id === 'missing-old-client' || call.method === 'PATCH'), false)
  assert.deepEqual(first.client.parents, [first.day.id])
  assert.equal(first.client.appProperties?.bookingId, 'FM-TEST')
})

test('partial child creation recovers by booking identity without creating another client folder', async t => {
  const f = fixture(t); f.failNextChild('EDITED PHOTOS')
  await assert.rejects(f.drive.ensureShootHierarchy(f.input), /temporary/)
  const existing = f.folders.find(file => file.appProperties?.bookingId === 'FM-TEST')!
  const recovered = await f.drive.ensureShootHierarchy(f.input)
  assert.equal(recovered.client.id, existing.id)
  assert.equal(f.folders.filter(file => file.appProperties?.bookingId === 'FM-TEST').length, 1)
})

test('missing or trashed same-root clients are replaceable; permission and server failures are not', async t => {
  const f = fixture(t); const input = { ...f.input, existingRootFolderId: 'new-root' }
  for (const status of [403, 429, 500]) {
    f.errors.set(input.existingClientFolderId, status)
    await assert.rejects(f.drive.ensureShootHierarchy(input), /Synthetic Drive failure/)
    assert.equal(f.folders.some(file => file.appProperties?.bookingId === 'FM-TEST'), false)
  }
  f.errors.delete(input.existingClientFolderId)
  const result = await f.drive.ensureShootHierarchy(input)
  const same = await f.drive.ensureShootHierarchy({ ...input, existingClientFolderId: result.client.id })
  assert.equal(result.client.id, same.client.id)
  f.folders.find(file => file.id === result.client.id)!.trashed = true
  const replacement = await f.drive.ensureShootHierarchy({ ...input, existingClientFolderId: result.client.id })
  assert.notEqual(replacement.client.id, result.client.id)
})

test('same-name unmanaged folder is never adopted for another booking', async t => {
  const f = fixture(t)
  const first = await f.drive.ensureShootHierarchy(f.input)
  const second = await f.drive.ensureShootHierarchy({ ...f.input, bookingId: 'FM-OTHER' })
  assert.notEqual(first.client.id, second.client.id)
  assert.equal(second.client.name, 'SYNTHETIC CLIENT - FM-OTHER')
})

test('missing configured root fails with a solution and no writes; explicit Create New Root is genuinely new', async t => {
  const f = fixture(t)
  f.errors.set('new-root', 404)
  await assert.rejects(f.drive.ensureShootHierarchy(f.input), /Try: verify the root/)
  assert.equal(f.calls.some(call => call.method !== 'GET'), false)
  f.errors.clear()
  const created = await f.drive.initializeDriveRootFolder(f.db as never, { forceNew: true })
  assert.notEqual(created.id, 'new-root')
  assert.equal(f.db.tables.google_drive_settings[0].root_folder_id, created.id)
  assert.ok(f.folders.some(file => file.id === 'new-root'), 'Old root remains untouched')
})

const hierarchy = Object.fromEntries(['root', 'month', 'day', 'client', 'raw', 'selected', 'edited', 'deliverables'].map(name => [name, { id: 'new-' + name, name, parents: ['parent'] }])) as unknown as Parameters<typeof saveShootFolderMappings>[3]
function mappingDb(fail?: (table: string, action: string) => boolean) {
  return memoryDb({
    google_drive_settings: [{ id: 1, workspace_id: 'studio', root_folder_id: 'new-root' }],
    drive_folders: [
      { id: 'old-map', workspace_id: 'studio', booking_id: 'FM-TEST', folder_type: 'RAW', drive_folder_id: 'old-raw', batch_id: 'batch' },
      { id: 'other', workspace_id: 'other', booking_id: 'FM-TEST', folder_type: 'RAW', drive_folder_id: 'other-raw' },
      { id: 'other-client', workspace_id: 'studio', booking_id: 'FM-OTHER', folder_type: 'RAW', drive_folder_id: 'client-raw' },
    ], editing_batches: [{ id: 'batch', workspace_id: 'studio', drive_day_folder_id: 'old-day' }],
  }, fail)
}

test('folder mappings publish before retiring stale destinations, are repeat-safe, and preserve other bookings and all old records', async () => {
  const db = mappingDb()
  await saveShootFolderMappings(db as never, 'studio', 'FM-TEST', hierarchy)
  assert.equal(db.tables.drive_folders.find(row => row.id === 'old-map')?.booking_id, null)
  assert.equal(db.tables.drive_folders.find(row => row.id === 'other')?.booking_id, 'FM-TEST')
  assert.equal(db.tables.drive_folders.find(row => row.id === 'other-client')?.booking_id, 'FM-OTHER')
  assert.equal(db.tables.editing_batches[0].drive_day_folder_id, 'new-day')
  const links = db.tables.drive_folders.filter(row => row.workspace_id === 'studio' && row.booking_id === 'FM-TEST')
  assert.deepEqual(links.map(row => row.folder_type), ['CLIENT', 'RAW', 'SELECTED', 'EDITED', 'DELIVERABLES'])
  const writes = db.operations.filter(op => op.table === 'drive_folders' && op.action !== 'select')
  assert.deepEqual(writes.map(op => op.action), ['upsert', 'update'])
  const count = db.tables.drive_folders.length
  await saveShootFolderMappings(db as never, 'studio', 'FM-TEST', hierarchy)
  assert.equal(db.tables.drive_folders.length, count)
})

test('mapping read/save failures and concurrent root changes do not retire existing destinations', async () => {
  for (const action of ['select', 'upsert']) {
    const db = mappingDb((table, op) => table === 'drive_folders' && op === action)
    await assert.rejects(saveShootFolderMappings(db as never, 'studio', 'FM-TEST', hierarchy), /Try:/)
    assert.equal(db.tables.drive_folders[0].booking_id, 'FM-TEST')
  }
  const db = mappingDb(); db.tables.google_drive_settings[0].root_folder_id = 'newer-root'
  await assert.rejects(saveShootFolderMappings(db as never, 'studio', 'FM-TEST', hierarchy), /root changed/)
  assert.equal(db.operations.some(op => op.action !== 'select'), false)
})

test('provisioning a new client preserves the shared day batch link', async () => {
  const db = mappingDb()
  db.tables.drive_folders.push({ id: 'shared-day', workspace_id: 'studio', booking_id: null, folder_type: 'DAY', drive_folder_id: 'new-day', batch_id: 'batch' })
  await saveShootFolderMappings(db as never, 'studio', 'FM-NEW', hierarchy)
  assert.equal(db.tables.drive_folders.find(row => row.id === 'shared-day')?.batch_id, 'batch')
})

test('provisioning cannot report ACTIVE if new links fail to save, and preserves the existing portal', async () => {
  const db = mappingDb()
  db.tables.bookings = [{ id: 'FM-TEST', workspace_id: 'studio', package_id: 'grad', booking_date: '2026-09-08', customer_name: 'Synthetic', booking_status: 'Confirmed', price: 1200 }]
  db.tables.booking_provisioning = [{ id: 'provision', workspace_id: 'studio', booking_id: 'FM-TEST', status: 'PARTIAL_FAILURE', drive_root_folder_id: 'old-root', drive_client_folder_id: 'old-client' }]
  db.tables.client_portals = [{ id: 'portal', public_id: 'private-portal', booking_id: 'FM-TEST', status: 'active', expires_at: '2099-01-01' }]
  let requestedRoot = ''
  const workflow = loadTs<typeof import('../lib/booking-provisioning.ts')>('lib/booking-provisioning.ts', {
    '@/lib/supabase/admin': { getSupabaseAdmin: () => db }, '@/lib/booking-db': bookingDb,
    '@/lib/google-drive': { ensureShootHierarchy: async (input: { existingRootFolderId: string }) => { requestedRoot = input.existingRootFolderId; return hierarchy } },
    '@/lib/drive-folder-mappings': { saveShootFolderMappings: async () => { throw new Error('Synthetic mapping error') } },
    '@/lib/client-portal': { portalUrl: () => 'https://example.test/private' },
    '@/lib/portal-expiry': { hasPortalExpired: () => false },
    '@/lib/portal-email': { sendPortalAccessIfNeeded: async () => null },
    '@/lib/package-workflow-server': { packageUsesGraduationWorkflow: async () => true, assertGraduationBooking: async () => {} },
  })
  const result = await workflow.provisionBookingResources('FM-TEST')
  assert.equal(requestedRoot, 'old-root')
  assert.equal(result?.status, 'PARTIAL_FAILURE')
  assert.match(result?.lastError || '', /Try:/)
  assert.equal(result?.driveRootFolderId, 'old-root')
  assert.equal(db.tables.client_portals.length, 1)
  assert.equal(db.tables.client_portals[0].public_id, 'private-portal')
})
