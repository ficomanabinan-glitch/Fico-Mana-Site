import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertGraduationBooking } from '@/lib/package-workflow-server'
import { portalUrl } from '@/lib/client-portal'
import { sendPortalSelectionRejectedEmail, sendPortalSelectionReopenedEmail } from '@/lib/email'

export class SelectionReviewError extends Error {}
export async function reviewSelection(workspaceId: string, actorId: string, bookingId: string, body: unknown) {
  const input = body as { action?: unknown; submittedAt?: unknown; notes?: unknown; reason?: unknown }
  if (!input || !['Approve', 'Reject', 'Reopen', 'RetryEmail', 'RetryReopenEmail'].includes(String(input.action)) ||
      typeof input.submittedAt !== 'string' || !Number.isFinite(Date.parse(input.submittedAt))) {
    throw new SelectionReviewError('Invalid review request. Try: refresh the queue.')
  }
  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : typeof input.reason === 'string' ? input.reason.trim() : ''
  if (notes.length > 2000 || (input.action === 'Reject' && !notes)) throw new SelectionReviewError('Enter a rejection reason of up to 2,000 characters.')
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('Review unavailable')
  await assertGraduationBooking(admin, bookingId, workspaceId)
  if (input.action !== 'RetryEmail' && input.action !== 'RetryReopenEmail') {
    const { error } = await admin.rpc('review_portal_selection', {
      p_workspace: workspaceId, p_booking: bookingId, p_actor: actorId, p_action: input.action,
      p_submitted_at: input.submittedAt, p_notes: notes,
    })
    if (error) {
      if (/Selection changed|not pending review|not approved for reopening|Editing has already started|not found|Invalid review|not authorized/i.test(error.message)) {
        throw new SelectionReviewError('This selection changed or can no longer be reviewed. Try: sync the queue.')
      }
      throw error
    }
  }
  if (input.action === 'Approve') return { success: true }
  // Fetch the committed result, never email a change that failed to save.
  const [{ data: booking, error: bookingError }, { data: selection, error: selectionError }, { data: portal, error: portalError }] = await Promise.all([
    admin.from('bookings').select('id,customer_name,customer_email,raw_photo_status,raw_photo_notes,raw_photo_submitted_at').eq('workspace_id',workspaceId).eq('id',bookingId).single(),
    admin.from('photo_selections').select('id,version,status').eq('workspace_id',workspaceId).eq('booking_id',bookingId).single(),
    admin.from('client_portals').select('public_id,status,expires_at').eq('workspace_id',workspaceId).eq('booking_id',bookingId).single(),
  ])
  if (bookingError || selectionError || portalError || !booking || !selection || !portal) {
    return { success: true, emailErrors: ['Review saved, but email could not be prepared. Try: refresh the queue and press Resend Email.'] }
  }
  const reopening = input.action === 'Reopen' || input.action === 'RetryReopenEmail'
  const expectedStatus = reopening ? 'Reopened' : 'Rejected'
  if (booking.raw_photo_status !== expectedStatus || selection.status !== 'OPEN' || portal.status !== 'active' ||
    (portal.expires_at && Date.parse(portal.expires_at) <= Date.now()) ||
    Date.parse(booking.raw_photo_submitted_at) !== Date.parse(input.submittedAt)) {
    throw new SelectionReviewError('The client selection has changed. Try: refresh the queue.')
  }
  try {
    const common = {
      bookingId,
      name: String(booking.customer_name),
      email: String(booking.customer_email),
      url: portalUrl(String(portal.public_id)),
      revision: `${selection.id}-${selection.version}`,
    }
    const result = reopening
      ? await sendPortalSelectionReopenedEmail(common)
      : await sendPortalSelectionRejectedEmail({ ...common, reason: String(booking.raw_photo_notes || '') })
    return { success: true, emailErrors: result.success ? undefined : ['Selection reopened, but email was not sent. Try: check email settings, then press Resend Email.'] }
  } catch (error) {
    console.error('Selection review email failed:', error)
    return { success: true, emailErrors: ['Selection reopened, but email was not sent. Try: check email settings, then press Resend Email.'] }
  }
}
