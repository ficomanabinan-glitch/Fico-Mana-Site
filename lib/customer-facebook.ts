/**
 * Accept the way customers commonly paste Facebook links while keeping the
 * stored value as an absolute HTTPS URL.
 */
export function normalizeCustomerFacebookUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || !url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}
