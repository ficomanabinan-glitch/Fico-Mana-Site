import { NextResponse } from 'next/server'
import { emailsMatch, loadBookingById } from '@/lib/booking-load'

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

    // Clients can submit a raw photo selection only if the booking is Confirmed or Completed.
    if (booking.bookingStatus !== 'Confirmed' && booking.bookingStatus !== 'Completed') {
      return NextResponse.json(
        {
          error: `Raw photo selection is only available for Confirmed or Completed bookings. Your current booking status is: ${booking.bookingStatus}.`,
        },
        { status: 409 },
      )
    }

    // The studio must have shared the drive link containing all their raw photos first.
    if (!booking.driveLink) {
      return NextResponse.json(
        {
          error: 'Your Google Drive gallery link is not yet ready. Once the studio uploads your raw shots and emails you the link, you can select and submit your photo here.',
        },
        { status: 409 },
      )
    }

    return NextResponse.json({
      id: booking.id,
      customerName: booking.customerName,
      packageName: booking.packageName,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      bookingStatus: booking.bookingStatus,
      driveLink: booking.driveLink,
      rawPhotoLink: booking.rawPhotoLink || '',
      rawPhotoStatus: booking.rawPhotoStatus || '',
      rawPhotoNotes: booking.rawPhotoNotes || '',
    })
  } catch (error) {
    console.error('POST /api/bookings/lookup-raw-photo', error)
    return NextResponse.json({ error: 'Failed to look up booking.' }, { status: 500 })
  }
}
