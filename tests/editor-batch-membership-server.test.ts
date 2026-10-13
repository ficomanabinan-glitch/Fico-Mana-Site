import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import * as membership from '../lib/editor-batch-membership.ts'
import * as packageRules from '../lib/package-workflow.ts'

type Row = Record<string, unknown>
const workspaceId = 'workspace-test'
const batchId = 'batch-test'
const names = ['Juliah', 'Patricia', 'Alexis', 'Maja', 'Christian']
function fixtures() {
  return {
    editing_batches: [{ id: batchId, workspace_id: workspaceId, display_id: 'FM-BATCH-TEST', shoot_date: '2026-10-04' }],
    bookings: names.map((customer_name, index) => ({ id: `booking-${index}`, workspace_id: workspaceId,
      client_id: `client-${index}`, customer_name, package_id: 'grad', booking_status: 'Confirmed' })),
    editing_jobs: names.map((_, index) => ({ id: `job-${index}`, workspace_id: workspaceId, batch_id: batchId,
      booking_id: `booking-${index}`, client_id: `client-${index}`, status: 'DOWNLOADED' })),
    gallery_files: names.slice(0, 3).map((_, index) => ({ id: `raw-${index}`, workspace_id: workspaceId,
      booking_id: `booking-${index}`, storage_status: 'available' })),
    photo_selections: [], onsite: [],
  } as Record<string, Row[]>
}
function server(tables: Record<string, Row[]>, failTable?: string) {
  const writes: string[] = []
  const reads: string[] = []
  const admin = { from(table: string) {
    let rows = [...(tables[table] || [])]
    let ranged = false
    const query = {
      select() { return query }, eq(key: string, value: unknown) { rows = rows.filter(row => key.split('.').reduce<unknown>((current, part) => (current as Row | undefined)?.[part], row) === value); return query },
      in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query },
      order(key: string) {
        assert.ok(!(key === 'id' && ['photo_selection_items', 'booking_provisioning'].includes(table)), 'Use the actual table primary key')
        rows.sort((a, b) => String(a[key]).localeCompare(String(b[key]))); return query
      },
      range(from: number, to: number) { ranged = true; rows = rows.slice(from, to + 1); return query },
      limit(count: number) { rows = rows.slice(0, count); return query },
      insert(value: Row | Row[]) { writes.push(table); rows = (Array.isArray(value) ? value : [value]).map(row => ({ id: 'synthetic-write', ...row })); tables[table] = [...(tables[table] || []), ...rows]; return query },
      update() { writes.push(table); return query },
      maybeSingle() { reads.push(table); return Promise.resolve({ data: rows[0] || null, error: null }) },
      single() { reads.push(table); return Promise.resolve({ data: rows[0] || null, error: null }) },
      then(resolve: (result: { data: Row[]; error: { message: string } | null }) => unknown) {
        reads.push(table); return Promise.resolve({ data: ranged ? rows : rows.slice(0, 1000), error: table === failTable ? { message: 'Synthetic read failure' } : null }).then(resolve)
      },
    }
    return query
  } }
  const source = readFileSync('lib/editor-workflow.ts', 'utf8')
  const stubs: Record<string, unknown> = {}
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) if (!match[1].startsWith('node:')) stubs[match[1]] = {}
  stubs['@/lib/supabase/admin'] = { getSupabaseAdmin: () => admin }
  stubs['@/lib/editor-batch-membership'] = membership
  stubs['@/lib/security/audit-metadata'] = { safeMetadata: (value: unknown) => value }
  stubs['@/lib/print-manifest'] = loadTs('lib/print-manifest.ts', { '@/lib/package-workflow': packageRules })
  stubs['@/lib/package-workflow-server'] = { graduationPackageIds: async () => ['grad'], onsitePackageIds: async () => [],
    graduationBookingIds: async (_admin: unknown, _workspace: unknown, ids: string[]) => new Set(ids) }
  return { workflow: loadTs<typeof import('../lib/editor-workflow.ts')>('lib/editor-workflow.ts', stubs), writes, reads }
}
const candidates = names.map((_, index) => ({ bookingId: `booking-${index}`, clientId: `client-${index}`, expectedFiles: 5 }))

test('authoritative membership preserves five jobs when only three have visible RAW', async () => {
  const { workflow } = server(fixtures())
  const batches = await workflow.getBatchList(workspaceId, { synchronize: false })
  assert.equal(batches[0].totalClients, 5)
  assert.equal((await workflow.getBatchDetail(workspaceId, 'FM-BATCH-TEST', { synchronize: false }))?.jobs.length, 5)
  const result = await workflow.preflightBatchUpload(workspaceId, 'FM-BATCH-TEST', candidates)
  assert.equal(result.readyClients, 5)
  assert.deepEqual(result.clients.map(row => row.customerName), names)
})

test('preflight checks cancellation, delivery, reassignment and client tampering independently', async () => {
  const tables = fixtures()
  tables.bookings[0].booking_status = 'Cancelled'
  tables.editing_jobs[1].status = 'DELIVERED'
  tables.editing_jobs[2].batch_id = 'another-batch'
  tables.editing_jobs[3].status = 'UPLOADING'
  const { workflow, writes } = server(tables)
  const requested = candidates.map(row => ({ ...row }))
  requested[4].clientId = 'tampered'
  const result = await workflow.preflightBatchUpload(workspaceId, 'FM-BATCH-TEST', requested)
  assert.deepEqual(result.clients.map(row => row.status), ['ATTENTION', 'DELIVERED', 'OTHER_BATCH', 'UPLOADING', 'INVALID'])
  await assert.rejects(workflow.createBatchUploadRun(workspaceId, 'FM-BATCH-TEST', requested, 'actor'), /cancelled/)
  assert.deepEqual(writes, [])
  assert.equal((await workflow.preflightBatchUpload(workspaceId, 'FM-BATCH-TEST', candidates, 'other-workspace')).clients[0].status, 'INVALID')
})

test('a capped global RAW listing cannot hide clients with existing RAW beyond row 1,000', async () => {
  const tables = fixtures()
  tables.gallery_files = [
    ...tables.gallery_files,
    ...Array.from({ length: 1000 }, (_, index) => ({ id: `other-${index}`, booking_id: 'another-booking', workspace_id: workspaceId, storage_status: 'available' })),
    ...[3, 4].map(index => ({ id: `raw-${index}`, workspace_id: workspaceId, booking_id: `booking-${index}`, storage_status: 'available' })),
  ]
  const { workflow } = server(tables)
  assert.equal((await workflow.getBatchList(workspaceId, { synchronize: false }))[0].totalClients, 5)
  assert.equal((await workflow.preflightBatchUpload(workspaceId, 'FM-BATCH-TEST', candidates)).readyClients, 5)
})

test('missing records and duplicate manifest rows never authorize uploads; selected valid subset remains ready', async () => {
  const tables = fixtures()
  tables.bookings.pop()
  const { workflow } = server(tables)
  const result = await workflow.preflightBatchUpload(workspaceId, 'FM-BATCH-TEST', [...candidates, candidates[0]])
  assert.equal(result.clients[0].status, 'INVALID')
  assert.equal(result.clients[4].status, 'MISSING')
  assert.equal((await workflow.preflightBatchUpload(workspaceId, 'FM-BATCH-TEST', [candidates[1]])).readyClients, 1)
})

test('paginated membership reads retain all 1,005 jobs and fail closed on a page error', async () => {
  const tables = fixtures()
  tables.editing_jobs = Array.from({ length: 1005 }, (_, index) => ({ ...tables.editing_jobs[0], id: `job-${String(index).padStart(4, '0')}`, booking_id: `booking-${index}` }))
  const { workflow } = server(tables)
  assert.equal((await workflow.getBatchList(workspaceId, { synchronize: false }))[0].totalClients, 1005)
  let calls = 0
  await assert.rejects(membership.readEditorRows(async () => {
    calls++
    return calls === 1 ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null } : { data: null, error: { message: 'Page failed' } }
  }), /Page failed/)
  await assert.rejects(server(tables, 'editing_jobs').workflow.getBatchList(workspaceId, { synchronize: false }), /Synthetic read failure/)
  await assert.rejects(membership.readEditorRows(async () => ({ data: null, error: null })), /incomplete/)
  const lowerCapRows = Array.from({ length: 325 }, (_, id) => ({ id }))
  assert.deepEqual(await membership.readEditorRows(async (from, to) => ({ data: lowerCapRows.slice(from, Math.min(to + 1, from + 100)), error: null })), lowerCapRows)
})

test('batch reads wait for synchronization before loading authoritative membership', async () => {
  const { workflow, reads } = server(fixtures())
  await workflow.getBatchList(workspaceId)
  // Sync reads selections/gallery; list must read its bookings/jobs only afterward.
  assert.ok(reads.lastIndexOf('bookings') > reads.indexOf('gallery_files'))
  assert.ok(reads.lastIndexOf('editing_jobs') > reads.indexOf('gallery_files'))
})

test('a valid selected subset creates only its own upload item', async () => {
  const tables = fixtures()
  tables.bookings[0].booking_status = 'Cancelled'
  const { workflow } = server(tables)
  const result = await workflow.createBatchUploadRun(workspaceId, 'FM-BATCH-TEST', [candidates[1]], 'actor')
  assert.equal(result.uploadJobId, 'synthetic-write')
  assert.deepEqual(tables.batch_upload_items.map(row => row.booking_id), ['booking-1'])
  assert.equal(tables.batch_upload_jobs[0].total_clients, 1)
})

test('session, file confirmation and finalization reject cancellation, reassignment, identity changes and delivery after upload start', async () => {
  for (const scenario of ['cancelled', 'reassigned', 'identity', 'delivered']) {
  const tables = fixtures()
  if (scenario === 'cancelled') tables.bookings[0].booking_status = 'Cancelled'
  if (scenario === 'reassigned') tables.editing_jobs[0].batch_id = 'other-batch'
  if (scenario === 'identity') tables.bookings[0].client_id = 'new-client'
  if (scenario === 'delivered') tables.bookings[0].edited_photo_delivered_at = '2026-10-13T00:00:00Z'
  tables.batch_upload_jobs = [{ id: 'upload-run', workspace_id: workspaceId, batch_id: batchId, status: 'RUNNING' }]
  tables.batch_upload_items = [{ id: 'upload-item', upload_job_id: 'upload-run', booking_id: 'booking-0',
    editing_job_id: 'job-0', editing_jobs: tables.editing_jobs[0] }]
  tables.batch_upload_files = [{ id: 'upload-file', batch_upload_items: tables.batch_upload_items[0] }]
  const { workflow, writes } = server(tables)
  await assert.rejects(workflow.createDeliverableUploadSession(workspaceId, 'FM-BATCH-TEST', 'upload-run', {
    bookingId: 'booking-0', relativePath: 'EDITED/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 100, checksum: 'a'.repeat(64),
  }), /cancelled|another batch|identity changed|already been delivered|not part of this batch run/)
  await assert.rejects(workflow.completeDeliverableUpload(workspaceId, 'upload-run', 'upload-file', { storageKey: 'never-read', mimeType: 'image/jpeg' }), /cancelled|another batch|identity changed|already been delivered/)
  await assert.rejects(workflow.finalizeClientUpload(workspaceId, 'FM-BATCH-TEST', 'upload-run', 'booking-0', 'actor'), /cancelled|another batch|identity changed|already been delivered|state not found/)
  assert.deepEqual(writes, [])
  }
})

function selectedFixtures() {
  const tables = fixtures()
  tables.packages = [{ id: 'grad', category: 'capping-pinning' }]
  tables.photo_selections = names.map((_, index) => ({ id: `selection-${index}`, booking_id: `booking-${index}`, workspace_id: workspaceId }))
  tables.gallery_files = names.map((_, index) => ({ id: `raw-${index}`, booking_id: `booking-${index}`, workspace_id: workspaceId,
    file_name: `source-${index}.jpg`, storage_key: `private-source-${index}`, storage_status: 'available' }))
  tables.photo_selection_items = names.map((_, index) => ({ selection_id: `selection-${index}`, gallery_file_id: `raw-${index}` }))
  tables.print_allocations = names.flatMap((_, index) => ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R'].map(category => ({
    id: `print-${index}-${category}`, workspace_id: workspaceId, booking_id: `booking-${index}`, selection_id: `selection-${index}`,
    gallery_file_id: `raw-${index}`, category, quantity: 1,
  })))
  return tables
}

test('download uses shared active membership and preserves version-one per-client print instructions', async () => {
  const tables = selectedFixtures()
  tables.bookings[0].booking_status = 'Cancelled'
  const { workflow } = server(tables)
  const result = await workflow.prepareBatchDownload(workspaceId, 'FM-BATCH-TEST', 'actor')
  assert.equal(result.manifest.schema_version, 1)
  assert.equal(result.manifest.clients.length, 4)
  assert.ok(result.manifest.clients.every(client => client.booking_id !== 'booking-0' && client.print_manifest?.outputs.length === 3))
  assert.equal(result.entries.filter(entry => entry.storageKey).length, 4)
  assert.equal((await workflow.getBatchList(workspaceId, { synchronize: false }))[0].downloadEligibleClients, 4)
})

test('missing, cross-client or failed selected-source reads cannot produce an incomplete download manifest', async () => {
  for (const scenario of ['missing', 'cross-client', 'read-failed', 'empty-selection']) {
    const tables = selectedFixtures()
    if (scenario === 'missing') tables.gallery_files.pop()
    if (scenario === 'cross-client') tables.gallery_files[0].booking_id = 'booking-1'
    if (scenario === 'empty-selection') tables.photo_selection_items.pop()
    const { workflow, writes } = server(tables, scenario === 'read-failed' ? 'photo_selection_items' : undefined)
    await assert.rejects(workflow.prepareBatchDownload(workspaceId, 'FM-BATCH-TEST', 'actor'), /selected source|Synthetic read failure/)
    assert.deepEqual(writes, [])
  }
})

test('failed final batch aggregation reads never publish COMPLETED', async () => {
  const tables = fixtures()
  tables.batch_upload_jobs = [{ id: 'upload-run', workspace_id: workspaceId, batch_id: batchId, status: 'RUNNING' }]
  tables.batch_upload_items = [{ id: 'upload-item', upload_job_id: 'upload-run', booking_id: 'booking-0', status: 'DELIVERED' }]
  const { workflow, writes } = server(tables, 'editing_jobs')
  await assert.rejects(workflow.finalizeBatchUpload(workspaceId, 'FM-BATCH-TEST', 'upload-run'), /Synthetic read failure/)
  assert.deepEqual(writes, [])
  assert.equal(tables.batch_upload_jobs[0].status, 'RUNNING')
})
