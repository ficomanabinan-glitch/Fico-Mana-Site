import { NextResponse } from 'next/server'
import type { Booking } from '@/lib/data-store'
import { requireStaffAuth } from '@/lib/auth-api'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { reviewSelection } from '@/lib/selection-review'
import { loadBookingById } from '@/lib/booking-load'
import { upsertBooking, addServerNotification } from '@/lib/server-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { saveBookingToDb, addNotificationToDb } from '@/lib/supabase-store'
import { sendRawPhotoApprovedEmail, sendRawPhotoRejectedEmail } from '@/lib/email'
import { secureErrorMessage, secureErrorResponse } from '@/lib/security/error-response'

type Body = {
  action?: 'Approve' | 'Reject'
  reason?: string
  notes?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const { id } = await params
    const body = (await request.json()) as Body
    const action = body.action
    const reason = body.reason?.trim()
    const notes = body.notes?.trim()

    if (!['Approve', 'Reject'].includes(action || '') || (action === 'Reject' && !reason)) {
      return NextResponse.json(
        { error: 'Action and rejection reason (if rejecting) are required.' },
        { status: 400 },
      )
    }

    const booking = await loadBookingById(id)
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      const access = user ? await getWorkflowAccess(user) : null
      if (!admin || !access) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      const { data: selection, error: selectionError } = await admin.from('photo_selections')
        .select('id').eq('workspace_id', access.workspaceId).eq('booking_id', id).maybeSingle()
      if (selectionError) throw selectionError
      if (selection) {
        const result = await reviewSelection(access.workspaceId, user!.id, id, { ...body, submittedAt: booking.rawPhotoSubmittedAt })
        return NextResponse.json({ ...booking, ...result, rawPhotoStatus: action === 'Approve' ? 'Approved' : 'Rejected' }, { headers: { 'Cache-Control': 'private, no-store' } })
      }
    }

    const rawPhotoStatus: Booking['rawPhotoStatus'] =
      action === 'Approve' ? 'Approved' : 'Rejected'
    const rawPhotoNotes = notes || reason || ''
    const approvedAt =
      action === 'Approve' ? booking.rawPhotoApprovedAt || new Date().toISOString() : undefined

    const updatedBooking: Booking = {
      ...booking,
      rawPhotoStatus,
      rawPhotoNotes,
      rawPhotoApprovedAt: approvedAt,
    }

    const notificationType = action === 'Approve' ? 'RAW_PHOTO_APPROVED' : 'RAW_PHOTO_REJECTED'
    const notificationMessage =
      action === 'Approve'
        ? `Raw photo selection for booking ${booking.id} was APPROVED by editors.`
        : `Raw photo selection for booking ${booking.id} was REJECTED by editors (Reason: ${reason}).`

    let saved: Booking = updatedBooking

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) {
        return NextResponse.json({ error: 'This service is temporarily unavailable. Try: refresh the page, or contact your administrator.' }, { status: 500 })
      }

      const patch: Record<string, unknown> = {
        raw_photo_status: rawPhotoStatus,
        raw_photo_notes: rawPhotoNotes || null,
        raw_photo_approved_at: approvedAt ?? null,
      }

      const { data, error } = await admin
        .from('bookings')
        .update(patch)
        .eq('id', booking.id)
        .select()
        .single()

      if (error) {
        console.error('raw photo review DB update failed:', error.message)
        try {
          const viaUpsert = await saveBookingToDb(admin, updatedBooking)
          if (!viaUpsert) {
            return secureErrorResponse(error, 'Failed to save the RAW-photo review.', {
              request,
              context: 'POST /api/bookings/[id]/review-raw-photo',
            })
          }
          saved = viaUpsert
        } catch (saveErr) {
          return secureErrorResponse(saveErr, 'Failed to save the RAW-photo review.', {
            request,
            context: 'POST /api/bookings/[id]/review-raw-photo fallback',
          })
        }
      } else {
        saved = {
          ...updatedBooking,
          rawPhotoStatus: (data?.raw_photo_status as Booking['rawPhotoStatus']) || rawPhotoStatus,
          rawPhotoNotes: data?.raw_photo_notes ? String(data.raw_photo_notes) : rawPhotoNotes,
          rawPhotoApprovedAt: data?.raw_photo_approved_at
            ? String(data.raw_photo_approved_at)
            : approvedAt,
        }
      }

      await addNotificationToDb(admin, booking.id, notificationType, notificationMessage)
    } else {
      saved = await upsertBooking(updatedBooking)
      await addServerNotification(booking.id, notificationType, notificationMessage)
    }

    const emailErrors: string[] = []
    try {
      if (action === 'Approve') {
        const emailResult = await sendRawPhotoApprovedEmail(saved)
        if (emailResult && emailResult.success === false) {
          emailErrors.push(('error' in emailResult && emailResult.error) || 'Failed to send approval email.')
        }
      } else {
        const emailResult = await sendRawPhotoRejectedEmail(saved, reason!, notes)
        if (emailResult && emailResult.success === false) {
          emailErrors.push(('error' in emailResult && emailResult.error) || 'Failed to send rejection email.')
        }
      }
    } catch (err) {
      console.error('Failed to send raw photo status email:', err)
      emailErrors.push(secureErrorMessage(err, 'Failed to send notification email.'))
    }

    return NextResponse.json({
      ...saved,
      emailErrors: emailErrors.length > 0 ? emailErrors : undefined,
      message: `Raw photo selection successfully ${action === 'Approve' ? 'approved' : 'rejected'}.`,
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to process raw photo review.', {
      request,
      context: 'POST /api/bookings/[id]/review-raw-photo',
    })
  }
}
