import { NextResponse } from 'next/server'
import { listBookings } from '@/lib/server-store'
import { isSupabaseConfigured } from '@/lib/supabase'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { toAvailability } from '@/lib/auth-api'
import type { Booking } from '@/lib/data-store'
import { getSlotId } from '@/lib/booking-slots'
import { usesMakeupSlots } from '@/lib/booking-packages'

function mapDbBookingToAvailability(
  b: Record<string, unknown>,
  packageSlotTypes: Map<string, 'makeup' | 'standard'>,
) {
  const packageId = String(b.package_id)
  const draft = {
    id: String(b.id),
    bookingDate: String(b.booking_date),
    slotId: b.slot_id ? String(b.slot_id) : undefined,
    bookingTime: b.booking_time ? String(b.booking_time) : '',
    packageId,
    packageSlotType: packageSlotTypes.get(packageId),
    bookingStatus: String(b.booking_status) as Booking['bookingStatus'],
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerFbLink: '',
    customerFbName: '',
    packageName: '',
    depositAmount: 0,
    price: 0,
    paymentStatus: 'Unpaid' as const,
    createdAt: '',
    paymentHistory: [],
  } satisfies Booking

  // Resolve slot from time when slot_id is missing (imported / legacy rows)
  const resolvedSlotId =
    usesMakeupSlots(draft.packageId, draft.packageSlotType) ? getSlotId(draft) ?? draft.slotId : draft.slotId

  return toAvailability({
    id: draft.id,
    bookingDate: draft.bookingDate,
    slotId: resolvedSlotId,
    bookingTime: draft.bookingTime,
    packageId: draft.packageId,
    packageSlotType: draft.packageSlotType,
    bookingStatus: draft.bookingStatus,
  })
}

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
      return NextResponse.json(fileBookings.map(bookingToAvailability))
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
    }

    const [bookingsResult, packagesResult] = await Promise.all([
      admin
        .from('bookings')
        .select('id, booking_date, slot_id, booking_time, package_id, booking_status')
        .order('created_at', { ascending: false }),
      admin.from('packages').select('id, slot_type'),
    ])

    if (bookingsResult.error || !bookingsResult.data) {
      return NextResponse.json([])
    }

    const packageSlotTypes = new Map<string, 'makeup' | 'standard'>(
      (packagesResult.data ?? []).map((pkg) => [
        String(pkg.id),
        pkg.slot_type === 'makeup' ? 'makeup' : 'standard',
      ]),
    )

    return NextResponse.json(bookingsResult.data.map((booking) => mapDbBookingToAvailability(booking, packageSlotTypes)))
  } catch (error) {
    console.error('GET /api/bookings/availability', error)
    return NextResponse.json({ error: 'Failed to load availability' }, { status: 500 })
  }
}
