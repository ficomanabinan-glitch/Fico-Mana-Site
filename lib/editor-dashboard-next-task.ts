import { deriveWorkflowNextAction } from './workflow-next-action.ts'
import type { EditorBatchSummary } from './editor-read-cache.ts'

type OnsiteJob = { bookingId: string; customerName: string; galleryCount: number; storageReady?: boolean }
export type EditorDashboardNextTask = { title: string; explanation: string; context: string; label: string; href?: string; downloadBatchId?: string; retry?: boolean; priority: number }

/** Adapt known dashboard summaries, without guessing client approvals or local editing progress. */
export function getEditorDashboardNextTask({ batches, jobs, today, capabilities, unavailable = false }: {
  batches: EditorBatchSummary[]; jobs: OnsiteJob[]; today: string
  capabilities: { edit: boolean; onsite: boolean }; unavailable?: boolean
}): EditorDashboardNextTask | null {
  if (unavailable) return { title: 'Check the latest work list', explanation: 'Part of the dashboard could not be checked. Refresh before relying on the counts or choosing the next job.', context: 'Dashboard check incomplete', label: 'Retry dashboard', retry: true, priority: 0 }
  const tasks: EditorDashboardNextTask[] = []
  if (capabilities.edit) {
    for (const batch of [...batches].sort((a, b) => a.shootDate.localeCompare(b.shootDate) || a.id.localeCompare(b.id))) {
      const context = `${batch.shootDate} · ${batch.id}`
      if (batch.counts.failed > 0) {
        const next = deriveWorkflowNextAction({ uploadFailed: true })
        tasks.push({ title: next.label, explanation: next.explanation, context: `${batch.counts.failed} failed client upload${batch.counts.failed === 1 ? '' : 's'} · ${context}`, label: 'Retry upload', href: `/editor/upload?batch=${encodeURIComponent(batch.id)}&retry=1`, priority: next.priority })
      } else if (batch.counts.readyToUpload > 0) {
        const next = deriveWorkflowNextAction({ productionStatus: 'ready to upload' })
        tasks.push({ title: next.label, explanation: next.explanation, context: `${batch.counts.readyToUpload} client${batch.counts.readyToUpload === 1 ? '' : 's'} ready · ${context}`, label: 'Open upload', href: `/editor/upload?batch=${encodeURIComponent(batch.id)}`, priority: next.priority })
      } else if (batch.counts.readyForEditing > 0) {
        const next = deriveWorkflowNextAction({ selectionStatus: 'approved' })
        tasks.push({ title: 'Download an approved batch', explanation: 'Client choices are approved. Download the batch ZIP, extract it, and keep its filename mapping while editing.', context: `${batch.counts.readyForEditing} client${batch.counts.readyForEditing === 1 ? '' : 's'} pending download · ${context}`, label: 'Download batch ZIP', downloadBatchId: batch.id, priority: next.priority })
      } else if (batch.counts.downloaded + batch.counts.editing > 0) {
        const next = deriveWorkflowNextAction({ productionStatus: 'editing' })
        tasks.push({ title: next.label, explanation: next.explanation, context, label: 'Open batch', href: `/editor/batch/${encodeURIComponent(batch.id)}`, priority: next.priority })
      }
    }
  }
  if (capabilities.onsite) {
    for (const job of jobs.filter(job => job.galleryCount === 0 && job.storageReady === true)) {
      const next = deriveWorkflowNextAction({ bookingStatus: 'Confirmed', shootDate: today, today, rawCount: 0 })
      tasks.push({ title: 'Check today’s original-photo upload', explanation: 'No original photos are recorded for this client yet. Check that the shoot is finished before uploading.', context: `${job.customerName} · ${job.bookingId}`, label: 'Open onsite upload', href: `/editor/onsite?date=${encodeURIComponent(today)}&booking=${encodeURIComponent(job.bookingId)}`, priority: next.priority })
    }
  }
  const next = tasks.sort((a, b) => a.priority - b.priority)[0]
  if (next) return next
  if (capabilities.edit) {
    const waiting = batches.reduce((sum, batch) => sum + batch.counts.waitingForSelection, 0)
    if (waiting > 0) return { title: 'Waiting for client choices', explanation: 'These clients are listed as waiting for selection. Review their queue records before following up; no editing approval has been assumed.', context: `${waiting} client${waiting === 1 ? '' : 's'} waiting for selection`, label: 'Review editing queue', href: '/editor/queue', priority: 4 }
    const uploading = batches.reduce((sum, batch) => sum + batch.counts.uploading, 0)
    if (uploading > 0) return { title: 'Uploads are in progress', explanation: 'Enhanced-photo uploads are still running. Review their progress before starting another upload or treating files as delivered.', context: `${uploading} client upload${uploading === 1 ? '' : 's'} in progress`, label: 'View upload progress', href: '/editor/upload', priority: 5 }
  }
  return null
}
