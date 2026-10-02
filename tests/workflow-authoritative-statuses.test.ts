import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveWorkflowNextAction } from '../lib/workflow-next-action.ts'

const active = { bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit', usesSelectionWorkflow: true }

test('every persisted EditingJobStatus maps to a supported staff or client action', () => {
  const cases = [
    ['WAITING_FOR_SELECTION', 'await-selection', 'portalManagement'],
    ['READY_FOR_EDITING', 'edit', 'batch'],
    ['DOWNLOADED', 'editing', 'batch'],
    ['EDITING', 'editing', 'batch'],
    ['READY_TO_UPLOAD', 'upload', 'upload'],
    ['UPLOADING', 'upload', 'upload'],
    ['DELIVERED', 'delivered', 'portalManagement'],
    ['UPLOAD_FAILED', 'upload-error', 'retryUpload'],
  ] as const
  for (const [status, actionId, target] of cases) {
    const action = deriveWorkflowNextAction({ ...active, productionStatus: status, rawCount: 5, selectionStatus: status === 'WAITING_FOR_SELECTION' ? 'OPEN' : undefined })
    assert.equal(action.id, actionId, status)
    assert.equal(action.target, target, status)
  }
})

test('approval and submission records distinguish staff review editing and failed finalization', () => {
  assert.equal(deriveWorkflowNextAction({ ...active, selectionStatus: 'SUBMITTED', reviewStatus: 'Pending Review' }).id, 'review')
  assert.equal(deriveWorkflowNextAction({ ...active, selectionStatus: 'SUBMITTED', reviewStatus: 'Approved', productionStatus: 'READY_FOR_EDITING' }).id, 'edit')
  assert.equal(deriveWorkflowNextAction({ ...active, selectionStatus: 'COPY_FAILED' }).id, 'selection-copy-failed')
  assert.equal(deriveWorkflowNextAction({ ...active, selectionStatus: 'SUBMITTING' }).id, 'selection-submitting')
  assert.equal(deriveWorkflowNextAction({ ...active, reviewStatus: 'Rejected', selectionStatus: 'OPEN' }).id, 'selection-rejected')
  assert.equal(deriveWorkflowNextAction({ ...active, reviewStatus: 'Reopened', selectionStatus: 'OPEN', rawCount: 5 }).id, 'await-selection')
})

test('authoritative download-only category suppresses old selection and editing markers', () => {
  for (const status of ['READY_FOR_EDITING', 'READY_TO_UPLOAD', 'UPLOAD_FAILED', 'DELIVERED', 'EDITING']) {
    const action = deriveWorkflowNextAction({ ...active, usesSelectionWorkflow: false, productionStatus: status, rawStatus: 'Approved', selectionStatus: 'SUBMITTED', rawCount: 10 })
    assert.equal(action.id, 'download-only', status)
  }
  assert.equal(deriveWorkflowNextAction({ ...active, usesSelectionWorkflow: false, storageFailed: true, rawCount: 10 }).id, 'storage-error')
  assert.equal(deriveWorkflowNextAction({ ...active, usesSelectionWorkflow: false, pendingDownloadRequests: 1, rawCount: 10 }).id, 'download-request')
})

test('persisted production blockers stay actionable when a shoot date has been moved into the future', () => {
  const upcoming = { ...active, shootDate: '2026-11-10', today: '2026-10-01' }
  assert.equal(deriveWorkflowNextAction({ ...upcoming, selectionStatus: 'COPY_FAILED' }).id, 'selection-copy-failed')
  assert.equal(deriveWorkflowNextAction({ ...upcoming, productionStatus: 'READY_FOR_EDITING' }).id, 'edit')
  assert.equal(deriveWorkflowNextAction({ ...upcoming, productionStatus: 'READY_TO_UPLOAD' }).id, 'upload')
  assert.equal(deriveWorkflowNextAction(upcoming).id, 'scheduled')
})

test('missing source data stays unknown and incomplete sessions never imply final delivery', () => {
  assert.equal(deriveWorkflowNextAction({ ...active, detailsUnavailable: true }).id, 'unknown')
  assert.equal(deriveWorkflowNextAction({ ...active, bookingStatus: 'Completed', today: '2026-10-01', shootDate: '2026-10-01', rawCount: null }).id, 'raw-upload')
  assert.equal(deriveWorkflowNextAction({ ...active, productionStatus: 'UPLOAD_FAILED', storageFailed: true }).id, 'storage-error')
  assert.equal(deriveWorkflowNextAction({ ...active, bookingStatus: 'Cancelled', storageFailed: true }).id, 'closed')
})
