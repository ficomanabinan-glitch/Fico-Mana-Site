import type { SupabaseClient } from '@supabase/supabase-js'

export type BatchCandidate = { bookingId: string; clientId?: string; expectedFiles: number }
export type BatchPreflightStatus = 'READY' | 'DELIVERED' | 'UPLOADING' | 'ATTENTION' | 'MISSING' | 'OTHER_BATCH' | 'INVALID'
type Row = Record<string, unknown>

/** Callers provide a stable unique ordering. A failed page never becomes a partial success. */
export async function readEditorRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  let offset = 0
  for (let page = 0; page < 1000 && offset < 50_000; page++) {
    const { data, error } = await query(offset, offset + 499)
    if (error) throw new Error(error.message)
    if (!Array.isArray(data)) throw new Error('The batch listing is incomplete. Try: refresh the batch before uploading.')
    if (!data.length) return rows
    rows.push(...data)
    // Hosted Data API limits can be smaller than the requested page size.
    offset += data.length
  }
  throw new Error('This batch is too large to list safely. Ask the studio administrator to narrow the listing.')
}

export async function loadEditorMembership(admin: SupabaseClient, workspaceId: string) {
  const [bookings, jobs] = await Promise.all([
    readEditorRows<Row>((from, to) => admin.from('bookings').select('*').eq('workspace_id', workspaceId).order('id').range(from, to)),
    readEditorRows<Row>((from, to) => admin.from('editing_jobs').select('*').eq('workspace_id', workspaceId).order('id').range(from, to)),
  ])
  return { bookings, jobs }
}

export function batchMemberAttention(workspaceId: string, batchId: string, bookingId: string, booking: Row | undefined, job: Row | undefined, eligiblePackages: ReadonlySet<string>): { status: BatchPreflightStatus; reason: string } | null {
  if (!booking || !job) return { status: 'MISSING', reason: 'The booking or editing job is no longer available in this workspace.' }
  if (String(booking.workspace_id) !== workspaceId || String(job.workspace_id) !== workspaceId || String(job.booking_id) !== bookingId) return { status: 'INVALID', reason: 'The client mapping is invalid.' }
  if (String(job.batch_id) !== batchId) return { status: 'OTHER_BATCH', reason: 'This client is assigned to another batch.' }
  if (String(job.client_id) !== String(booking.client_id)) return { status: 'INVALID', reason: 'The client identity changed. Select the correct client folder.' }
  if (['Cancelled', 'Rejected', 'Archived'].includes(String(booking.booking_status))) return { status: 'ATTENTION', reason: `This booking is ${String(booking.booking_status).toLowerCase()}.` }
  if (!eligiblePackages.has(String(booking.package_id))) return { status: 'ATTENTION', reason: 'This package no longer uses the editing workflow.' }
  return null
}

export function classifyBatchCandidate(input: {
  workspaceId: string; batchId: string; candidate: BatchCandidate; booking?: Row; job?: Row;
  eligiblePackages: ReadonlySet<string>; manifestWorkspaceId?: string; duplicate?: boolean;
}) {
  const { candidate, booking, job } = input
  const result = (status: BatchPreflightStatus, reason: string) => ({ bookingId: candidate.bookingId,
    customerName: String(booking?.customer_name || candidate.bookingId), workflowStatus: String(job?.status || ''), status, reason })
  if (input.manifestWorkspaceId !== undefined && input.manifestWorkspaceId !== input.workspaceId) return result('INVALID', 'This folder belongs to another workspace.')
  if (input.duplicate || !candidate.bookingId) return result('INVALID', 'Choose one valid client folder per booking.')
  const attention = batchMemberAttention(input.workspaceId, input.batchId, candidate.bookingId, booking, job, input.eligiblePackages)
  if (attention) return result(attention.status, attention.reason)
  if (!booking || !job) return result('MISSING', 'The booking or editing job is no longer available in this workspace.')
  if (candidate.clientId !== undefined && candidate.clientId !== String(booking.client_id)) return result('INVALID', 'The client identity changed. Select the correct client folder.')
  if (job.status === 'DELIVERED' || job.delivered_at || booking.edited_photo_delivered_at) return result('DELIVERED', 'This client has already been delivered.')
  if (job.status === 'UPLOADING') return result('UPLOADING', 'An upload is already in progress for this client.')
  if (!Number.isInteger(candidate.expectedFiles) || candidate.expectedFiles < 1 || candidate.expectedFiles > 1000) return result('ATTENTION', 'Choose a client folder with 1 to 1,000 edited files.')
  // Historical jobs retain membership and readiness even when RAW visibility changes.
  if (!['DOWNLOADED', 'EDITING', 'READY_TO_UPLOAD', 'UPLOAD_FAILED'].includes(String(job.status))) return result('ATTENTION', 'Download and prepare this client for editing before uploading.')
  return result('READY', '')
}
