import { NextResponse } from 'next/server'
import type { Booking } from '@/lib/data-store'
import { requireStaffAuth } from '@/lib/auth-api'
import { loadBookingById } from '@/lib/booking-load'
import { upsertBooking, addServerNotification } from '@/lib/server-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { saveBookingToDb, addNotificationToDb } from '@/lib/supabase-store'
import { sendEditedPhotosEmail } from '@/lib/email'

type Body = {
  editedPhotoLink?: string
  sendEmail?: boolean
  customerName?: string
  customerEmail?: string
}

/** Editor pastes Drive link of finished edits → save to DB + email client. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const { id } = await params
    const body = (await request.json()) as Body
    const editedPhotoLink = body.editedPhotoLink?.trim()
    const shouldEmail = body.sendEmail !== false
    const customerName = body.customerName?.trim()
    const customerEmail = body.customerEmail?.trim()

    if (!editedPhotoLink) {
      return NextResponse.json({ error: 'Edited photos Google Drive link is required.' }, { status: 400 })
    }
    if (!editedPhotoLink.startsWith('https://drive.google.com/')) {
      return NextResponse.json(
        { error: 'Please enter a valid Google Drive link (https://drive.google.com/...).' },
        { status: 400 },
      )
    }

    const booking = await loadBookingById(id)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (booking.rawPhotoStatus !== 'Approved') {
      return NextResponse.json(
        { error: 'Only approved selections can receive edited photo delivery.' },
        { status: 409 },
      )
    }

    const deliveredAt = new Date().toISOString()
    const updatedBooking: Booking = {
      ...booking,
      customerName: customerName || booking.customerName,
      customerEmail: customerEmail || booking.customerEmail,
      editedPhotoLink,
      editedPhotoDeliveredAt: deliveredAt,
    }

    const notificationMessage = `Edited photos delivered for ${booking.id} (${updatedBooking.customerName}).`

    let saved: Booking = updatedBooking

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) {
        return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
      }

      const patch: Record<string, unknown> = {
        edited_photo_link: editedPhotoLink,
        edited_photo_delivered_at: deliveredAt,
      }
      if (customerName) patch.customer_name = customerName
      if (customerEmail) patch.customer_email = customerEmail

      const { data, error } = await admin
        .from('bookings')
        .update(patch)
        .eq('id', booking.id)
        .select()
        .single()

      if (error) {
        console.error('edited photo DB update failed:', error.message)
        const viaUpsert = await saveBookingToDb(admin, updatedBooking)
        if (!viaUpsert) {
          return NextResponse.json(
            {
              error: `Database save failed: ${error.message}. Run migration 013_edited_photo_delivery.sql in Supabase.`,
            },
            { status: 500 },
          )
        }
        saved = viaUpsert
      } else {
        saved = {
          ...updatedBooking,
          editedPhotoLink: data?.edited_photo_link
            ? String(data.edited_photo_link)
            : editedPhotoLink,
          editedPhotoDeliveredAt: data?.edited_photo_delivered_at
            ? String(data.edited_photo_delivered_at)
            : deliveredAt,
        }
      }

      await upsertBooking(saved)
      await addNotificationToDb(admin, booking.id, 'EDITED_PHOTOS_READY', notificationMessage)
    } else {
      saved = await upsertBooking(updatedBooking)
      await addServerNotification(booking.id, 'EDITED_PHOTOS_READY', notificationMessage)
    }

    const emailErrors: string[] = []
    if (shouldEmail) {
      try {
        const emailResult = await sendEditedPhotosEmail(saved, editedPhotoLink)
        if (!emailResult.success && emailResult.error) {
          emailErrors.push(emailResult.error)
        }
      } catch (err) {
        console.error('sendEditedPhotosEmail failed:', err)
        emailErrors.push(err instanceof Error ? err.message : 'Failed to send email.')
      }
    }

    return NextResponse.json({
      ...saved,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
      message: shouldEmail
        ? 'Edited photos link saved and emailed to the client.'
        : 'Edited photos link saved (no email sent).',
    })
  } catch (error) {
    console.error('POST /api/bookings/[id]/deliver-edited-photos', error)
    return NextResponse.json({ error: 'Failed to deliver edited photos.' }, { status: 500 })
  }
}
