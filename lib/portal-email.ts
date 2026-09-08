import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlaceholderCustomerEmail, isValidCustomerEmail } from '@/lib/customer-email'
import { sendEmail } from '@/lib/email'
import { escapeEmailText } from '@/lib/email-templates'
import { portalUrl } from '@/lib/client-portal'
import { packageUsesGraduationWorkflow } from '@/lib/package-workflow-server'

export const onsitePortalEmailSubject = (bookingId: string) => `Your photos are ready to select — FICO MANA ${bookingId}`

async function recordFirstPortalReadyEmail(
  admin: SupabaseClient,
  portal: { public_id: unknown; access_email_sent_at?: unknown },
  workspaceId: string,
  sentAt: string,
) {
  const { error } = await admin.rpc('record_portal_ready_email', {
    p_workspace: workspaceId,
    p_public_id: String(portal.public_id),
    p_sent_at: portal.access_email_sent_at ? String(portal.access_email_sent_at) : sentAt,
  })
  return error
}

export async function sendPortalAccessIfNeeded(
  admin: SupabaseClient,
  bookingId: string,
  actor: { workspaceId: string; type?: 'system' | 'staff' | 'webhook'; id?: string | null },
) {
  // Check ownership before reading private portal data through the privileged client.
  const { data: booking, error: bookingError } = await admin.from('bookings')
    .select('id,customer_name,customer_email,package_id,booking_status')
    .eq('workspace_id', actor.workspaceId).eq('id', bookingId).maybeSingle()
  if (bookingError) throw new Error('The booking could not be checked. Try: retry the email.')
  if (!booking) return { sent: false, error: 'Booking not found.' }
  if (['Cancelled', 'Rejected', 'No Show'].includes(String(booking.booking_status))) {
    return { sent: false, error: 'This booking is not available for photo selection.' }
  }
  if (!await packageUsesGraduationWorkflow(admin, String(booking.package_id))) {
    return { sent: false, error: 'This package does not use a client selection portal.' }
  }
  const recipient = String(booking.customer_email || '').trim()
  if (!isValidCustomerEmail(recipient) || isPlaceholderCustomerEmail(recipient)) {
    return { sent: false, error: 'The client email is missing or invalid. Try: update it in Booking Management, then retry the email.' }
  }
  const subject = onsitePortalEmailSubject(bookingId)
  const [portalResult, galleryResult, historyResult] = await Promise.all([
    admin.from('client_portals').select('id,public_id,status,access_email_sent_at').eq('workspace_id', actor.workspaceId).eq('booking_id', bookingId).maybeSingle(),
    admin.from('gallery_files').select('id').eq('booking_id', bookingId).limit(1),
    admin.from('email_logs').select('id,sent_at').eq('booking_id', bookingId)
      .eq('subject', subject).eq('recipient_email', recipient).eq('status', 'SENT')
      .order('sent_at', { ascending: true }).limit(1),
  ])
  if (portalResult.error || galleryResult.error || historyResult.error) {
    throw new Error('The portal email status could not be checked. Try: retry the email.')
  }
  const portal = portalResult.data
  if (!portal || portal.status !== 'active') {
    return { sent: false, error: 'The client portal is not active. Try: retry provisioning in Client Portals, then retry the email.' }
  }
  if (!galleryResult.data?.length) {
    return { sent: false, error: 'No uploaded photos are available. Try: finish uploading and Sync Drive before retrying the email.' }
  }
  // Old provisioning emails must not suppress this photos-ready notification.
  if (historyResult.data?.length) {
    const firstSentAt = String(historyResult.data[0]?.sent_at || new Date().toISOString())
    const expiryError = await recordFirstPortalReadyEmail(admin, portal, actor.workspaceId, firstSentAt)
    if (expiryError) return { sent: false, error: 'The portal email was already sent, but its expiry could not be saved. Try: retry this action.' }
    return { sent: false, alreadySent: true }
  }
  const url = portalUrl(String(portal.public_id))
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:2px solid #0500D0;border-radius:16px;background:#fff;color:#171717;">
    <h2 style="color:#0500D0;text-align:center;">FICO MANA</h2>
    <h3>Your photos are ready to select</h3>
    <p>Hello ${escapeEmailText(booking.customer_name)},</p>
    <p>Your photos are now available in your Client Portal. Open your portal to review your photos, choose your included edits, and select your prints and add-ons.</p>
    <p>Booking: <strong>${escapeEmailText(bookingId)}</strong></p>
    <p style="text-align:center;margin:28px 0;"><a href="${escapeEmailText(url)}" style="background:#0500D0;color:#fff;padding:14px 28px;border-radius:14px;text-decoration:none;font-weight:bold;display:inline-block;">Open Client Portal</a></p>
    <p style="font-size:12px;color:#5A5A8A;">Keep this private link for your own use.</p>
  </div>`
  const idempotencyKey = `onsite-portal-${createHash('sha256').update(JSON.stringify([recipient, subject, html])).digest('hex')}`
  const result = await sendEmail({ bookingId, to: recipient, subject, html, idempotencyKey })
  if (!result.success) return { sent: false, error: 'The portal email could not be sent. Try: check the client email and the email service settings, then retry.' }
  const sentAt = new Date().toISOString()
  const expiryError = await recordFirstPortalReadyEmail(admin, portal, actor.workspaceId, sentAt)
  if (expiryError) {
    console.error('Portal email accepted, but the portal expiry could not be started.', expiryError)
    return { sent: false, error: 'The portal email was sent, but its expiry could not be saved. Try: retry this action.' }
  }
  return { sent: true }
}
