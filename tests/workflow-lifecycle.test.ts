import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveWorkflowLifecycle, type WorkflowFacts } from '../lib/workflow-next-action.ts'

/**
 * Source: bounded lifecycle request, 2026-10-01; AI test-generation/unit-testing guidance v2.
 * Requirements / coverage / oracles, established before implementation:
 * R1 nine stable labels: SC1 empty and fully recorded facts -> exact IDs/labels/statuses.
 * R2 independent evidence: SC2 delivery-only and past date -> every earlier stage unknown.
 * R3 exact counts: SC3 positive/zero/null/invalid -> recorded/waiting/unknown, never delivery.
 * R4 selection/review: SC4 persisted states and reopened approval -> direct recorded or waiting.
 * R5 download-only: SC5 stale selection/job facts -> choices/review/editing/upload not-required, no inferred delivery.
 * R6 production markers: SC6 direct editing vs later upload/delivery -> no inferred editing history.
 * R7 verified deposit/shoot: SC7 pending/refunded/missing and explicit shoot flag -> separate stages.
 * Invariants: no mutation, no external calls, deterministic output, no inferred earlier completion.
 * Primary risks: missing lazy details represented as false, stale reopened approvals, zero/unknown counts.
 * Assumption: recorded means evidence is present, not that all expected work or client downloads finished.
 * Parent/owner review remains required before merge; tests assert public output rather than internals.
 */
const stage = (facts: WorkflowFacts, id: string) => deriveWorkflowLifecycle(facts).find(value => value.id === id)!

test('lifecycle returns nine stable named stages and missing facts remain unknown', () => {
  const result = deriveWorkflowLifecycle({})
  assert.deepEqual(result.map(value => [value.id, value.label]), [
    ['booking', 'Booking'], ['deposit', 'Deposit'], ['shoot', 'Shoot'], ['originals', 'Originals'],
    ['choices', 'Client choices'], ['review', 'Staff review'], ['editing', 'Editing'],
    ['upload', 'Enhanced upload'], ['delivery', 'Delivery'],
  ])
  assert.ok(result.every(value => value.status === 'unknown' && value.detail.length > 0))
})

test('direct recorded facts describe each stage without mutating the facts', () => {
  const facts = Object.freeze({ bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit', shootRecorded: true,
    rawCount: 120, selectionSubmitted: true, selectionApproved: true, productionStatus: 'EDITING', enhancedCount: 5, delivered: true })
  const result = deriveWorkflowLifecycle(facts)
  assert.ok(result.every(value => value.status === 'recorded'))
  assert.match(stage(facts, 'editing').detail, /marked EDITING/)
  assert.match(stage(facts, 'delivery').detail, /does not confirm that the client downloaded/)
  assert.deepEqual(deriveWorkflowLifecycle(facts), result)
})

test('delivery and elapsed calendar dates do not fill in missing earlier lifecycle evidence', () => {
  const result = deriveWorkflowLifecycle({ productionStatus: 'DELIVERED', shootDate: '2026-09-01', today: '2026-10-01' })
  assert.equal(result.find(value => value.id === 'delivery')?.status, 'recorded')
  assert.ok(result.filter(value => value.id !== 'delivery').every(value => value.status === 'unknown'))
  assert.equal(stage({ bookingStatus: 'Completed' }, 'shoot').status, 'unknown')
  assert.equal(stage({ productionStatus: 'READY_FOR_EDITING' }, 'review').status, 'unknown')
})

test('exact available-file counts distinguish zero from unknown without claiming final release', () => {
  for (const id of ['originals', 'upload']) {
    const key = id === 'originals' ? 'rawCount' : 'enhancedCount'
    for (const count of [undefined, null, -1, Number.NaN, Infinity, 1.5]) assert.equal(stage({ [key]: count }, id).status, 'unknown', `${id}: ${count}`)
    assert.equal(stage({ [key]: 0 }, id).status, 'waiting')
    assert.equal(stage({ [key]: 1 }, id).status, 'recorded')
    assert.match(stage({ [key]: 120 }, id).detail, /120 available files are indexed/)
  }
  assert.equal(stage({ enhancedCount: 10 }, 'delivery').status, 'unknown')
  assert.equal(stage({ enhancedCount: 10, delivered: false }, 'delivery').status, 'waiting')
  assert.match(stage({ enhancedCount: 2, productionStatus: 'UPLOAD_FAILED' }, 'upload').detail, /do not prove a complete upload/)
})

test('client submissions and review decisions are separate and reopened reviews stay waiting', () => {
  for (const status of ['SUBMITTED', 'COPY_FAILED']) assert.equal(stage({ selectionStatus: status }, 'choices').status, 'recorded')
  for (const status of ['OPEN', 'SUBMITTING']) assert.equal(stage({ selectionStatus: status }, 'choices').status, 'waiting')
  assert.equal(stage({ selectionStatus: 'OPEN', selectionSubmitted: true }, 'choices').status, 'waiting')
  assert.match(stage({ selectionStatus: 'COPY_FAILED' }, 'choices').detail, /preparation failed/)
  assert.equal(stage({ selectionStatus: 'SUBMITTED' }, 'review').status, 'unknown')
  assert.equal(stage({ reviewStatus: 'Approved' }, 'choices').status, 'unknown')
  assert.equal(stage({ reviewStatus: 'Approved' }, 'review').status, 'recorded')
  for (const status of ['Pending Review', 'Rejected', 'Reopened']) assert.equal(stage({ reviewStatus: status, selectionApproved: status === 'Reopened' }, 'review').status, 'waiting')
  assert.equal(stage({ rawStatus: 'Approved' }, 'review').status, 'recorded')
})

test('download-only packages do not require choices review or editing even with stale production markers', () => {
  const facts = { usesSelectionWorkflow: false, selectionSubmitted: true, selectionApproved: true,
    selectionStatus: 'SUBMITTED', reviewStatus: 'Approved', productionStatus: 'DELIVERED', rawCount: 30 }
  const result = deriveWorkflowLifecycle(facts)
  assert.deepEqual(result.filter(value => value.status === 'not-required').map(value => value.id), ['choices', 'review', 'editing', 'upload'])
  assert.equal(stage(facts, 'delivery').status, 'unknown')
  assert.equal(stage({ ...facts, delivered: true }, 'delivery').status, 'recorded')
  assert.equal(stage({ usesSelectionWorkflow: null }, 'choices').status, 'unknown')
})

test('raw-only enhanced-upload exemption describes original delivery without confirming final release', () => {
  for (const count of [undefined, null, 0, 5]) {
    const facts = { usesSelectionWorkflow: false, enhancedCount: count, uploadFailed: true, productionStatus: 'UPLOAD_FAILED' }
    const upload = stage(facts, 'upload')
    assert.equal(upload.status, 'not-required')
    assert.match(upload.detail, /original-photo delivery/)
    assert.match(upload.detail, /Final release is checked separately/)
    assert.equal(stage(facts, 'delivery').status, 'unknown')
    assert.equal(stage({ ...facts, delivered: false }, 'delivery').status, 'waiting')
    assert.equal(stage({ ...facts, delivered: true }, 'delivery').status, 'recorded')
  }
  assert.equal(stage({ usesSelectionWorkflow: true, enhancedCount: 0 }, 'upload').status, 'waiting')
  assert.equal(stage({ usesSelectionWorkflow: null, enhancedCount: 0 }, 'upload').status, 'waiting')
})

test('editing and enhanced-upload markers do not backfill each other', () => {
  for (const status of ['WAITING_FOR_SELECTION', 'READY_FOR_EDITING', 'DOWNLOADED']) assert.equal(stage({ productionStatus: status }, 'editing').status, 'waiting')
  for (const status of ['EDITING', 'READY_TO_UPLOAD']) assert.equal(stage({ productionStatus: status }, 'editing').status, 'recorded')
  for (const status of ['UPLOADING', 'UPLOAD_FAILED', 'DELIVERED']) assert.equal(stage({ productionStatus: status }, 'editing').status, 'unknown')
  assert.equal(stage({ productionStatus: 'DELIVERED' }, 'upload').status, 'unknown')
  assert.match(stage({ productionStatus: 'UPLOADING', enhancedCount: 0 }, 'upload').detail, /in progress/)
  assert.match(stage({ productionStatus: 'UPLOAD_FAILED', enhancedCount: 0 }, 'upload').detail, /reported a failure/)
})

test('deposit verification and explicit shoot records stay independent from booking status', () => {
  for (const status of ['Paid Deposit', 'Paid Full']) assert.equal(stage({ paymentStatus: status }, 'deposit').status, 'recorded')
  for (const status of ['Unpaid', 'Pending Verification', 'Refunded']) assert.equal(stage({ paymentStatus: status }, 'deposit').status, 'waiting')
  assert.equal(stage({ bookingStatus: 'Confirmed' }, 'deposit').status, 'unknown')
  assert.equal(stage({ paymentStatus: 'Unexpected' }, 'deposit').status, 'unknown')
  assert.equal(stage({ shootRecorded: true }, 'shoot').status, 'recorded')
  assert.equal(stage({ shootRecorded: false }, 'shoot').status, 'waiting')
  assert.equal(stage({ shootDate: '2026-11-01', today: '2026-10-01' }, 'shoot').status, 'waiting')
  assert.equal(stage({ shootDate: '2026-09-01', today: '2026-10-01' }, 'shoot').status, 'unknown')
})

test('task attention keeps blocked current work separate from historical evidence', () => {
  const cases = [
    [{ selectionStatus: 'COPY_FAILED' }, 'choices', 'blocked', 'recorded'],
    [{ productionStatus: 'UPLOAD_FAILED', enhancedCount: 2 }, 'upload', 'blocked', 'recorded'],
    [{ reviewStatus: 'Rejected' }, 'review', 'blocked', 'waiting'],
    [{ bookingStatus: 'Pending Verification' }, 'deposit', 'current', 'unknown'],
    [{ productionStatus: 'READY_FOR_EDITING' }, 'editing', 'current', 'waiting'],
  ] as const
  for (const [facts, id, attention, evidence] of cases) {
    const result = deriveWorkflowLifecycle(facts)
    const current = result.find(value => value.id === id)!
    assert.equal(current.attention?.status, attention)
    assert.equal(current.status, evidence)
    assert.equal(result.filter(value => value.attention).length, 1)
  }
  for (const facts of [{}, { detailsUnavailable: true }, { bookingStatus: 'Cancelled', uploadFailed: true }, { bookingStatus: 'No Show', reviewStatus: 'Rejected' }]) {
    assert.ok(deriveWorkflowLifecycle(facts).every(value => !value.attention))
  }
  const rawOnly = { usesSelectionWorkflow: false, productionStatus: 'UPLOAD_FAILED', rawCount: 30, pendingDownloadRequests: 1 }
  assert.equal(stage(rawOnly, 'delivery').attention?.status, 'current')
  assert.ok(deriveWorkflowLifecycle(rawOnly).filter(value => value.status === 'not-required').every(value => !value.attention))
})

test('recorded editing start survives a stale job status without inventing approval or delivery', () => {
  const facts = { productionStatus: 'READY_FOR_EDITING', editingStartedAt: '2026-10-01T02:00:00Z' }
  const editing = stage(facts, 'editing')
  assert.equal(editing.status, 'recorded')
  assert.equal(editing.attention?.status, 'current')
  assert.match(editing.detail, /editing-start milestone is recorded/)
  assert.match(editing.detail, /Current job status: READY_FOR_EDITING/)
  assert.doesNotMatch(editing.detail, /has not started/)
  for (const id of ['choices', 'review', 'upload', 'delivery']) assert.equal(stage(facts, id).status, 'unknown')
  assert.equal(stage({ ...facts, editingStartedAt: 'invalid' }, 'editing').status, 'waiting')
})
