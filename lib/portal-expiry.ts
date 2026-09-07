export function hasPortalExpired(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return false
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs
}

export type PortalExpiry = { days: number; firstDownloadAt: string | null; expiresAt: string | null }

export function portalExpiryNotice(expiry: PortalExpiry, nowMs = Date.now()) {
  if (!expiry.expiresAt) return `Your portal and QR link will expire ${expiry.days} ${expiry.days === 1 ? 'day' : 'days'} after your first completed Download All. Viewing photos does not start the countdown.`
  const deadline = Date.parse(expiry.expiresAt)
  if (!Number.isFinite(deadline)) return 'The expiry date is unavailable. Try: refresh this page or contact FICO MANA.'
  const date = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(deadline)
  if (deadline <= nowMs) return `This portal and its QR link expired on ${date} (GMT+8). Contact FICO MANA if you need access again.`
  const remaining = Math.ceil((deadline - nowMs) / 86_400_000)
  return `This portal and its QR link expire on ${date} (GMT+8). ${remaining} ${remaining === 1 ? 'day' : 'days'} remaining. Save your photos before then. Downloading again does not extend access.`
}
