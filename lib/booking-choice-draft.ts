/** Non-sensitive, opt-in-resumed choices only. Never persist customer, payment or reservation data. */
export const BOOKING_CHOICE_DRAFT_KEY = 'fico-booking-choices-v1'
export const BOOKING_CHOICE_DRAFT_TTL = 60 * 60 * 1000
export type BookingChoiceDraft = { packageId: string; date: string | null; savedAt: number }
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function validDate(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function clearBookingChoiceDraft(storage: DraftStorage) {
  try { storage.removeItem(BOOKING_CHOICE_DRAFT_KEY) } catch { /* Storage denial must not block booking. */ }
}

export function readBookingChoiceDraft(storage: DraftStorage, now = Date.now()): BookingChoiceDraft | null {
  try {
    const raw = storage.getItem(BOOKING_CHOICE_DRAFT_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (!value || value.version !== 1 || Object.keys(value).some(key => !['version','packageId','date','savedAt'].includes(key)) ||
      typeof value.packageId !== 'string' || !/^[\w-]{1,128}$/.test(value.packageId) || !validDate(value.date) ||
      !Number.isFinite(value.savedAt) || value.savedAt > now || now - value.savedAt >= BOOKING_CHOICE_DRAFT_TTL) {
      clearBookingChoiceDraft(storage); return null
    }
    return { packageId: value.packageId, date: value.date, savedAt: value.savedAt }
  } catch { clearBookingChoiceDraft(storage); return null }
}

export function saveBookingChoiceDraft(storage: DraftStorage, choices: Pick<BookingChoiceDraft, 'packageId' | 'date'>, now = Date.now()) {
  if (!/^[\w-]{1,128}$/.test(choices.packageId) || !validDate(choices.date) || !Number.isFinite(now)) return
  try {
    // Explicit projection prevents callers from accidentally storing contact/payment fields.
    storage.setItem(BOOKING_CHOICE_DRAFT_KEY, JSON.stringify({ version: 1, packageId: choices.packageId, date: choices.date, savedAt: now }))
  } catch { /* Private browsing/quota failures leave the ordinary wizard usable. */ }
}
