export type EmailTemplateId =
  | 'booking_confirmation'
  | 'booking_reminder'
  | 'payment_received'
  | 'payment_approved'

export type EmailTemplate = {
  id: EmailTemplateId
  name: string
  subject: string
  body: string
}

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'booking_confirmation',
    name: 'Booking Confirmation',
    subject: 'Booking Confirmed — {{bookingId}}',
    body: `<h2>FICO MANA</h2>
<p>Hello <strong>{{customerName}}</strong>,</p>
<p>Your booking is confirmed. Please review your schedule below.</p>
<table>
<tr><td>Reference</td><td><strong>{{bookingId}}</strong></td></tr>
<tr><td>Package</td><td><strong>{{packageName}}</strong></td></tr>
<tr><td>Date</td><td><strong>{{bookingDate}}</strong></td></tr>
<tr><td>Arrival Time</td><td><strong>{{arrivalTime}}</strong></td></tr>
<tr><td>Shoot Time</td><td><strong>{{shootTime}}</strong></td></tr>
<tr><td>Deposit</td><td><strong>₱{{depositAmount}}</strong></td></tr>
</table>
<p><strong>Preparation:</strong> Arrive on time, bring valid ID, and come photo-ready. Late arrivals beyond 15 minutes may incur a ₱500 fee.</p>
<p>{{lateFeePolicy}}</p>`,
  },
  {
    id: 'booking_reminder',
    name: 'Session Reminder',
    subject: 'Reminder — Your Graduation Pictorial is Today · {{bookingId}}',
    body: `<h2>FICO MANA</h2>
<p>Hello <strong>{{customerName}}</strong>,</p>
<p>Good day! 🌸✨<br/>
Welcome to FICO MANA Studio. This is a friendly reminder that your Graduation Pictorial is scheduled for today. We look forward to seeing you! 📸🎓</p>
<table>
<tr><td>Reference</td><td><strong>{{bookingId}}</strong></td></tr>
<tr><td>Package</td><td><strong>{{packageName}}</strong></td></tr>
<tr><td>Date</td><td><strong>{{bookingDate}}</strong></td></tr>
<tr><td>Arrival Time</td><td><strong>{{arrivalTime}}</strong></td></tr>
<tr><td>Shoot Time</td><td><strong>{{shootTime}}</strong></td></tr>
</table>
<p><strong>General Reminders</strong></p>
<ul>
<li>Arrival Time: 15 mins before the booked schedule</li>
<li>Grace period for late arrivals: 15 minutes</li>
<li>Late fee: ₱300 (for arrivals beyond the grace period)</li>
</ul>
<p><strong>For MANA Package Clients</strong></p>
<ul>
<li>Please do not use conditioner before your appointment.</li>
<li>Arrive with a bare face (no makeup).</li>
<li>Wear a tube top.</li>
<li>If you wear contact lenses, please put them on before arriving or before your hair and makeup session begins.</li>
<li>Hair extensions are available in Brown and Black only. If your hair color is different, please bring your own matching hair extensions.</li>
</ul>
<p><strong>For FICO Package (Male) Clients</strong></p>
<ul>
<li>Wear or bring a plain white shirt.</li>
<li>You may bring your own Barong Tagalog. If needed, we have Barong Tagalog available in sizes XS, M, XL, and 3XL.</li>
</ul>`,
  },
  {
    id: 'payment_received',
    name: 'Payment Received',
    subject: 'Receipt Uploaded — {{bookingId}}',
    body: `<h2>FICO MANA</h2>
<p>Hello <strong>{{customerName}}</strong>,</p>
<p>We received your payment receipt and are verifying it now.</p>
<p>Reference: <strong>{{bookingId}}</strong></p>`,
  },
  {
    id: 'payment_approved',
    name: 'Payment Approved',
    subject: 'Booking Confirmed — {{bookingId}}',
    body: `<h2>FICO MANA</h2>
<p>Hello <strong>{{customerName}}</strong>,</p>
<p>Your deposit has been verified. Your booking is now <strong>confirmed</strong>.</p>
<p>Reference: <strong>{{bookingId}}</strong> · Package: <strong>{{packageName}}</strong></p>
<p>Session: <strong>{{bookingDate}}</strong> · Arrival <strong>{{arrivalTime}}</strong> · Shoot <strong>{{shootTime}}</strong></p>
<p>Deposit: <strong>₱{{depositAmount}}</strong></p>`,
  },
]

export function renderTemplate(
  template: EmailTemplate,
  vars: Record<string, string | number | undefined>,
): { subject: string; body: string } {
  const replace = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''))

  return {
    subject: replace(template.subject),
    body: wrapEmailHtml(replace(template.body)),
  }
}

function wrapEmailHtml(inner: string): string {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#222222;color:#F4F4F8;border:1px solid rgba(255,255,255,0.1);">${inner}</div>`
}

export function getServerEmailTemplate(id: EmailTemplateId): EmailTemplate {
  return DEFAULT_EMAIL_TEMPLATES.find((t) => t.id === id)!
}
