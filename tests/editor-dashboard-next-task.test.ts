import assert from 'node:assert/strict'
import test from 'node:test'
import { getEditorDashboardNextTask } from '../lib/editor-dashboard-next-task.ts'
import type { EditorBatchSummary } from '../lib/editor-read-cache.ts'

const counts = { waitingForSelection: 0, readyForEditing: 0, downloaded: 0, editing: 0, readyToUpload: 0, uploading: 0, delivered: 0, failed: 0 }
function batch(id: string, patch: Partial<typeof counts> = {}, shootDate = '2026-10-01'): EditorBatchSummary {
  return { id, shootDate, workspaceId: 'synthetic', locationKey: 'MAIN', status: 'READY', totalClients: 1, totalSelectedPhotos: 5, counts: { ...counts, ...patch }, clients: [], storageReady: true }
}
const facts = { today: '2026-10-01', capabilities: { edit: true, onsite: true }, jobs: [] }

// REQ-4: blockers precede normal production; actual batch identity stays in the destination.
test('failed upload is prioritized before approved downloads', () => {
  const next = getEditorDashboardNextTask({ ...facts, batches: [batch('download', { readyForEditing: 2 }), batch('failed batch', { failed: 1 })] })
  assert.equal(next?.label, 'Retry upload')
  assert.equal(next?.href, '/editor/upload?batch=failed%20batch&retry=1')
  assert.equal(next?.priority, 0)
})

test('approved download outranks routine onsite work and does not claim local edits are ready', () => {
  const next = getEditorDashboardNextTask({ ...facts, batches: [batch('approved', { readyForEditing: 2 })], jobs: [{ bookingId: 'FM-1', customerName: 'Synthetic Client', galleryCount: 0, storageReady: true }] })
  assert.equal(next?.downloadBatchId, 'approved')
  assert.equal(next?.label, 'Download batch ZIP')
})

test('equal-priority approved downloads choose the oldest shoot, not the largest count', () => {
  const next = getEditorDashboardNextTask({ ...facts, batches: [batch('newer', { readyForEditing: 1 }), batch('older', { readyForEditing: 12 }, '2026-09-30')] })
  assert.equal(next?.downloadBatchId, 'older')
})

test('onsite-only capability never receives an editing or retry-upload recommendation', () => {
  const next = getEditorDashboardNextTask({ ...facts, capabilities: { edit: false, onsite: true }, batches: [batch('failed', { failed: 2 })], jobs: [{ bookingId: 'FM-1', customerName: 'Synthetic Client', galleryCount: 0, storageReady: true }] })
  assert.equal(next?.href, '/editor/onsite?date=2026-10-01&booking=FM-1')
})

test('uploaded originals and unknown storage do not become new onsite upload recommendations', () => {
  assert.equal(getEditorDashboardNextTask({ ...facts, batches: [], jobs: [{ bookingId: 'FM-1', customerName: 'Synthetic Client', galleryCount: 5, storageReady: true }, { bookingId: 'FM-2', customerName: 'Synthetic Client Two', galleryCount: 0 }] }), null)
})

// REQ-5: unavailable and empty evidence are separate states.
test('unavailable work becomes a refresh task rather than a guessed production action', () => {
  const next = getEditorDashboardNextTask({ ...facts, unavailable: true, batches: [batch('approved', { readyForEditing: 2 })] })
  assert.equal(next?.retry, true)
  assert.equal(next?.href, undefined)
  assert.equal(next?.downloadBatchId, undefined)
})

test('waiting and uploading explain only the known dependency, not an editing approval or delivery', () => {
  assert.equal(getEditorDashboardNextTask({ ...facts, batches: [batch('waiting', { waitingForSelection: 1 })] })?.title, 'Waiting for client choices')
  assert.equal(getEditorDashboardNextTask({ ...facts, batches: [batch('uploading', { uploading: 1 })] })?.title, 'Uploads are in progress')
})
test('delivered and empty summaries do not invent a completed next task or client download', () => {
  for (const patch of [{}, { delivered: 1 }]) {
    assert.equal(getEditorDashboardNextTask({ ...facts, batches: [batch('no-known-action', patch)] }), null)
  }
})
