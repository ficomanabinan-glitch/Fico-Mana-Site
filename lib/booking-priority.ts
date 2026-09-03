import type { Booking } from '@/lib/data-store'
import { usesMakeupSlots } from '@/lib/booking-packages'
import { ALL_MANA_SLOTS, findSlotByBookingTime, getSlotId } from '@/lib/booking-slots'

function parseClockToMinutes(raw: string): number | null {
  const text = (raw || '').trim()
  if (!text) return null

  const match = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3]?.toUpperCase()

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null

  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0

  return hours * 60 + minutes
}

/** Lower = earlier in the day. Used to auto-assign Client 1, 2, … */
export function getBookingTimeRank(booking: Pick<Booking, 'slotId' | 'bookingTime' | 'arrivalTime' | 'shootTime' | 'packageId'>): number {
  const slotId = getSlotId(booking as Booking) || findSlotByBookingTime(booking.bookingTime || '')?.id
  if (slotId) {
    const idx = ALL_MANA_SLOTS.findIndex((slot) => slot.id === slotId)
    if (idx >= 0) return idx
  }

  const fromArrival = parseClockToMinutes(booking.arrivalTime || '')
  if (fromArrival != null) return 1000 + fromArrival

  const fromShoot = parseClockToMinutes(booking.shootTime || '')
  if (fromShoot != null) return 1000 + fromShoot

  const fromLabel = parseClockToMinutes(booking.bookingTime || '')
  if (fromLabel != null) return 1000 + fromLabel

  // FICO / flexible day slots share one label — keep them after timed MANA slots, ordered later by createdAt
  if (!usesMakeupSlots(booking.packageId)) return 5000

  return 9000
}

export function isPriorityEligible(booking: Pick<Booking, 'bookingStatus'>): boolean {
  return booking.bookingStatus !== 'Cancelled' && booking.bookingStatus !== 'Rejected'
}

export function compareBySessionTime(a: Booking, b: Booking): number {
  const rankDiff = getBookingTimeRank(a) - getBookingTimeRank(b)
  if (rankDiff !== 0) return rankDiff
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

/**
 * Client number map per shoot day: earliest session time → Client 1, next → Client 2, etc.
 * Cancelled/rejected bookings are omitted (no number).
 */
export function buildDayPriorityMap(bookings: Booking[]): Map<string, number> {
  const byDate = new Map<string, Booking[]>()

  for (const booking of bookings) {
    if (!isPriorityEligible(booking) || !booking.bookingDate) continue
    const list = byDate.get(booking.bookingDate) || []
    list.push(booking)
    byDate.set(booking.bookingDate, list)
  }

  const priorities = new Map<string, number>()
  for (const list of byDate.values()) {
    list.sort(compareBySessionTime)
    list.forEach((booking, index) => {
      priorities.set(booking.id, index + 1)
    })
  }

  return priorities
}

/** Count of priority-eligible clients on a given date (dropdown max). */
export function getDayPriorityCount(bookings: Booking[], date: string): number {
  return bookings.filter((b) => b.bookingDate === date && isPriorityEligible(b)).length
}

/** Sort by shoot date (asc), then auto priority (asc). Cancelled/rejected sink to the bottom of their day. */
export function sortBookingsByDayPriority(bookings: Booking[]): Booking[] {
  const priorities = buildDayPriorityMap(bookings)

  return [...bookings].sort((a, b) => {
    const dateCmp = (a.bookingDate || '').localeCompare(b.bookingDate || '')
    if (dateCmp !== 0) return dateCmp

    const aEligible = isPriorityEligible(a) ? 0 : 1
    const bEligible = isPriorityEligible(b) ? 0 : 1
    if (aEligible !== bEligible) return aEligible - bEligible

    const pa = priorities.get(a.id) ?? 9999
    const pb = priorities.get(b.id) ?? 9999
    if (pa !== pb) return pa - pb

    return compareBySessionTime(a, b)
  })
}
