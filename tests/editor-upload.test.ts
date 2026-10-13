import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

type PickedUploadFile = { file: File; relativePath: string }
const { createUploadWork, detectBatchFolders, preflightDetectedBatch, uploadDetectedBatch } = loadTs<typeof import('../lib/editor-upload-client.ts')>(
  'lib/editor-upload-client.ts',
  { '@/lib/storage/browser-upload': { uploadWithPresignedPlan: async () => undefined } },
)

async function syntheticBatch(count = 5) {
  const clients = Array.from({ length: count }, (_, i) => ({ booking_id: `BOOK-${i}`, client_id: `client-${i}`, folder_name: `CLIENT ${i}`, customer_name: `Client ${i}`, expected_output_count: 1 }))
  const manifest = { schema_version: 1, batch_id: 'FM-BATCH-TEST', shoot_date: '2026-10-13', workspace_id: 'synthetic-workspace', clients }
  const [batch] = await detectBatchFolders([picked('batch/manifest.json', JSON.stringify(manifest)), ...clients.map((client) => picked(`batch/${client.folder_name}/SELECTED/EDITED/final.jpg`))])
  return batch
}

function apiResponse(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }) }

function serverRows(batch: Awaited<ReturnType<typeof syntheticBatch>>, statuses: string[]) {
  return { clients: batch.manifest.clients.map((client, index) => ({ bookingId: client.booking_id, customerName: client.customer_name, status: statuses[index] || 'READY', reason: statuses[index] === 'MISSING' ? 'No booking found.' : '', workflowStatus: 'EDITING' })) }
}

function picked(relativePath: string, contents = 'photo'): PickedUploadFile {
  return {
    file: new File([contents], relativePath.split('/').at(-1) || 'file.jpg', {
      type: relativePath.endsWith('.json') ? 'application/json' : 'image/jpeg',
    }),
    relativePath,
  }
}

test('detects trusted batch manifests inside a downloaded collection', async () => {
  const manifest = {
    schema_version: 1,
    batch_id: 'FM-BATCH-2026-09-06-MAIN',
    shoot_date: '2026-09-06',
    clients: [
      {
        booking_id: 'BOOK-100',
        client_id: 'client-100',
        folder_name: 'CLIENT ONE',
        customer_name: 'Client One',
        expected_output_count: 2,
      },
    ],
  }
  const files = [
    picked('collection/manifest.json', JSON.stringify({ schema_version: 1, batches: [manifest] })),
    picked('collection/2026-09-06/manifest.json', JSON.stringify(manifest)),
    picked('collection/2026-09-06/CLIENT ONE/EDITED/final-01.jpg'),
  ]
  const batches = await detectBatchFolders(files)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].manifest.batch_id, manifest.batch_id)
  assert.equal(batches[0].rootPath, 'collection/2026-09-06')
})

test('routes only files inside the client EDITED folder', async () => {
  const manifest = {
    schema_version: 1,
    batch_id: 'FM-BATCH-2026-09-06-MAIN',
    shoot_date: '2026-09-06',
    clients: [
      {
        booking_id: 'BOOK-100',
        client_id: 'client-100',
        folder_name: 'CLIENT ONE',
        customer_name: 'Client One',
        expected_output_count: 2,
      },
    ],
  }
  const files = [
    picked('batch/manifest.json', JSON.stringify(manifest)),
    picked('batch/CLIENT ONE/SELECTED/source-01.jpg'),
    picked('batch/CLIENT ONE/EDITED/final-01.jpg'),
    picked('batch/CLIENT ONE/SELECTED/EDITED/subfolder/final-02.jpg'),
    picked('batch/CLIENT ONE/Enhanced/ENHANCED - final-03.jpg'),
    picked('batch/CLIENT ONE/.fico-client.json', '{}'),
  ]
  const [batch] = await detectBatchFolders(files)
  const work = createUploadWork(batch, new Set(['BOOK-100']))
  assert.deepEqual(
    work[0].edited.map((item) => item.relativePath),
    ['EDITED/ENHANCED - final-01.jpg', 'EDITED/ENHANCED - final-03.jpg', 'EDITED/subfolder/ENHANCED - final-02.jpg'],
  )
  assert.equal(await work[0].edited[0].file.text(), 'photo', 'Renaming preserves image bytes')
  assert.equal(files[2].file.name, 'final-01.jpg', 'The original local file is unchanged')
})

test('preflight reconciles all five manifest clients even when two are absent from the batch detail', async (t) => {
  const batch = await syntheticBatch()
  const requests: Array<{ url: string; options?: RequestInit }> = []
  t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    requests.push({ url, options })
    return apiResponse(serverRows(batch, ['READY', 'DELIVERED', 'READY', 'MISSING', 'READY']))
  })
  const result = await preflightDetectedBatch(batch)
  assert.equal(result.totalClients, 5)
  assert.equal(result.readyClients, 3)
  assert.equal(result.clients[3].reason, 'No booking found.')
  assert.equal(requests[0].options?.cache, 'no-store')
  assert.match(requests[0].url, /\/preflight$/)
  assert.equal(JSON.parse(String(requests[0].options?.body)).clients.length, 5)
  assert.equal(JSON.parse(String(requests[0].options?.body)).workspaceId, 'synthetic-workspace')
})

test('one client with missing edited files needs attention without blocking another eligible client', async (t) => {
  const batch = await syntheticBatch(2)
  batch.files = batch.files.filter((file) => !file.relativePath.includes('CLIENT 0/'))
  t.mock.method(globalThis, 'fetch', async () => apiResponse(serverRows(batch, ['READY', 'READY'])))
  const checked = await preflightDetectedBatch(batch)
  assert.equal(checked.clients[0].status, 'ATTENTION')
  assert.match(checked.clients[0].reason, /No edited photos/)
  assert.equal(checked.readyClients, 1)
})

test('duplicate folder or client identity never routes files to either client', async () => {
  const batch = await syntheticBatch(2)
  batch.manifest.clients[1].client_id = batch.manifest.clients[0].client_id
  assert.deepEqual(createUploadWork(batch, new Set(['BOOK-0', 'BOOK-1'])), [])
})

test('exact batch root prevents files in nested unrelated client folders and traversal paths from uploading', async () => {
  const batch = await syntheticBatch(1)
  batch.files.push(picked('batch/unrelated/CLIENT 0/EDITED/wrong.jpg'), picked('batch/CLIENT 0/EDITED/../wrong.jpg'), picked('other/CLIENT 0/EDITED/wrong.jpg'))
  const work = createUploadWork(batch, new Set(['BOOK-0']))
  assert.equal(work[0].edited.length, 1)
  assert.equal(work[0].edited[0].file.name, 'ENHANCED - final.jpg')
})

test('ambiguous copies of the same batch require selecting one folder', async () => {
  const batch = await syntheticBatch(1)
  await assert.rejects(detectBatchFolders([...batch.files, picked('copy/manifest.json', JSON.stringify(batch.manifest))]), /More than one folder/)
})

test('unsupported manifest versions fail with a recovery message', async () => {
  const batch = await syntheticBatch(1)
  await assert.rejects(detectBatchFolders([picked('batch/manifest.json', JSON.stringify({ ...batch.manifest, schema_version: 2 }))]), /unsupported version/)
})

test('historical version-1 manifests may omit client and workspace IDs', async (t) => {
  const batch = await syntheticBatch(1)
  delete batch.manifest.workspace_id
  delete batch.manifest.clients[0].client_id
  t.mock.method(globalThis, 'fetch', async () => apiResponse(serverRows(batch, ['READY'])))
  assert.equal((await preflightDetectedBatch(batch)).readyClients, 1)
})

test('server response must reconcile every client and failures never fall back to browser data', async (t) => {
  const batch = await syntheticBatch(2)
  t.mock.method(globalThis, 'fetch', async () => apiResponse({ clients: [] }))
  await assert.rejects(preflightDetectedBatch(batch), /every client/)
})

test('invalid client metadata is reported individually while a valid peer remains eligible', async (t) => {
  const batch = await syntheticBatch(2)
  batch.manifest.clients[0].expected_output_count = -1
  t.mock.method(globalThis, 'fetch', async () => apiResponse(serverRows(batch, ['READY', 'READY'])))
  const result = await preflightDetectedBatch(batch)
  assert.equal(result.readyClients, 1)
  assert.equal(result.clients[0].status, 'ATTENTION')
  assert.match(result.clients[0].reason, /expected photo count/)
})

test('case-insensitive duplicate upload names require attention instead of silently overwriting', async (t) => {
  const batch = await syntheticBatch(1)
  batch.files.push(picked('batch/CLIENT 0/EDITED/FINAL.jpg'))
  t.mock.method(globalThis, 'fetch', async () => apiResponse(serverRows(batch, ['READY'])))
  const result = await preflightDetectedBatch(batch)
  assert.equal(result.readyClients, 0)
  assert.match(result.clients[0].reason, /same upload name/)
})

test('start rechecks server truth, skips delivered, and never includes newly eligible clients', async (t) => {
  const batch = await syntheticBatch(3)
  const urls: string[] = []
  const started: string[] = []
  const results: string[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, options?: RequestInit) => {
    urls.push(url)
    const body = options?.body ? JSON.parse(String(options.body)) : {}
    if (url.endsWith('/preflight')) return apiResponse(serverRows(batch, ['DELIVERED', 'READY', 'READY']))
    if (url.endsWith('/start-upload')) { started.push(...body.clients.map((client: { bookingId: string }) => client.bookingId)); return apiResponse({ uploadJobId: 'synthetic-job' }) }
    if (url.endsWith('/upload-session')) return apiResponse({ uploadFileId: 'synthetic-file', duplicate: true })
    if (url.endsWith('/finalize-client')) return apiResponse({ bookingId: body.bookingId, customerName: 'Client 1', status: 'DELIVERED', expected: 1, uploaded: 1 })
    if (url.endsWith('/finalize-upload')) return apiResponse({ completedClients: 1, failedClients: 0 })
    throw new Error(`Unexpected request ${url}`)
  })
  const outcome = await uploadDetectedBatch(batch, { confirmedBookingIds: ['BOOK-0', 'BOOK-1'], onProgress: () => undefined, onResult: (result) => results.push(result.bookingId) })
  assert.deepEqual(started, ['BOOK-1'])
  assert.deepEqual(results, ['BOOK-1'])
  assert.equal(outcome.skippedClients, 2)
  assert.ok(urls[0].endsWith('/preflight'))
})

test('all delivered clients cause no upload mutation and keep meaningful manifest totals', async (t) => {
  const batch = await syntheticBatch(2)
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests += 1
    assert.ok(url.endsWith('/preflight'))
    return apiResponse(serverRows(batch, ['DELIVERED', 'DELIVERED']))
  })
  const result = await uploadDetectedBatch(batch, { confirmedBookingIds: ['BOOK-0', 'BOOK-1'], onProgress: () => undefined })
  assert.equal(requests, 1)
  assert.equal(result.summary.totalClients, 2)
  assert.equal(result.skippedClients, 2)
})
