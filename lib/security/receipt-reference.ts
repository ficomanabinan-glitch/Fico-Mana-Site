const RECEIPT_API_PREFIX = '/api/receipts/'

export function receiptAccessUrl(reference: string | null | undefined) {
  const value = reference?.trim() || ''
  if (!value) return ''
  if (value.startsWith(RECEIPT_API_PREFIX)) return value
  return `${RECEIPT_API_PREFIX}view?ref=${encodeURIComponent(value)}`
}

export function receiptDownloadUrl(reference: string | null | undefined) {
  const url = receiptAccessUrl(reference)
  if (!url) return ''
  return `${url}${url.includes('?') ? '&' : '?'}download=1`
}

export function receiptReferenceId(reference: string) {
  if (!reference.startsWith(RECEIPT_API_PREFIX)) return null
  const id = reference.slice(RECEIPT_API_PREFIX.length).split(/[?#]/)[0]
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null
}

export function storagePathFromLegacyReceiptUrl(reference: string) {
  try {
    const url = new URL(reference)
    const marker = '/storage/v1/object/public/receipts/'
    const at = url.pathname.indexOf(marker)
    if (at < 0) return null
    const path = decodeURIComponent(url.pathname.slice(at + marker.length))
    if (!path || path.includes('..') || path.includes('\\') || path.startsWith('/')) return null
    return path
  } catch {
    return null
  }
}
