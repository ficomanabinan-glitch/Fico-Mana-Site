import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/supabase/server'

/** API authorization is server-side RBAC, not merely "has a Supabase session". */
export async function requireStaffAuth() {
  const user = await getAdminUser()
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
