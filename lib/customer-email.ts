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
