import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchEditorBatches, getCachedEditorBatches, invalidateEditorBatchCache } from '../lib/editor-read-cache.ts'
import { assertEditorReadMetadata } from '../lib/editor-read-validation.ts'

// ER-6: a successful-but-malformed response is not an authoritative empty collection.
test('editor batch reads reject malformed JSON/shape and retain an authoritative cached snapshot', async context => {
  const previousFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = previousFetch; invalidateEditorBatchCache(true) })
  invalidateEditorBatchCache(true)
  globalThis.fetch = async () => Response.json([])
  const validEmpty = await fetchEditorBatches({ force: true })
  assert.deepEqual(validEmpty, [])
  globalThis.fetch = async () => Response.json({ unexpected: 'not an array' })
  await assert.rejects(fetchEditorBatches({ force: true }), /could not be loaded|unavailable|invalid/i)
  assert.equal(getCachedEditorBatches(), validEmpty)
  globalThis.fetch = async () => new Response('not JSON', { status: 200 })
  await assert.rejects(fetchEditorBatches({ force: true }))
  assert.equal(getCachedEditorBatches(), validEmpty)
})

test('editor metadata validation preserves genuine empty API shapes and rejects incomplete success bodies', () => {
  const zeroCounts = { waitingForSelection: 0, readyForEditing: 0, downloaded: 0, editing: 0,
    readyToUpload: 0, uploading: 0, delivered: 0, failed: 0 }
  assert.doesNotThrow(() => assertEditorReadMetadata({ shootDate: '2026-10-01', batch: null }, 'onsite'))
  assert.doesNotThrow(() => assertEditorReadMetadata([], 'batches'))
  assert.doesNotThrow(() => assertEditorReadMetadata([], 'uploads'))
  assert.doesNotThrow(() => assertEditorReadMetadata({ id: 'synthetic-batch', shootDate: '2026-10-01',
    totalClients: 0, totalSelectedPhotos: 0, counts: zeroCounts, jobs: [], auditLogs: [] }, 'batch'))
  for (const kind of ['onsite', 'batches', 'uploads', 'batch'] as const) {
    assert.throws(() => assertEditorReadMetadata({ unexpected: true }, kind), /could not be loaded/)
  }
})
