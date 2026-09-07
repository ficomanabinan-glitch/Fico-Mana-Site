import { NextResponse } from 'next/server'
import { getBookingById, upsertBooking, deleteBookingFromStore } from '@/lib/server-store'
import type { Booking } from '@/lib/data-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { requireStaffAuth } from '@/lib/auth-api'
import { secureErrorResponse } from '@/lib/security/error-response'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getBookingFromDb, saveBookingToDb, deleteBookingFromDb } from '@/lib/supabase-store'
import { disableClientPortal, provisionBookingResources } from '@/lib/booking-provisioning'
import { bookingMutationSchema } from '@/lib/security/schemas'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'

const DELETE_REASONS = {
  admin_error: 'Admin error',
  client_error: 'Client error',
} as const

type DeleteReason = keyof typeof DELETE_REASONS

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) return NextResponse.json({ error: 'This service is temporarily unavailable. Try: refresh the page, or contact your administrator.' }, { status: 500 })
      const booking = await getBookingFromDb(admin, id)
      if (booking) {
        return NextResponse.json(booking)
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const booking = await getBookingById(id)
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json(booking)
  } catch (error) {
    console.error('GET /api/bookings/[id]', error)
    return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const { id } = await params
    const parsed = bookingMutationSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid booking payload' }, { status: 400 })
    const booking = parsed.data as Booking
    if (booking.id !== id) return NextResponse.json({ error: 'ID mismatch' }, { status: 400 })

    const admin = isSupabaseConfigured() ? getSupabaseAdmin() : null
    if (isSupabaseConfigured() && !admin) throw new Error('Booking records are temporarily unavailable.')
    const prior = admin ? await getBookingFromDb(admin, id) : await getBookingById(id)
    if (!prior) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

    let saved: Booking
    if (admin) {
      const dbSaved = await saveBookingToDb(admin, booking)
      if (!dbSaved) return NextResponse.json({ error: 'Your booking could not be saved. Try: refresh the page and try again.' }, { status: 500 })
      saved = dbSaved
    } else {
      saved = await upsertBooking(booking)
    }

    let provisioning: unknown = undefined
    if (admin) {
      const actor = { type: 'staff' as const, id: user?.id || null }
      const cancelledNow = saved.bookingStatus === 'Cancelled' && prior.bookingStatus !== 'Cancelled'
      if (cancelledNow) {
        await disableClientPortal(saved.id, actor).catch(console.error)
      } else if (saved.bookingStatus === 'Confirmed' || saved.bookingStatus === 'Completed') {
        const needsReconcile =
          prior.bookingStatus !== saved.bookingStatus ||
          prior.bookingDate !== saved.bookingDate ||
          prior.customerName !== saved.customerName
        if (needsReconcile) {
          provisioning = await provisionBookingResources(saved.id, actor).catch((error) => {
            console.error('PUT booking provisioning failed:', error)
            return undefined
          })
        }
      }
    }

    return NextResponse.json({ ...saved, ...(provisioning ? { provisioning } : {}) })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to update booking.', {
      request,
      context: 'PUT /api/bookings/[id]',
    })
  }
}

/** Hard-delete a booking (admin correction). Requires reason: admin_error | client_error. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const { id } = await params
    let reason: DeleteReason | undefined
    let notes = ''
    try {
      const body = (await request.json()) as { reason?: string; notes?: string }
      if (body.reason === 'admin_error' || body.reason === 'client_error') reason = body.reason
      notes = body.notes?.trim() || ''
    } catch {
      // empty body
    }

    if (!reason) {
      return NextResponse.json({ error: 'Delete reason required: admin_error or client_error.' }, { status: 400 })
    }

    const booking = isSupabaseConfigured()
      ? await (async () => {
          const admin = getSupabaseAdmin()
          if (!admin) return null
          return getBookingFromDb(admin, id)
        })()
      : await getBookingById(id)

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) return NextResponse.json({ error: 'This service is temporarily unavailable. Try: refresh the page, or contact your administrator.' }, { status: 500 })
      const ok = await deleteBookingFromDb(admin, id)
      if (!ok) return NextResponse.json({ error: 'The booking could not be deleted. Try: refresh the page and try again.' }, { status: 500 })
    }

    if (!isSupabaseConfigured()) await deleteBookingFromStore(id)
    await recordSecurityAuditEvent({
      eventType: 'booking_deleted', outcome: 'success', actorId: user?.id,
      bookingId: id, route: '/api/bookings/[id]', metadata: { reason, hasNotes: Boolean(notes) },
    })

    return NextResponse.json({
      ok: true,
      id,
      reason,
      reasonLabel: DELETE_REASONS[reason],
      message: `Booking ${id} deleted (${DELETE_REASONS[reason]}).`,
    })
  } catch (error) {
    console.error('DELETE /api/bookings/[id]', error)
    return NextResponse.json({ error: 'Failed to delete booking' }, { status: 500 })
  }
}
