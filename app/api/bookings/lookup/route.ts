import { NextResponse } from 'next/server'
import { emailsMatch, loadBookingById, toPublicResubmitBooking } from '@/lib/booking-load'

type Body = {
  id?: string
  email?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const id = body.id?.trim()
    const email = body.email?.trim()

    if (!id || !email) {
      return NextResponse.json({ error: 'Booking reference and email are required.' }, { status: 400 })
    }

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
