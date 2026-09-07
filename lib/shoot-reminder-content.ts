export type ShootReminderKind = 'day_before' | 'shoot_day'
export type ShootResponse = 'pending' | 'confirmed' | 'declined'

export type ShootReminderPayload = {
  bookingId: string
  customerName: string
  customerEmail: string
  packageName: string
  shootDate: string
  bookingTime: string
  arrivalTime: string
  shootTime: string
  token: string
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function buildShootReminder(payload: ShootReminderPayload, kind: ShootReminderKind, siteUrl: string) {
  const when = kind === 'day_before' ? 'tomorrow' : 'today'
  const subject = `Your FICO MANA shoot is ${when} — ${payload.bookingId}`
  const responseUrl = `${siteUrl.replace(/\/$/, '')}/shoot-response/${encodeURIComponent(payload.token)}`
  const date = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(`${payload.shootDate}T12:00:00+08:00`))
  const details = [
    ['Booking', payload.bookingId], ['Package', payload.packageName], ['Shoot date', date],
    ['Session', payload.bookingTime], ['Arrival time', payload.arrivalTime || payload.bookingTime],
    ['Shoot time', payload.shootTime || payload.bookingTime], ['Timezone', 'GMT+8'],
  ].map(([label, value]) => `<tr><td style="padding:10px 0;color:#666;border-bottom:1px solid #eee">${label}</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #eee">${escapeEmailHtml(value)}</td></tr>`).join('')
  // Inline styles keep the email actions independent of the website's CSS.
  const buttonStyle = 'display:inline-block;box-sizing:border-box;min-width:176px;max-width:100%;padding:14px 22px;border:1px solid;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;line-height:20px;text-align:center;text-decoration:none;vertical-align:middle;margin:0 10px 10px 0;cursor:pointer;'
  const html = `<div style="background:#f5f5f5;padding:24px 12px;font-family:Arial,sans-serif;color:#222"><div style="max-width:600px;margin:auto;background:white;padding:30px;border-top:4px solid #0500d0">
    <p style="font-weight:bold;letter-spacing:3px;color:#0500d0">FICO MANA</p><h1 style="font-size:24px">Your shoot is ${when}</h1>
    <p>Hello ${escapeEmailHtml(payload.customerName)},</p><p>We're looking forward to welcoming you ${when}. Here are your session details:</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse">${details}</table>
    <p style="font-size:13px">Please arrive at your scheduled arrival time and bring any outfits or props needed for your session.</p>
    <p><strong>Will you be joining us?</strong></p><p>Please confirm your attendance or let us know if you can't attend so our team can follow up.</p>
    <p style="margin:24px 0 12px;font-size:0;line-height:1"><a href="${escapeEmailHtml(responseUrl)}?choice=confirmed" style="${buttonStyle}background:#0500d0;border-color:#0500d0;color:#ffffff;">Confirm My Shoot</a>
    <a href="${escapeEmailHtml(responseUrl)}?choice=declined" style="${buttonStyle}background:#f7f8fc;border-color:#dce1ef;color:#30354a;">I Can't Attend</a></p>
    <p style="font-size:12px;color:#666">Your choice is saved after you submit it on the next page. If you can't attend, our team will contact you about the next steps.</p>
    <p style="border-top:1px solid #eee;padding-top:18px;font-size:12px;color:#666">FICO MANA Studio · Cabuyao Retail Plaza, Cabuyao, Laguna<br>+63 49 576 5176</p>
  </div></div>`
  const text = `Hello ${payload.customerName}, your FICO MANA shoot is ${when}.\nBooking: ${payload.bookingId}\nPackage: ${payload.packageName}\nDate: ${date}\nSession: ${payload.bookingTime}\nArrival: ${payload.arrivalTime || payload.bookingTime}\nTimezone: GMT+8\nConfirm your shoot: ${responseUrl}?choice=confirmed\nCan't attend: ${responseUrl}?choice=declined\nYour choice is saved on the next page.\nFICO MANA Studio, Cabuyao Retail Plaza, Cabuyao, Laguna. +63 49 576 5176`
  return { subject, html, text }
}
