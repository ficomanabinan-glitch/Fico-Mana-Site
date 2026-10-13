import { NextResponse } from 'next/server'
import { listBookings } from '@/lib/server-store'
import { isSupabaseConfigured } from '@/lib/supabase'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { toAvailability } from '@/lib/auth-api'
import type { Booking } from '@/lib/data-store'
import { getSlotId } from '@/lib/booking-slots'
import { usesMakeupSlots } from '@/lib/booking-packages'
import { AVAILABILITY_UNAVAILABLE_MESSAGE, loadDatabaseAvailabilityBookings } from '@/lib/booking-availability-read'

function bookingToAvailability(b: Booking) {
  const resolvedSlotId = usesMakeupSlots(b.packageId, b.packageSlotType) ? getSlotId(b) ?? b.slotId : b.slotId
  return toAvailability({
    id: b.id,
    bookingDate: b.bookingDate,
    slotId: resolvedSlotId,
    bookingTime: b.bookingTime,
    packageId: b.packageId,
    packageSlotType: b.packageSlotType,
    bookingStatus: b.bookingStatus,
  })
}

/** Public endpoint — returns only fields needed for slot/calendar availability. */
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      const fileBookings = await listBookings()
      return NextResponse.json(
        fileBookings.map((booking, index) => ({
          ...bookingToAvailability(booking),
          id: `availability-${index + 1}`,
        })),
      )
    }

    const bookings = await loadDatabaseAvailabilityBookings(getSupabaseAdmin())
    return NextResponse.json(
      bookings.map((booking, index) => ({
        ...bookingToAvailability(booking),
        id: `availability-${index + 1}`,
      })),
    )
  } catch (error) {
    console.error('GET /api/bookings/availability', error)
    return NextResponse.json({ error: AVAILABILITY_UNAVAILABLE_MESSAGE }, { status: 503 })
  }
}
