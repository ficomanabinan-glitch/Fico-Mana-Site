import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createUploadWork,
  detectBatchFolders,
  type PickedUploadFile,
} from '../lib/editor-upload-client.ts'

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
    picked('batch/CLIENT ONE/EDITED/subfolder/final-02.jpg'),
    picked('batch/CLIENT ONE/.fico-client.json', '{}'),
  ]
  const [batch] = await detectBatchFolders(files)
  const work = createUploadWork(batch, new Set(['BOOK-100']))
  assert.deepEqual(
    work[0].edited.map((item) => item.relativePath),
    ['EDITED/final-01.jpg', 'EDITED/subfolder/final-02.jpg'],
  )
})
