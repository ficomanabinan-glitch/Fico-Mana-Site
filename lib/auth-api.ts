import { NextResponse } from 'next/server'
import { getStaffUser } from '@/lib/supabase/server'

export async function requireStaffAuth() {
  const user = await getStaffUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user, error: null }
}

/** Minimal booking fields safe to expose publicly for slot availability. */
export type BookingAvailability = {
  id: string
  bookingDate: string
  slotId?: string
  bookingTime?: string
  packageId: string
  bookingStatus: string
}

export function toAvailability(booking: {
  id: string
  bookingDate: string
  slotId?: string
  bookingTime?: string
  packageId: string
  bookingStatus: string
}): BookingAvailability {
  return {
    id: booking.id,
    bookingDate: booking.bookingDate,
    slotId: booking.slotId,
    bookingTime: booking.bookingTime,
    packageId: booking.packageId,
    bookingStatus: booking.bookingStatus,
  }
}
