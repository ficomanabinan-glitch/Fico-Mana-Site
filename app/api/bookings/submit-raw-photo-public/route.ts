import { NextResponse } from 'next/server'
import type { Booking } from '@/lib/data-store'
import { loadBookingById } from '@/lib/booking-load'
import { upsertBooking, addServerNotification, listBookings } from '@/lib/server-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { saveBookingToDb, addNotificationToDb, listBookingsFromDb } from '@/lib/supabase-store'
import { sendRawPhotoSubmittedEmails } from '@/lib/email'

type Body = {
  name?: string
  rawPhotoLink?: string
  bookingId?: string
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const aTokens = na.split(' ').filter(Boolean)
  const bTokens = nb.split(' ').filter(Boolean)
  if (aTokens.length < 2 || bTokens.length < 2) return false
  const [shorter, longer] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens]
  return shorter.every((token) => longer.includes(token))
}

async function loadAllBookings(): Promise<Booking[]> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const fromDb = await listBookingsFromDb(admin)
      if (fromDb) return fromDb
    }
  }
  return listBookings()
}

function eligibleForRawSubmit(booking: Booking): boolean {
  return booking.bookingStatus === 'Confirmed' || booking.bookingStatus === 'Completed'
}

async function saveRawSubmission(booking: Booking, rawPhotoLink: string): Promise<Booking> {
  const submittedAt = new Date().toISOString()
  const updatedBooking: Booking = {
    ...booking,
    rawPhotoLink,
    rawPhotoStatus: 'Pending Review',
    rawPhotoNotes: '',
    rawPhotoSubmittedAt: submittedAt,
  }

  const notificationMessage = `${booking.customerName} submitted a Google Drive selection for ${booking.id}.`

  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (!admin) {
      throw new Error('Database is configured but service role key is missing.')
    }

    // Targeted update — keeps other booking fields untouched and requires migration 011 columns.
    const { data, error } = await admin
      .from('bookings')
      .update({
        raw_photo_link: rawPhotoLink,
        raw_photo_status: 'Pending Review',
        raw_photo_notes: '',
        raw_photo_submitted_at: submittedAt,
      })
      .eq('id', booking.id)
      .select()
      .single()

    if (error) {
      console.error('raw photo DB update failed:', error.message, error.details, error.hint)
      // Fallback to full upsert (map includes raw photo columns)
      const saved = await saveBookingToDb(admin, updatedBooking)
      if (!saved) {
        throw new Error(
          `Database save failed: ${error.message}. Run migration 011_raw_photo_filtering.sql in Supabase if columns are missing.`,
        )
      }
      await upsertBooking(saved)
      await addNotificationToDb(admin, booking.id, 'RAW_PHOTO_UPLOAD', notificationMessage)
      try {
        await sendRawPhotoSubmittedEmails(saved)
      } catch (emailErr) {
        console.error('sendRawPhotoSubmittedEmails failed:', emailErr)
      }
      return saved
    }

    const saved: Booking = {
      ...updatedBooking,
      rawPhotoLink: data?.raw_photo_link ? String(data.raw_photo_link) : rawPhotoLink,
      rawPhotoStatus: (data?.raw_photo_status as Booking['rawPhotoStatus']) || 'Pending Review',
      rawPhotoSubmittedAt: data?.raw_photo_submitted_at
        ? String(data.raw_photo_submitted_at)
        : submittedAt,
    }

    await upsertBooking(saved)
    await addNotificationToDb(admin, booking.id, 'RAW_PHOTO_UPLOAD', notificationMessage)

    try {
      await sendRawPhotoSubmittedEmails(saved)
    } catch (emailErr) {
      console.error('sendRawPhotoSubmittedEmails failed:', emailErr)
    }

    return saved
  }

  const saved = await upsertBooking(updatedBooking)
  await addServerNotification(booking.id, 'RAW_PHOTO_UPLOAD', notificationMessage)

  try {
    await sendRawPhotoSubmittedEmails(saved)
  } catch (emailErr) {
    console.error('sendRawPhotoSubmittedEmails failed:', emailErr)
  }

  return saved
}

/** Public landing submit: name + Google Drive link → DB + filtering queue + emails. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const name = body.name?.trim()
    const rawPhotoLink = body.rawPhotoLink?.trim()
    const bookingId = body.bookingId?.trim()

    if (!name || !rawPhotoLink) {
      return NextResponse.json(
        { error: 'Full name and Google Drive folder link are required.' },
        { status: 400 },
      )
    }

    if (!rawPhotoLink.startsWith('https://drive.google.com/')) {
      return NextResponse.json(
        {
          error:
            'Please enter a valid Google Drive link (must start with https://drive.google.com/).',
        },
        { status: 400 },
      )
    }

    if (bookingId) {
      const booking = await loadBookingById(bookingId)
      if (!booking || !eligibleForRawSubmit(booking)) {
        return NextResponse.json(
          { error: 'Booking not found or not ready for photo selection yet.' },
          { status: 404 },
        )
      }
      if (!namesMatch(booking.customerName, name)) {
        return NextResponse.json(
          {
            error:
              'Name does not match this booking. Use the same full name from your booking, or leave the booking code blank and try again.',
          },
          { status: 404 },
        )
      }

      const saved = await saveRawSubmission(booking, rawPhotoLink)
      return NextResponse.json({
        id: saved.id,
        customerName: saved.customerName,
        rawPhotoStatus: saved.rawPhotoStatus,
        message: 'Submitted to the database — our editors will review your folder shortly.',
      })
    }

    const all = await loadAllBookings()
    const matches = all.filter((b) => eligibleForRawSubmit(b) && namesMatch(b.customerName, name))

    if (matches.length === 0) {
      return NextResponse.json(
        {
          error:
            'No matching confirmed booking found for that name. Check spelling, or add your booking reference (FM-…).',
        },
        { status: 404 },
      )
    }

    if (matches.length > 1) {
      return NextResponse.json(
        {
          error: 'Multiple bookings match that name. Select your booking below.',
          matches: matches.map((b) => ({
            id: b.id,
            customerName: b.customerName,
            packageName: b.packageName,
            bookingDate: b.bookingDate,
            bookingTime: b.bookingTime,
          })),
        },
        { status: 409 },
      )
    }

    const saved = await saveRawSubmission(matches[0], rawPhotoLink)
    return NextResponse.json({
      id: saved.id,
      customerName: saved.customerName,
      rawPhotoStatus: saved.rawPhotoStatus,
      message: 'Submitted to the database — our editors will review your folder shortly.',
    })
  } catch (error) {
    console.error('POST /api/bookings/submit-raw-photo-public', error)
    const message = error instanceof Error ? error.message : 'Failed to submit photo folder link.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
