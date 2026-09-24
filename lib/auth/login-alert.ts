import { getResendClient, getResendFromAddress } from '@/lib/resend-config'
import { persistEmailLog } from '@/lib/server-email-log'

function describeDevice(userAgent: string) {
  const ua = userAgent.toLowerCase()
  const browser = ua.includes('edg/')
    ? 'Microsoft Edge'
    : ua.includes('chrome/')
      ? 'Chrome'
      : ua.includes('firefox/')
        ? 'Firefox'
        : ua.includes('safari/')
          ? 'Safari'
          : 'Unknown browser'

  const os = ua.includes('windows')
    ? 'Windows'
    : ua.includes('mac os') || ua.includes('macintosh')
      ? 'macOS'
      : ua.includes('android')
        ? 'Android'
        : ua.includes('iphone') || ua.includes('ipad')
          ? 'iOS/iPadOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Unknown device'

  return `${browser} on ${os}`
}

export async function sendAdminLoginAlert(input: {
  adminEmail: string
  ip: string
  userAgent: string
}) {
  const resend = getResendClient()
  if (!resend) return

  const recipient = process.env.ADMIN_SECURITY_EMAIL?.trim() || input.adminEmail
  if (!recipient) return

  const time = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Asia/Manila',
  }).format(new Date())

  const safeIp = input.ip.replace(/[\r\n]/g, ' ').slice(0, 100)
  const device = describeDevice(input.userAgent.replace(/[\r\n]/g, ' ').slice(0, 500))

  try {
    const subject = 'New Admin Login Detected'
    const body = [
      'A new login to your Fico Mana admin account was detected.',
      '',
      `Time: ${time} PHT`,
      `IP Address: ${safeIp}`,
      `Device: ${device}`,
      '',
      'If this was you, no action is required.',
      'If you do not recognize this login, secure your account immediately.',
    ].join('\n')
    const { data, error } = await resend.emails.send({
      from: getResendFromAddress(),
      to: recipient,
      subject,
      text: body,
    })

    if (error || !data?.id) console.error('Admin login alert email failed')
    else await persistEmailLog({
      bookingId: 'SECURITY', recipientEmail: recipient, subject,
      body: `<pre>${body.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character] || character)}</pre>`,
      status: 'SENT', providerId: data.id,
    })
  } catch {
    // Alert delivery is best-effort and must not invalidate a successful login.
    console.error('Admin login alert email unavailable')
  }
}
