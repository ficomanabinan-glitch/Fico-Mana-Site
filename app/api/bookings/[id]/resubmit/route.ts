import { NextResponse } from 'next/server'
import type { Booking } from '@/lib/data-store'
import { emailsMatch, loadBookingById } from '@/lib/booking-load'
import { upsertBooking, addServerNotification } from '@/lib/server-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { saveBookingToDb, addNotificationToDb } from '@/lib/supabase-store'
import { sendBookingSubmittedEmail } from '@/lib/email'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { rejectUntrustedMutation } from '@/lib/security/request-security'
import { publicReceiptResubmitSchema } from '@/lib/security/schemas'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const originError = rejectUntrustedMutation(request)
    if (originError) return originError
    const parsed = publicReceiptResubmitSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email and receipt are required.' }, { status: 400 })
    }
    const { email, receiptUrl, transactionRef } = parsed.data
    const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.receiptUpload, [id, email, 'resubmit'])
    if (limited) return limited

    const booking = await loadBookingById(id)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (!emailsMatch(booking.customerEmail, email)) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (booking.bookingStatus !== 'Pending Payment') {
      return NextResponse.json(
        { error: 'This booking is not awaiting a new receipt.' },
        { status: 409 },
      )
    }

    const updatedBooking: Booking = {
      ...booking,
      receiptUrl,
      transactionRef: transactionRef || booking.transactionRef,
      bookingStatus: 'Pending Verification',
      paymentStatus: 'Pending Verification',
    }

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (admin) {
        const saved = await saveBookingToDb(admin, updatedBooking)
        if (saved) {
          await upsertBooking(saved)
          const msg = `${booking.customerName} resubmitted a receipt for booking ${booking.id}.`
          await addNotificationToDb(admin, booking.id, 'RESUBMITTED', msg)
          await sendBookingSubmittedEmail(saved).catch(console.error)
          return NextResponse.json({
            id: saved.id,
            bookingStatus: saved.bookingStatus,
            message: 'Receipt submitted. Our team will review it shortly.',
          })
        }
      }
    }

    const saved = await upsertBooking(updatedBooking)
    const msg = `${booking.customerName} resubmitted a receipt for booking ${booking.id}.`
    await addServerNotification(booking.id, 'RESUBMITTED', msg)
    await sendBookingSubmittedEmail(saved).catch(console.error)

    return NextResponse.json({
      id: saved.id,
      bookingStatus: saved.bookingStatus,
      message: 'Receipt submitted. Our team will review it shortly.',
    })
  } catch (error) {
    console.error('POST /api/bookings/[id]/resubmit', error)
    return NextResponse.json({ error: 'Failed to resubmit receipt.' }, { status: 500 })
  }
}
