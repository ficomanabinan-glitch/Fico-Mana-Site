import { NextResponse } from 'next/server'
import { emailsMatch, loadBookingById, toPublicResubmitBooking } from '@/lib/booking-load'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { rejectUntrustedMutation } from '@/lib/security/request-security'
import { publicBookingLookupSchema } from '@/lib/security/schemas'

export async function POST(request: Request) {
  try {
    const originError = rejectUntrustedMutation(request)
    if (originError) return originError
    const parsed = publicBookingLookupSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Booking reference and email are required.' }, { status: 400 })
    }
    const { id, email } = parsed.data
    const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.bookingLookup, [id, email])
    if (limited) return limited

    const booking = await loadBookingById(id)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found. Check your reference and email.' }, { status: 404 })
    }

    if (!emailsMatch(booking.customerEmail, email)) {
      return NextResponse.json({ error: 'Booking not found. Check your reference and email.' }, { status: 404 })
    }

    if (booking.bookingStatus !== 'Pending Payment') {
      return NextResponse.json(
        {
          error:
            booking.bookingStatus === 'Pending Verification'
              ? 'Your receipt is already under review. No action needed.'
              : `This booking is ${booking.bookingStatus}. Receipt resubmit is not available.`,
          bookingStatus: booking.bookingStatus,
        },
        { status: 409 },
      )
    }

    return NextResponse.json(toPublicResubmitBooking(booking))
  } catch (error) {
    console.error('POST /api/bookings/lookup', error)
    return NextResponse.json({ error: 'Failed to look up booking.' }, { status: 500 })
  }
}
