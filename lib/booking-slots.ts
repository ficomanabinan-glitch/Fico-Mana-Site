import type { Booking } from '@/lib/data-store'
import type { BlockedSlot } from '@/lib/blocked-slots'
import { isSlotBlocked } from '@/lib/blocked-slots'
import type { FicoSpotBlock } from '@/lib/fico-spot-blocks'
import { getFicoBookableLimit } from '@/lib/fico-spot-blocks'
import { usesMakeupSlots } from '@/lib/booking-packages'

export const FICO_DAILY_LIMIT = 10
export const MAKEUP_SLOTS_PER_SESSION = 2
/** One client per Slot 1 / Slot 2 — prevents double booking on the public calendar. */
export const BOOKINGS_PER_SLOT = 1
export const ARRIVAL_CUTOFF = '4:00 PM'
export const FICO_STUDIO_OPEN = '8:00 AM'
export const FICO_STUDIO_HOURS = `${FICO_STUDIO_OPEN} – ${ARRIVAL_CUTOFF}`
export const FICO_AVAILABILITY_LABEL = `Available anytime from ${FICO_STUDIO_HOURS}`
export const ARRIVAL_BUFFER_MINUTES = 15

export type SessionSlot = {
  id: string
  sessionId: string
  blockLabel: string
  slotLabel: string
  arrivalTime: string
  shootTime: string
  endTime: string
}

export type ManaSessionBlock = {
  timeLabel: string
  sessionId: string
  slots: SessionSlot[]
}

function makeManaSlot(
  sessionId: string,
  blockLabel: string,
  slotNum: number,
  arrivalTime: string,
  shootTime: string,
  endTime: string,
): SessionSlot {
  return {
    id: `m-${sessionId}-s${slotNum}`,
    sessionId,
    blockLabel,
    slotLabel: `SLOT ${slotNum}`,
    arrivalTime,
    shootTime,
    endTime,
  }
}

function makeManaSession(
  sessionId: string,
  blockLabel: string,
  arrivalTime: string,
  shootTime: string,
  endTime: string,
): ManaSessionBlock {
  return {
    timeLabel: blockLabel,
    sessionId,
    slots: Array.from({ length: MAKEUP_SLOTS_PER_SESSION }, (_, index) =>
      makeManaSlot(sessionId, blockLabel, index + 1, arrivalTime, shootTime, endTime),
    ),
  }
}

export const MANA_SESSION_BLOCKS: ManaSessionBlock[] = [
  makeManaSession('0800-0930', '8:00 AM - 9:30 AM', '7:45 AM', '8:00 AM', '9:30 AM'),
  makeManaSession('0930-1100', '9:30 AM - 11:00 AM', '9:15 AM', '9:30 AM', '11:00 AM'),
  makeManaSession('1100-1230', '11:00 AM - 12:30 PM', '10:45 AM', '11:00 AM', '12:30 PM'),
  makeManaSession('1330-1500', '1:30 PM - 3:00 PM', '1:15 PM', '1:30 PM', '3:00 PM'),
  makeManaSession('1500-1630', '3:00 PM - 4:30 PM', '2:45 PM', '3:00 PM', '4:30 PM'),
]

export const ALL_MANA_SLOTS: SessionSlot[] = MANA_SESSION_BLOCKS.flatMap((b) => [...b.slots])

/** @deprecated use ALL_MANA_SLOTS */
export const ALL_SLOTS = ALL_MANA_SLOTS

/** @deprecated use MANA_SESSION_BLOCKS */
export const SLOT_BLOCKS = MANA_SESSION_BLOCKS

/** @deprecated use ALL_MANA_SLOTS */
export const MAKEUP_SLOTS = ALL_MANA_SLOTS

export type MakeupSlot = SessionSlot

export const FICO_BOOKING_TIME_LABEL = `Available Time: ${FICO_STUDIO_HOURS}`
export const FICO_ARRIVAL_LABEL = FICO_AVAILABILITY_LABEL
export const FICO_SHOOT_TIME_LABEL = FICO_AVAILABILITY_LABEL

export function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isActiveBooking(booking: Booking): boolean {
  return booking.bookingStatus !== 'Cancelled' && booking.bookingStatus !== 'Rejected'
}

export function getBookingsForDate(bookings: Booking[], dateKey: string): Booking[] {
  return bookings.filter((b) => b.bookingDate === dateKey && isActiveBooking(b))
}

/** Parse "9:30 AM" / "14:00" style strings to minutes from midnight. */
export function parseTimeToMinutes(value: string): number | null {
  const text = value.trim()
  const ampm = text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i)
  if (ampm) {
    let hour = parseInt(ampm[1], 10)
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0
    const period = ampm[3].toUpperCase()
    if (period === 'PM' && hour < 12) hour += 12
    if (period === 'AM' && hour === 12) hour = 0
    return hour * 60 + min
  }
  const h24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (h24) {
    return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10)
  }
  return null
}

/**
 * Map a free-text appointment time onto the current MANA session block.
 * Times in the lunch gap (after 12:30, before 1:30) snap to nearest block.
 */
export function findManaSessionForTime(timeText: string): ManaSessionBlock | null {
  const minutes = parseTimeToMinutes(timeText)
  if (minutes == null) return null

  for (const block of MANA_SESSION_BLOCKS) {
    const start = parseTimeToMinutes(block.slots[0].shootTime)
    const end = parseTimeToMinutes(block.slots[0].endTime)
    if (start == null || end == null) continue
    if (minutes >= start && minutes < end) return block
  }

  // Boundary: exact end time of a block usually starts the next one
  for (let i = 0; i < MANA_SESSION_BLOCKS.length; i++) {
    const block = MANA_SESSION_BLOCKS[i]
    const end = parseTimeToMinutes(block.slots[0].endTime)
    if (end != null && minutes === end && MANA_SESSION_BLOCKS[i + 1]) {
      return MANA_SESSION_BLOCKS[i + 1]
    }
  }

  // Snap gap / nearby times to closest session start
  let best: ManaSessionBlock | null = null
  let bestDist = Infinity
  for (const block of MANA_SESSION_BLOCKS) {
    const start = parseTimeToMinutes(block.slots[0].shootTime)
    if (start == null) continue
    const dist = Math.abs(minutes - start)
    if (dist < bestDist) {
      bestDist = dist
      best = block
    }
  }
  return bestDist <= 90 ? best : null
}

/** Map legacy slot IDs (pre 90-min blocks) onto the current schedule. */
export function mapLegacySlotId(slotId: string): string | null {
  const legacy: Record<string, string> = {
    'm-08-10-s1': 'm-0800-0930-s1',
    'm-08-10-s2': 'm-0800-0930-s2',
    'm-10-12-s1': 'm-0930-1100-s1',
    'm-10-12-s2': 'm-0930-1100-s2',
    'm-13-15-s1': 'm-1330-1500-s1',
    'm-13-15-s2': 'm-1330-1500-s2',
    'm-15-17-s1': 'm-1500-1630-s1',
    'm-15-17-s2': 'm-1500-1630-s2',
  }
  return legacy[slotId] ?? null
}

/**
 * Resolve which MANA slot a booking occupies.
 * Prefers stored slotId, then formatted time label, then free-text time → session (+ slot label if present).
 */
export function getSlotId(booking: Booking): string | null {
  if (booking.slotId) {
    const direct = ALL_MANA_SLOTS.find((slot) => slot.id === booking.slotId)
    if (direct) return direct.id
    const mapped = mapLegacySlotId(booking.slotId)
    if (mapped && ALL_MANA_SLOTS.some((s) => s.id === mapped)) return mapped
  }

  const time = booking.bookingTime || ''
  const labelMatch = ALL_MANA_SLOTS.find(
    (slot) => time.includes(slot.blockLabel) && time.includes(slot.slotLabel),
  )
  if (labelMatch) return labelMatch.id

  const blockOnly = ALL_MANA_SLOTS.find((slot) => time.includes(slot.blockLabel))
  if (blockOnly) {
    const slotNum = time.match(/SLOT\s*(\d+)/i)
    if (slotNum) {
      const wanted = `m-${blockOnly.sessionId}-s${slotNum[1]}`
      if (ALL_MANA_SLOTS.some((s) => s.id === wanted)) return wanted
    }
    return blockOnly.id // default Slot 1 of that block
  }

  const session = findManaSessionForTime(time)
  if (!session) return null
  const slotNum = time.match(/SLOT\s*(\d+)/i)
  if (slotNum) {
    const wanted = session.slots.find((s) => s.slotLabel === `SLOT ${slotNum[1]}`)
    if (wanted) return wanted.id
  }
  return session.slots[0]?.id ?? null
}

/** @deprecated use getSlotId */
export function getMakeupSlotId(booking: Booking): string | null {
  return getSlotId(booking)
}

export function getFicoBookingCount(bookings: Booking[], dateKey: string): number {
  return getBookingsForDate(bookings, dateKey).filter((b) => !usesMakeupSlots(b.packageId)).length
}

export function getFicoRemainingCapacity(
  bookings: Booking[],
  dateKey: string,
  ficoSpotBlocks: FicoSpotBlock[] = [],
): number {
  const limit = getFicoBookableLimit(ficoSpotBlocks, dateKey)
  return Math.max(0, limit - getFicoBookingCount(bookings, dateKey))
}

export function isFicoDateFull(
  bookings: Booking[],
  dateKey: string,
  ficoSpotBlocks: FicoSpotBlock[] = [],
): boolean {
  return getFicoRemainingCapacity(bookings, dateKey, ficoSpotBlocks) <= 0
}

export function getMakeupBookingsCount(bookings: Booking[], dateKey: string): number {
  return getBookingsForDate(bookings, dateKey).filter((b) => usesMakeupSlots(b.packageId)).length
}

export function getMakeupSlotBookingCount(
  bookings: Booking[],
  dateKey: string,
  slotId: string,
): number {
  return getBookingsForDate(bookings, dateKey).filter(
    (b) => usesMakeupSlots(b.packageId) && getSlotId(b) === slotId,
  ).length
}

/**
 * Pick the least-filled open slot in a session for backfill / assignment.
 * Returns null when the whole session is at capacity.
 */
export function pickOpenSlotInSession(
  bookings: Booking[],
  dateKey: string,
  sessionId: string,
): SessionSlot | null {
  const block = getSessionBlockById(sessionId)
  if (!block) return null
  let best: SessionSlot | null = null
  let bestCount = Infinity
  for (const slot of block.slots) {
    const count = getMakeupSlotBookingCount(bookings, dateKey, slot.id)
    if (count >= BOOKINGS_PER_SLOT) continue
    if (count < bestCount) {
      bestCount = count
      best = slot
    }
  }
  return best
}

/** Returns remaining capacity for a slot (out of BOOKINGS_PER_SLOT). */
export function getMakeupSlotRemainingCapacity(
  bookings: Booking[],
  dateKey: string,
  slotId: string,
): number {
  return Math.max(0, BOOKINGS_PER_SLOT - getMakeupSlotBookingCount(bookings, dateKey, slotId))
}

/** True when the slot already has a client booking (capacity reached). */
export function isMakeupSlotFull(bookings: Booking[], dateKey: string, slotId: string): boolean {
  return getMakeupSlotBookingCount(bookings, dateKey, slotId) >= BOOKINGS_PER_SLOT
}

/** @deprecated use isMakeupSlotFull — kept for compatibility */
export function isMakeupSlotTaken(bookings: Booking[], dateKey: string, slotId: string): boolean {
  return isMakeupSlotFull(bookings, dateKey, slotId)
}

export function isMakeupDateFull(bookings: Booking[], dateKey: string): boolean {
  return ALL_MANA_SLOTS.every((slot) => isMakeupSlotTaken(bookings, dateKey, slot.id))
}

export function isDateFullForPackage(
  bookings: Booking[],
  dateKey: string,
  packageId: string,
  ficoSpotBlocks: FicoSpotBlock[] = [],
): boolean {
  return usesMakeupSlots(packageId)
    ? isMakeupDateFull(bookings, dateKey)
    : isFicoDateFull(bookings, dateKey, ficoSpotBlocks)
}

export function getSessionBlockById(sessionId: string): ManaSessionBlock | undefined {
  return MANA_SESSION_BLOCKS.find((block) => block.sessionId === sessionId)
}

export function getSessionBlockForSlot(slotId: string): ManaSessionBlock | undefined {
  const slot = getSlotById(slotId)
  if (!slot) return undefined
  return getSessionBlockById(slot.sessionId)
}

export function isMakeupSessionFull(
  bookings: Booking[],
  dateKey: string,
  sessionId: string,
): boolean {
  const block = getSessionBlockById(sessionId)
  if (!block) return false
  return block.slots.every((slot) => isMakeupSlotTaken(bookings, dateKey, slot.id))
}

export function isSlotTaken(bookings: Booking[], dateKey: string, slotId: string): boolean {
  return isMakeupSlotTaken(bookings, dateKey, slotId)
}

/** Booked or admin-blocked — slot cannot be selected. */
export function isSlotUnavailable(
  bookings: Booking[],
  blockedSlots: BlockedSlot[],
  dateKey: string,
  slotId: string,
): boolean {
  return isMakeupSlotTaken(bookings, dateKey, slotId) || isSlotBlocked(blockedSlots, dateKey, slotId)
}

export function getSlotById(slotId: string): SessionSlot | undefined {
  return ALL_MANA_SLOTS.find((slot) => slot.id === slotId)
}

/** @deprecated use getSlotById */
export function getMakeupSlotById(slotId: string): SessionSlot | undefined {
  return getSlotById(slotId)
}

export function formatSlotBookingTime(slot: SessionSlot): string {
  return `${slot.blockLabel} · ${slot.slotLabel}`
}

/** Resolve a MANA slot from a booking time label (ignores stored slotId). */
export function findSlotByBookingTime(bookingTime: string): SessionSlot | undefined {
  const time = (bookingTime || '').trim()
  if (!time) return undefined

  const exact = ALL_MANA_SLOTS.find((slot) => formatSlotBookingTime(slot) === time)
  if (exact) return exact

  const labelMatch = ALL_MANA_SLOTS.find(
    (slot) => time.includes(slot.blockLabel) && time.includes(slot.slotLabel),
  )
  if (labelMatch) return labelMatch

  return undefined
}

/** @deprecated use formatSlotBookingTime */
export function formatMakeupBookingTime(slot: SessionSlot): string {
  return formatSlotBookingTime(slot)
}

export const LATE_FEE_AMOUNT = 500
export const LATE_FEE_POLICY =
  'Clients arriving more than 15 minutes after their scheduled arrival time may incur a ₱500 late fee or forfeit their slot at staff discretion.'
