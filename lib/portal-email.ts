import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlaceholderCustomerEmail } from '@/lib/customer-email'
import { sendEmail } from '@/lib/email'
import { portalUrl } from '@/lib/client-portal'
import { packageUsesGraduationWorkflow } from '@/lib/package-workflow-server'

export async function sendPortalAccessIfNeeded(
  admin: SupabaseClient,
  bookingId: string,
  actor: { type?: 'system' | 'staff' | 'webhook'; id?: string | null } = {},
) {
  const [{ data: portal }, { data: booking }] = await Promise.all([
    admin
      .from('client_portals')
      .select('id,public_id,status,access_email_sent_at')
      .eq('booking_id', bookingId)
      .maybeSingle(),
    admin
      .from('bookings')
      .select('id,customer_name,customer_email,booking_date,booking_time,package_name,package_id')
      .eq('id', bookingId)
      .maybeSingle(),
  ])

  if (!portal || !booking || portal.status !== 'active' || portal.access_email_sent_at) {
    return { sent: false as const }
  }
  if (!await packageUsesGraduationWorkflow(admin, String(booking.package_id))) return { sent: false as const }

  const recipient = String(booking.customer_email || '').trim()
  if (!recipient || isPlaceholderCustomerEmail(recipient)) {
    return { sent: false as const, skipped: 'No deliverable customer email.' }
  }

  const url = portalUrl(String(portal.public_id))
  const subject = `Your FICO MANA Client Portal — ${booking.id}`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:2px solid #0500D0;background:#fff;color:#171717;">
      <h2 style="color:#0500D0;text-align:center;margin:0 0 4px;">FICO MANA</h2>
      <p style="font-size:8px;text-transform:uppercase;letter-spacing:.2em;color:#5A5A8A;text-align:center;margin:0 0 20px;">Client Portal</p>
      <hr style="border:0;border-top:1px dashed #D4D8F0;margin:0 0 20px;" />
      <h3 style="color:#0500D0;margin:0 0 16px;">Your project is ready</h3>
      <p>Hello <strong>${booking.customer_name}</strong>,</p>
      <p>Your booking is confirmed and your private FICO MANA Client Portal is now active.</p>
      <table style="width:100%;font-size:13px;margin:16px 0;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#5A5A8A;border-bottom:1px solid #EEF0FF;">Booking</td><td style="padding:8px 0;font-weight:bold;font-family:monospace;border-bottom:1px solid #EEF0FF;">${booking.id}</td></tr>
        <tr><td style="padding:8px 0;color:#5A5A8A;border-bottom:1px solid #EEF0FF;">Package</td><td style="padding:8px 0;font-weight:bold;border-bottom:1px solid #EEF0FF;">${booking.package_name}</td></tr>
        <tr><td style="padding:8px 0;color:#5A5A8A;">Shoot</td><td style="padding:8px 0;font-weight:bold;">${booking.booking_date} · ${booking.booking_time}</td></tr>
      </table>
      <div style="text-align:center;margin:28px 0;">
        <a href="${url}" style="background:#0500D0;color:#fff;padding:14px 28px;text-decoration:none;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;display:inline-block;">Open Client Portal</a>
      </div>
      <div style="background:#EEF0FF;padding:14px;border-left:3px solid #0500D0;">
        <p style="margin:0;font-size:12px;color:#5A5A8A;line-height:1.6;">This is a private access link. Do not post or forward it publicly. Your portal shows live booking/payment information and only client-approved deliverables.</p>
      </div>
    </div>
  `

  const result = await sendEmail({ bookingId, to: recipient, subject, html })
  if (!result.success) return { sent: false as const, error: result.error || 'Portal email failed.' }

  const sentAt = new Date().toISOString()
  await admin.from('client_portals').update({ access_email_sent_at: sentAt, updated_at: sentAt }).eq('id', portal.id)
  await admin.from('provisioning_audit').insert({
    booking_id: bookingId,
    action: 'portal_access_email_sent',
    actor_type: actor.type || 'system',
    actor_id: actor.id || null,
    external_resource_id: String(portal.id),
    metadata: { recipient },
  })

  return { sent: true as const, url }
}
