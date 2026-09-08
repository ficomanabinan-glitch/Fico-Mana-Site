export function hasPortalExpired(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return false
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs
}

// portalReadyEmailSentAt is kept for backwards-compatible sync payloads. It no
// longer controls the expiry window; expiry begins only after final delivery.
export type PortalExpiry = {
  days: number
  portalReadyEmailSentAt: string | null
  expiresAt: string | null
}

export function portalExpiryNotice(expiry: PortalExpiry, nowMs = Date.now()) {
  if (!expiry.expiresAt) return ''

  const deadline = Date.parse(expiry.expiresAt)
  if (!Number.isFinite(deadline)) {
    return 'The access deadline is unavailable. Try refreshing this page or contact FICO MANA.'
  }

  const date = new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(deadline)

  if (deadline <= nowMs) {
    return `Your final gallery access ended on ${date} (GMT+8). Contact FICO MANA if you need the project reopened.`
  }

  const remaining = Math.ceil((deadline - nowMs) / 86_400_000)
  return `Your final gallery is available until ${date} (GMT+8). The access period began when your editor delivered the finished files. ${remaining} ${remaining === 1 ? 'day' : 'days'} remaining.`
}
