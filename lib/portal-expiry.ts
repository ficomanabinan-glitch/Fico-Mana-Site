export function hasPortalExpired(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return false
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs
}

export type PortalExpiry = { days: number; portalReadyEmailSentAt: string | null; deliverablesUploadedAt?: string | null; expiresAt: string | null }

export function portalExpiryNotice(expiry: PortalExpiry, nowMs = Date.now()) {
  if (!expiry.expiresAt) return `Your ${expiry.days}-day portal access period begins when FICO MANA releases your final enhanced photographs. Selecting photos and receiving the portal-ready email do not start the countdown.`
  const deadline = Date.parse(expiry.expiresAt)
  if (!Number.isFinite(deadline)) return 'The expiry date is unavailable. Try: refresh this page or contact FICO MANA.'
  const date = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(deadline)
  if (deadline <= nowMs) return `This portal and its QR link expired on ${date} (GMT+8). Contact FICO MANA if you need access again.`
  const remaining = Math.ceil((deadline - nowMs) / 86_400_000)
  return `This portal and its QR link expire on ${date} (GMT+8). ${remaining} ${remaining === 1 ? 'day' : 'days'} remaining.`
}
