/** Client-safe email helpers (no Node / Resend imports). */

export function isPlaceholderCustomerEmail(email: string | undefined): boolean {
  const value = (email || '').trim().toLowerCase()
  if (!value) return true
  return (
    value === 'imported@ficomana.studio' ||
    value === 'walkin@ficomana.local' ||
    value.endsWith('@placeholder.local') ||
    value.endsWith('@ficomana.local')
  )
}

/** Compare the confirmation using the same case normalization as the booking API. */
export function customerEmailsMatch(email: string, confirmation: string): boolean {
  return Boolean(email.trim() && confirmation.trim()) && email.trim().toLowerCase() === confirmation.trim().toLowerCase()
}

/** Lightweight browser-safe validation; the API performs the authoritative Zod validation. */
export function isValidCustomerEmail(email: string | undefined): boolean {
  const value = (email || '').trim()
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value)
}
