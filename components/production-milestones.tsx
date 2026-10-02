import type { WorkspaceProduction } from '@/lib/client-workspace-types'

function recordedTime(value: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(date)
}

/** Read-only handoff evidence; a later milestone never fills in an earlier one. */
export default function ProductionMilestones({ production }: { production: WorkspaceProduction }) {
  const milestones = [
    ['Originals downloaded for editing', production.downloadedAt],
    ['Editing started', production.editingStartedAt],
    ['Ready to upload', production.readyToUploadAt],
    ['Editing record last updated', production.updatedAt],
  ] as const
  return <details className="mt-5">
    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary">Production handoff history</summary>
    <p className="mt-1 text-sm leading-6 text-white/70">Recorded in Manila time. A missing timestamp does not confirm that the task happened.</p>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-xs text-white/65">Batch status</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-white">{production.batch ? production.batch.status?.replace(/[_-]+/g, ' ') || 'Not recorded' : 'Not assigned'}</dd></div>
      {milestones.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-white/65">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-white">{recordedTime(value)}</dd></div>)}
    </dl>
  </details>
}
