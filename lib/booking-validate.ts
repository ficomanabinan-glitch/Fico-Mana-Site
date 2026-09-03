import type { Booking } from '@/lib/data-store'
import type { BlockedSlot } from '@/lib/blocked-slots'
import { isSlotBlocked } from '@/lib/blocked-slots'
import type { FicoSpotBlock } from '@/lib/fico-spot-blocks'
import { usesMakeupSlots } from '@/lib/booking-packages'
import {
  findSlotByBookingTime,
  isActiveBooking,
  isDateFullForPackage,
  isSlotTaken,
} from '@/lib/booking-slots'

type AvailabilityBooking = Pick<
  Booking,
  'id' | 'bookingDate' | 'slotId' | 'packageId' | 'bookingStatus' | 'bookingTime'
>

/** Server-side slot / capacity check before accepting a booking. */
export function validateBookingAvailability(
  booking: AvailabilityBooking,
  existing: AvailabilityBooking[],
  options?: { isUpdate?: boolean; blockedSlots?: BlockedSlot[]; ficoSpotBlocks?: FicoSpotBlock[] },
): { ok: true } | { ok: false; error: string } {
  if (booking.bookingStatus === 'Cancelled' || booking.bookingStatus === 'Rejected') {
    return { ok: true }
  }

  // Updates that keep the same slot are skipped by the API; when schedule changes,
  // still exclude this booking id so the current occupant isn't blocked by itself.
  const blocked = options?.blockedSlots ?? []
  const ficoSpotBlocks = options?.ficoSpotBlocks ?? []
  const others = existing.filter(
    (b) => b.id !== booking.id && isActiveBooking(b as Booking),
  )

  if (isDateFullForPackage(others as Booking[], booking.bookingDate, booking.packageId, ficoSpotBlocks)) {
    return { ok: false, error: 'This date is fully booked for the selected package.' }
  }

  if (usesMakeupSlots(booking.packageId)) {
    const slotId =
      booking.slotId ||
      findSlotByBookingTime(booking.bookingTime || '')?.id
    if (!slotId) {
      // Existing imported rows may lack slot_id — don't block staff updates on that alone.
      if (options?.isUpdate) return { ok: true }
      return { ok: false, error: 'A session slot is required for this package.' }
    }
    if (isSlotBlocked(blocked, booking.bookingDate, slotId)) {
      const reason = blocked.find((b) => b.date === booking.bookingDate && b.slotId === slotId)?.reason
      return {
        ok: false,
        error: reason ? `This slot is unavailable: ${reason}` : 'This session slot is unavailable.',
      }
    }
    if (isSlotTaken(others as Booking[], booking.bookingDate, slotId)) {
      return { ok: false, error: 'This session slot is no longer available.' }
    }
  }

  return { ok: true }
}
