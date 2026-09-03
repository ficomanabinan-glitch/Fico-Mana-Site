import { NextResponse } from 'next/server'
import type { Booking } from '@/lib/data-store'
import { emailsMatch, loadBookingById } from '@/lib/booking-load'
import { upsertBooking, addServerNotification } from '@/lib/server-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { saveBookingToDb, addNotificationToDb } from '@/lib/supabase-store'
import { sendRawPhotoSubmittedEmails } from '@/lib/email'

type Body = {
  email?: string
  rawPhotoLink?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = (await request.json()) as Body
    const email = body.email?.trim()
    const rawPhotoLink = body.rawPhotoLink?.trim()

    if (!email || !rawPhotoLink) {
      return NextResponse.json({ error: 'Email and your Google Drive folder link are required.' }, { status: 400 })
    }

    // Basic GDrive link validation
    if (!rawPhotoLink.startsWith('https://drive.google.com/')) {
      return NextResponse.json({ error: 'Please enter a valid Google Drive link (starting with https://drive.google.com/).' }, { status: 400 })
    }

    const booking = await loadBookingById(id)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (!emailsMatch(booking.customerEmail, email)) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (booking.bookingStatus !== 'Confirmed' && booking.bookingStatus !== 'Completed') {
      return NextResponse.json(
        { error: 'This booking status does not allow raw photo submission.' },
        { status: 409 },
      )
    }

    if (!booking.driveLink) {
      return NextResponse.json(
        { error: 'Your Google Drive gallery link is not yet ready.' },
        { status: 409 },
      )
    }

    const updatedBooking: Booking = {
      ...booking,
      rawPhotoLink,
      rawPhotoStatus: 'Pending Review',
      rawPhotoSubmittedAt: new Date().toISOString(),
    }

    const notificationMessage = `Customer ${booking.customerName} submitted their folder of 5 chosen photos for booking ${booking.id}.`

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (admin) {
        const saved = await saveBookingToDb(admin, updatedBooking)
        if (saved) {
          await upsertBooking(saved)
          await addNotificationToDb(admin, booking.id, 'RAW_PHOTO_UPLOAD', notificationMessage)
          try {
            await sendRawPhotoSubmittedEmails(saved)
          } catch (emailErr) {
            console.error('sendRawPhotoSubmittedEmails failed:', emailErr)
          }
          return NextResponse.json({
            id: saved.id,
            rawPhotoStatus: saved.rawPhotoStatus,
            message: 'Your folder with 5 chosen photos was submitted successfully. Our editors will review it shortly.',
          })
        }
      }
    }

    const saved = await upsertBooking(updatedBooking)
    await addServerNotification(booking.id, 'RAW_PHOTO_UPLOAD', notificationMessage)
    try {
      await sendRawPhotoSubmittedEmails(saved)
    } catch (emailErr) {
      console.error('sendRawPhotoSubmittedEmails failed:', emailErr)
    }

    return NextResponse.json({
      id: saved.id,
      rawPhotoStatus: saved.rawPhotoStatus,
      message: 'Your folder with 5 chosen photos was submitted successfully. Our editors will review it shortly.',
    })
  } catch (error) {
    console.error('POST /api/bookings/[id]/submit-raw-photo', error)
    return NextResponse.json({ error: 'Failed to submit raw photo link.' }, { status: 500 })
  }
}
