const BOOKING_ID_PATTERN = /^FM-\d{6}$/
const RECEIPT_REF_PATTERN = /^FM-RCP-(\d{6})-\d+$/i

export function isValidBookingId(id: string): boolean {
  return BOOKING_ID_PATTERN.test(id)
}

/** Map booking ref, receipt no. (FM-RCP-XXXXXX-####), or bare digits to FM-XXXXXX. */
export function resolveBookingReference(input: string): string {
  const trimmed = input.trim().toUpperCase()
  if (trimmed.startsWith('FM-W')) return trimmed

  const receiptMatch = trimmed.match(RECEIPT_REF_PATTERN)
  if (receiptMatch) return `FM-${receiptMatch[1]}`

  if (/^\d{6}$/.test(trimmed)) return `FM-${trimmed}`

  return trimmed
}

/** Generates a unique FM-XXXXXX reference checked against existing booking IDs. */
export function generateBookingId(existingIds: string[] = []): string {
  const taken = new Set(existingIds)

  for (let attempt = 0; attempt < 100; attempt++) {
    const id = `FM-${Math.floor(100000 + Math.random() * 900000)}`
    if (!taken.has(id)) return id
  }

  // Extremely unlikely fallback — still matches FM-XXXXXX format
  let fallback = `FM-${Date.now().toString().slice(-6)}`
  while (taken.has(fallback)) {
    fallback = `FM-${Math.floor(100000 + Math.random() * 900000)}`
  }
  return fallback
}
