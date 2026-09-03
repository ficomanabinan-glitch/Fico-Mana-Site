/** Canonical public domain for emails, deep links, and SEO (no trailing slash). */
export const CANONICAL_SITE_URL = 'https://ficomana.studio'

function normalizePublicSiteUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const url = raw.trim().replace(/\/$/, '')
  // Never put ephemeral *.vercel.app hosts in customer-facing links
  if (url.includes('vercel.app')) return null
  return url
}

/** Public site URL for emails and deep links (no trailing slash). */
export function getSiteUrl(): string {
  const fromEnv = normalizePublicSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === 'production') return CANONICAL_SITE_URL
  return 'http://localhost:3000'
}

export function resubmitBookingUrl(bookingId: string): string {
  return `${getSiteUrl()}/?booking=${encodeURIComponent(bookingId)}#resubmit`
}

export function submitRawPhotoUrl(bookingId: string): string {
  return `${getSiteUrl()}/submit-raw-photo?booking=${encodeURIComponent(bookingId)}`
}
