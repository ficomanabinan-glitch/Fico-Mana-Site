/** Pure interpretation of authoritative reads; unknown is never treated as complete. */
export type WorkflowFacts = {
  bookingStatus?: string; paymentStatus?: string; shootDate?: string; today?: string
  rawStatus?: string | null; rawCount?: number | null
  selectionStatus?: string | null; reviewStatus?: string | null
  usesSelectionWorkflow?: boolean | null; productionStatus?: string | null
  uploadFailed?: boolean; storageFailed?: boolean; delivered?: boolean
  portalExpired?: boolean; detailsUnavailable?: boolean; pendingDownloadRequests?: number | null
  shootRecorded?: boolean; selectionSubmitted?: boolean; selectionApproved?: boolean; enhancedCount?: number | null
  editingStartedAt?: string | null
}
export type WorkflowNextAction = {
  id: string; label: string; explanation: string; owner: 'admin' | 'editor' | 'client' | 'none'
  priority: number
  target: 'booking' | 'payment' | 'onsite' | 'selection' | 'portalManagement' | 'files' | 'batch' | 'upload' | 'retryUpload' | 'workspace'
}
const normal = (value?: string | null) => (value || '').toLowerCase().replace(/[ _-]+/g, ' ').trim()
export function deriveWorkflowNextAction(f: WorkflowFacts): WorkflowNextAction {
  const booking = normal(f.bookingStatus)
  const selection = f.usesSelectionWorkflow === false ? '' : normal(f.selectionStatus)
  const review = f.usesSelectionWorkflow === false ? '' : normal(f.reviewStatus)
  const job = f.usesSelectionWorkflow === false ? '' : normal(f.productionStatus)
  const action = (id: string, label: string, explanation: string, owner: WorkflowNextAction['owner'], priority: number, target: WorkflowNextAction['target']): WorkflowNextAction => ({ id, label, explanation, owner, priority, target })
  if (['cancelled', 'no show'].includes(booking)) return action('closed', 'View booking', 'This session is not in the active production queue. Its records remain available.', 'none', 5, 'booking')
  if (booking === 'pending verification' || normal(f.paymentStatus) === 'pending verification') return action('verify', 'Review receipt', 'Confirm the deposit before the session proceeds. Payment verification stays in Admin.', 'admin', 1, 'payment')
  if (booking === 'rejected') return action('receipt-rejected', 'Review rejected payment', 'Check the rejection reason and help the client resubmit a valid receipt.', 'admin', 0, 'payment')
  if (booking === 'pending payment') return action('await-payment', 'View payment instructions', 'The client needs to submit their deposit receipt. Do not mark it paid without verification.', 'client', 4, 'booking')
  if (f.storageFailed) return action('storage-error', 'Review portal setup', 'Photo storage setup reported a problem. Check it before sending the client a link.', 'editor', 0, 'portalManagement')
  if (f.usesSelectionWorkflow !== false && (f.uploadFailed || job === 'upload failed')) return action('upload-error', 'Retry failed upload', 'Some enhanced files did not finish uploading. Retry the failed files before delivery.', 'editor', 0, 'retryUpload')
  if ((f.pendingDownloadRequests ?? 0) > 0) return action('download-request', 'Review download request', 'The client has requested another bulk download. Read their reason before granting access.', 'editor', 1, 'selection')
  if (f.delivered || job === 'delivered') return action('delivered', f.portalExpired ? 'Review expired portal' : 'Check delivered portal', f.portalExpired ? 'Delivery is recorded, but portal access has expired. Review access without promising retained RAW files.' : 'Enhanced photos are published. Check the client-facing result; delivery does not prove that the client downloaded it.', 'editor', 5, 'portalManagement')
  if (selection === 'copy failed') return action('selection-copy-failed', 'Review selection files', 'The selection was saved, but its production copy did not finish. Check the selection before editing.', 'editor', 0, 'selection')
  if (selection === 'submitting') return action('selection-submitting', 'Check submission status', 'The client’s selection is still being finalized. Check the latest status before approving or editing it.', 'editor', 2, 'selection')
  if (f.usesSelectionWorkflow !== false && (normal(f.rawStatus) === 'rejected' || review === 'rejected')) return action('selection-rejected', 'Review selection changes', 'The selection needs corrections. Review the notes and the client’s latest choices.', 'editor', 0, 'selection')
  if (['ready to upload', 'uploading'].includes(job)) return action('upload', 'Upload enhanced photos', 'Editing is ready for the enhanced-photo handoff. Check filenames and completeness before publishing.', 'editor', 1, 'upload')
  if (['editing', 'in progress', 'downloaded'].includes(job)) return action('editing', 'Open editing batch', 'Editing is underway. Keep the production handoff and upload history with this booking.', 'editor', 3, 'batch')
  if (f.usesSelectionWorkflow !== false && (normal(f.rawStatus) === 'approved' || review === 'approved' || ['approved', 'ready for editing'].includes(selection) || ['ready', 'ready for editing'].includes(job))) return action('edit', 'Open editing batch', f.editingStartedAt && Number.isFinite(Date.parse(f.editingStartedAt)) ? 'An editing-start milestone is recorded. Check the current batch status and its expected output files.' : ['ready', 'ready for editing'].includes(job) ? 'The current production status is ready for editing. Continue with the batch and its expected output files.' : 'The current selection status allows the editing handoff. Check the batch and its expected output files.', 'editor', 1, 'batch')
  if (f.usesSelectionWorkflow !== false && (normal(f.rawStatus) === 'pending review' || ['submitted', 'locked'].includes(selection))) return action('review', 'Review selections', 'The client has submitted their choices. Check the included photos, prints, and extras before editing.', 'editor', 1, 'selection')
  if (f.shootDate && f.today && f.shootDate > f.today) return action('scheduled', 'View session', 'The shoot is upcoming. Check the booking, slot, and client preparation details.', 'admin', 3, 'booking')
  if (f.rawCount != null && f.rawCount > 0) {
    if (f.usesSelectionWorkflow === false) return action('download-only', 'Open client portal', 'This package does not need editor selection. Check that all originals are available to download.', 'editor', 3, 'portalManagement')
    if (f.usesSelectionWorkflow === true) return action('await-selection', 'Check client portal', 'Originals are uploaded. The client chooses photos next; staff can check the portal and follow up.', 'client', 4, 'portalManagement')
  }
  if (f.detailsUnavailable) return action('unknown', 'Review client workspace', 'Some production details could not be checked. Retry the details before deciding the next production step.', 'admin', 2, 'workspace')
  if (f.shootDate && f.today && f.shootDate <= f.today && ['confirmed', 'completed'].includes(booking)) return action('raw-upload', 'Open onsite upload', 'Check the shoot and original-photo upload. Completing a session is not the same as delivering enhanced photos.', 'editor', f.shootDate === f.today ? 2 : 3, 'onsite')
  return action('inspect', 'View booking', 'Review the booking details to confirm the next step. No production completion has been assumed.', 'admin', 5, 'booking')
}

export type WorkflowLifecycleStage = {
  id: 'booking' | 'deposit' | 'shoot' | 'originals' | 'choices' | 'review' | 'editing' | 'upload' | 'delivery'
  label: string
  status: 'recorded' | 'waiting' | 'unknown' | 'not-required'
  detail: string
  attention?: { status: 'current' | 'blocked'; label: string }
}

/** Independent evidence for each stage, not an inferred completion checklist. */
export function deriveWorkflowLifecycle(f: WorkflowFacts): WorkflowLifecycleStage[] {
  const booking = normal(f.bookingStatus), payment = normal(f.paymentStatus)
  const selection = normal(f.selectionStatus), review = normal(f.reviewStatus || f.rawStatus), job = normal(f.productionStatus)
  const stage = (id: WorkflowLifecycleStage['id'], label: string, status: WorkflowLifecycleStage['status'], detail: string): WorkflowLifecycleStage => ({ id, label, status, detail })
  const countStage = (id: WorkflowLifecycleStage['id'], label: string, count: number | null | undefined) => {
    if (count == null || !Number.isFinite(count) || count < 0 || !Number.isInteger(count)) return stage(id, label, 'unknown', 'An exact available-file count has not been checked.')
    if (count === 0) return stage(id, label, 'waiting', 'The available-file count is zero. No successful upload is recorded here.')
    return stage(id, label, 'recorded', `${count} available ${count === 1 ? 'file is' : 'files are'} indexed. This does not prove that every expected file is present.`)
  }
  const noSelection = f.usesSelectionWorkflow === false
  const bookingStage = booking
    ? stage('booking', 'Booking', 'recorded', `Booking status: ${f.bookingStatus}. A booking record does not confirm later stages.`)
    : stage('booking', 'Booking', 'unknown', 'Booking status is unavailable.')
  const deposit = ['paid deposit', 'paid full'].includes(payment)
    ? stage('deposit', 'Deposit', 'recorded', payment === 'paid full' ? 'The payment status records full payment.' : 'The payment status records a verified deposit.')
    : ['unpaid', 'pending verification', 'refunded'].includes(payment)
      ? stage('deposit', 'Deposit', 'waiting', payment === 'pending verification' ? 'A receipt is awaiting verification; it is not a verified deposit.' : payment === 'refunded' ? 'Payment is marked refunded. No current verified deposit is assumed.' : 'Payment is marked unpaid.')
      : stage('deposit', 'Deposit', 'unknown', 'Verified payment status is unavailable.')
  const shoot = f.shootRecorded === true
    ? stage('shoot', 'Shoot', 'recorded', 'A shoot record is present. Photo uploads and delivery are checked separately.')
    : f.shootRecorded === false || Boolean(f.shootDate && f.today && f.shootDate > f.today)
      ? stage('shoot', 'Shoot', 'waiting', f.shootDate && f.today && f.shootDate > f.today ? `The shoot is scheduled for ${f.shootDate}; completion is not recorded.` : 'Shoot completion has not been recorded.')
      : stage('shoot', 'Shoot', 'unknown', 'Shoot completion has not been checked. A past date alone does not confirm a shoot.')
  let choices: WorkflowLifecycleStage
  let staffReview: WorkflowLifecycleStage
  let editing: WorkflowLifecycleStage
  if (noSelection) {
    choices = stage('choices', 'Client choices', 'not-required', 'This package uses original-photo delivery without editor selections.')
    staffReview = stage('review', 'Staff review', 'not-required', 'Selection review is not required for this package.')
    editing = stage('editing', 'Editing', 'not-required', 'The package does not require the selection-based editing workflow.')
  } else {
    choices = ['open', 'submitting'].includes(selection)
      ? stage('choices', 'Client choices', 'waiting', selection === 'submitting' ? 'Client choices are still being finalized; submission is not yet confirmed.' : 'No finalized current submission is recorded. An earlier submission does not finalize reopened choices.')
      : f.selectionSubmitted === true || ['submitted', 'copy failed'].includes(selection)
        ? stage('choices', 'Client choices', 'recorded', selection === 'copy failed' ? 'Client choices were saved, but production-copy preparation failed. Staff attention is needed.' : 'A client submission is recorded. Approval is checked separately.')
        : f.selectionSubmitted === false
          ? stage('choices', 'Client choices', 'waiting', 'No finalized current submission is recorded.')
        : stage('choices', 'Client choices', 'unknown', 'Client submission status is unavailable. Later production does not confirm its history.')
    staffReview = ['rejected', 'reopened'].includes(review)
      ? stage('review', 'Staff review', 'waiting', review === 'reopened' ? 'Selections were reopened. An earlier approval does not confirm the current choices.' : 'Selections need corrections. Current approval is not recorded.')
      : f.selectionApproved === true || review === 'approved'
        ? stage('review', 'Staff review', 'recorded', 'Selection approval is directly recorded.')
        : review === 'pending review' || f.selectionApproved === false
          ? stage('review', 'Staff review', 'waiting', 'Current selection approval is not yet recorded.')
          : stage('review', 'Staff review', 'unknown', 'Staff approval status is unavailable. An editing job alone does not prove approval history.')
    editing = f.editingStartedAt && Number.isFinite(Date.parse(f.editingStartedAt))
      ? stage('editing', 'Editing', 'recorded', `An editing-start milestone is recorded. Current job status: ${f.productionStatus || 'unavailable'}. The milestone does not confirm finished editing, upload, or delivery.`)
      : ['editing', 'ready to upload'].includes(job)
      ? stage('editing', 'Editing', 'recorded', job === 'editing' ? 'The editing job is marked EDITING. This does not confirm finished enhanced uploads.' : 'The editing job is marked READY_TO_UPLOAD. Its handoff is recorded; upload and delivery are checked separately.')
      : ['waiting for selection', 'ready for editing', 'downloaded'].includes(job)
        ? stage('editing', 'Editing', 'waiting', job === 'downloaded' ? 'Source files were downloaded for editing; no separate editing-start milestone is available here.' : job === 'ready for editing' ? 'The current job status is READY_FOR_EDITING; no separate editing-start milestone is available here.' : 'The editing job is waiting for client selections.')
        : stage('editing', 'Editing', 'unknown', 'An editing-stage record is unavailable. Later upload or delivery markers do not fill in its history.')
  }
  const enhanced = noSelection
    ? stage('upload', 'Enhanced upload', 'not-required', 'This raw-only package uses original-photo delivery; enhanced uploads are not required. Final release is checked separately.')
    : countStage('upload', 'Enhanced upload', f.enhancedCount)
  if (!noSelection) {
    if (f.enhancedCount === 0 && (f.uploadFailed || job === 'upload failed')) enhanced.detail = 'No available enhanced files are indexed, and the production upload reported a failure. Retry does not imply delivery.'
    else if (f.enhancedCount === 0 && job === 'uploading') enhanced.detail = 'Enhanced upload is in progress, but the available-file count is still zero.'
    else if (enhanced.status === 'recorded' && (f.uploadFailed || job === 'upload failed')) enhanced.detail += ' The production upload also reported a failure; the indexed files do not prove a complete upload.'
  }
  const delivery = f.delivered === true || (!noSelection && job === 'delivered')
    ? stage('delivery', 'Delivery', 'recorded', 'Final release is recorded. This does not confirm that the client downloaded the photographs.')
    : f.delivered === false
      ? stage('delivery', 'Delivery', 'waiting', 'Final release has not been recorded. Available enhanced files alone do not prove delivery.')
      : stage('delivery', 'Delivery', 'unknown', 'Final release has not been checked. Available files or a portal do not prove delivery.')
  const stages = [bookingStage, deposit, shoot, countStage('originals', 'Originals', f.rawCount), choices, staffReview, editing, enhanced, delivery]
  const next = deriveWorkflowNextAction(f)
  // Attention describes today's task; it never changes the independent evidence above.
  const taskStages: Record<string, [WorkflowLifecycleStage['id'], 'current' | 'blocked']> = {
    verify: ['deposit', 'current'], 'await-payment': ['deposit', 'current'], 'receipt-rejected': ['deposit', 'blocked'],
    'storage-error': ['originals', 'blocked'], 'upload-error': ['upload', 'blocked'],
    'selection-copy-failed': ['choices', 'blocked'], 'selection-submitting': ['choices', 'current'],
    'selection-rejected': ['review', 'blocked'], review: ['review', 'current'],
    edit: ['editing', 'current'], editing: ['editing', 'current'], upload: ['upload', 'current'],
    scheduled: ['shoot', 'current'], 'raw-upload': ['originals', 'current'], 'await-selection': ['choices', 'current'],
    'download-only': ['delivery', 'current'], 'download-request': ['delivery', 'current'], delivered: ['delivery', 'current'],
  }
  const task = taskStages[next.id]
  const currentStage = task && stages.find(value => value.id === task[0] && value.status !== 'not-required')
  if (currentStage) currentStage.attention = { status: task[1], label: next.label }
  return stages
}
