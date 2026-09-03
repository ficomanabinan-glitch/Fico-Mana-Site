import { NextResponse } from 'next/server'
import { listBookings, upsertBooking, getBookingById, addServerNotification } from '@/lib/server-store'
import type { Booking, PaymentRecord } from '@/lib/data-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireStaffAuth } from '@/lib/auth-api'
import {
  getBookingFromDb,
  listBookingsFromDb,
  saveBookingToDb,
  addNotificationToDb,
} from '@/lib/supabase-store'
import { validateBookingAvailability } from '@/lib/booking-validate'
import { listBlockedSlots } from '@/lib/server-blocked-slots'
import { listFicoSpotBlocks } from '@/lib/server-fico-spot-blocks'
import { loadSyncedBookings } from '@/lib/db-sync'
import {
  sendPaymentRejectedEmail,
  sendDepositApprovedEmails,
  sendBookingSubmittedEmail,
} from '@/lib/email'
import { isPlaceholderCustomerEmail } from '@/lib/customer-email'
import { usesMakeupSlots, packageRequiresDeposit } from '@/lib/booking-packages'
import {
  findSlotByBookingTime,
  formatSlotBookingTime,
  getSlotById,
  FICO_BOOKING_TIME_LABEL,
  FICO_ARRIVAL_LABEL,
} from '@/lib/booking-slots'

/** Keep slotId in sync with bookingTime so reschedules pass capacity checks. */
function normalizeBookingSchedule(booking: Booking): Booking {
  if (usesMakeupSlots(booking.packageId)) {
    // Prefer the time label staff just selected; fall back to stored slotId.
    const slot = findSlotByBookingTime(booking.bookingTime) ?? (booking.slotId ? getSlotById(booking.slotId) : undefined)
    if (!slot) return booking
    return {
      ...booking,
      slotId: slot.id,
      bookingTime: formatSlotBookingTime(slot),
      arrivalTime: slot.arrivalTime,
      shootTime: slot.shootTime,
    }
  }

  return {
    ...booking,
    slotId: undefined,
    bookingTime: booking.bookingTime || FICO_BOOKING_TIME_LABEL,
    arrivalTime: booking.arrivalTime || FICO_ARRIVAL_LABEL,
  }
}

function depositPaymentFromBooking(booking: Booking): PaymentRecord | undefined {
  const history = booking.paymentHistory || []
  return history.find((p) => p.type === 'Deposit') ?? history[history.length - 1]
}

function bookingEmailPayload(result: Booking, booking: Booking) {
  const customerEmail = booking.customerEmail?.trim()
  return customerEmail ? { ...result, customerEmail } : result
}

async function loadAvailabilityBookings(): Promise<Booking[]> {
  if (!isSupabaseConfigured()) {
    return listBookings()
  }

  const admin = getSupabaseAdmin()
  if (!admin) return []

  const { data, error } = await admin
    .from('bookings')
    .select('id, booking_date, slot_id, package_id, booking_status, booking_time')
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return data.map((b) => ({
    id: String(b.id),
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerFbLink: '',
    customerFbName: '',
    packageId: String(b.package_id),
    packageName: '',
    bookingDate: String(b.booking_date),
    bookingTime: String(b.booking_time ?? ''),
    slotId: b.slot_id ? String(b.slot_id) : undefined,
    depositAmount: 0,
    price: 0,
    bookingStatus: b.booking_status as Booking['bookingStatus'],
    paymentStatus: 'Unpaid',
    createdAt: '',
    paymentHistory: [],
  }))
}

async function notifyNewBooking(booking: Booking) {
  const newBookingMsg = `New booking ${booking.id} submitted by ${booking.customerName}.`
  const receiptMsg = `${booking.customerName} submitted a receipt for booking ${booking.id}.`
  const admin = getSupabaseAdmin()

  try {
    if (isSupabaseConfigured() && admin) {
      await addNotificationToDb(admin, booking.id, 'NEW_BOOKING', newBookingMsg)
      if (booking.receiptUrl) {
        await addNotificationToDb(admin, booking.id, 'RECEIPT_UPLOAD', receiptMsg)
      }
      return
    }

    await addServerNotification(booking.id, 'NEW_BOOKING', newBookingMsg)
    if (booking.receiptUrl) {
      await addServerNotification(booking.id, 'RECEIPT_UPLOAD', receiptMsg)
    }
  } catch (error) {
    console.warn('notifyNewBooking skipped:', error)
  }
}

export async function GET() {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const merged = await loadSyncedBookings()
    return NextResponse.json(merged)
  } catch (error) {
    console.error('GET /api/bookings', error)
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const incoming = (await request.json()) as Booking

    let isExisting = false
    let priorBooking: Booking | null = null
    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) {
        return NextResponse.json(
          { error: 'Database admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY.' },
          { status: 500 },
        )
      }
      priorBooking = await getBookingFromDb(admin, incoming.id)
      isExisting = !!priorBooking
    } else {
      priorBooking = await getBookingById(incoming.id)
      isExisting = !!priorBooking
    }
    const priorBookingStatus = priorBooking?.bookingStatus

    const { user: staffUser, error: staffAuthError } = await requireStaffAuth()
    if (isExisting) {
      if (staffAuthError) return staffAuthError
    }

    const isStaffCreate = !isExisting && !!staffUser && !staffAuthError
    const requiresDeposit = packageRequiresDeposit(incoming.packageId)

    // Public creates: never trust client privilege fields (status, staff notes, etc.).
    // Staff creates (walk-ins) may set Confirmed + receipt.
    // Self-portrait (FICO/MANA): no online deposit — confirm immediately, pay at studio.
    const booking = normalizeBookingSchedule(
      isExisting
        ? incoming
        : isStaffCreate
          ? {
              ...incoming,
              depositAmount: Number(incoming.depositAmount) || (requiresDeposit ? 500 : 0),
              driveLink: undefined,
              rawPhotoLink: undefined,
              rawPhotoStatus: undefined,
              rawPhotoNotes: undefined,
              rawPhotoSubmittedAt: undefined,
              rawPhotoApprovedAt: undefined,
              editedPhotoLink: undefined,
              editedPhotoDeliveredAt: undefined,
              paymentHistory: Array.isArray(incoming.paymentHistory) ? incoming.paymentHistory : [],
            }
          : requiresDeposit
            ? {
                ...incoming,
                bookingStatus: 'Pending Verification',
                paymentStatus: 'Pending Verification',
                rejectionReason: undefined,
                rejectionReasonId: undefined,
                staffNotes: undefined,
                driveLink: undefined,
                rawPhotoLink: undefined,
                rawPhotoStatus: undefined,
                rawPhotoNotes: undefined,
                rawPhotoSubmittedAt: undefined,
                rawPhotoApprovedAt: undefined,
                editedPhotoLink: undefined,
                editedPhotoDeliveredAt: undefined,
                depositAmount: 500,
                paymentHistory: [
                  {
                    id: 'PAY-' + Math.floor(1000 + Math.random() * 9000),
                    amount: 500,
                    method: incoming.paymentHistory?.[0]?.method || 'BPI',
                    type: 'Deposit',
                    transactionRef: incoming.transactionRef || incoming.paymentHistory?.[0]?.transactionRef,
                    date: new Date().toISOString(),
                  },
                ],
              }
            : {
                ...incoming,
                bookingStatus: 'Confirmed',
                paymentStatus: 'Unpaid',
                rejectionReason: undefined,
                rejectionReasonId: undefined,
                staffNotes: undefined,
                driveLink: undefined,
                rawPhotoLink: undefined,
                rawPhotoStatus: undefined,
                rawPhotoNotes: undefined,
                rawPhotoSubmittedAt: undefined,
                rawPhotoApprovedAt: undefined,
                editedPhotoLink: undefined,
                editedPhotoDeliveredAt: undefined,
                receiptUrl: undefined,
                transactionRef: undefined,
                depositAmount: 0,
                paymentHistory: [],
              },
    )

    // Contact/status-only edits must not fail when the slot is already occupied
    // (this booking itself, or a legacy double-book). Re-check capacity only if schedule changes.
    const scheduleUnchanged =
      !!priorBooking &&
      priorBooking.bookingDate === booking.bookingDate &&
      (priorBooking.slotId || '') === (booking.slotId || '') &&
      priorBooking.bookingTime === booking.bookingTime &&
      priorBooking.packageId === booking.packageId

    if (!scheduleUnchanged) {
      const availabilityPool = await loadAvailabilityBookings()
      const blockedSlots = await listBlockedSlots()
      const ficoSpotBlocks = await listFicoSpotBlocks()
      const validation = validateBookingAvailability(booking, availabilityPool, {
        isUpdate: isExisting,
        blockedSlots,
        ficoSpotBlocks,
      })
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 409 })
      }
    }

    const db = getSupabaseAdmin()
    if (isSupabaseConfigured() && !db) {
      return NextResponse.json(
        { error: 'Database admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 },
      )
    }
    const supabaseResult = db ? await saveBookingToDb(db, booking) : null

    // File store is best-effort (read-only on Vercel)
    try {
      await upsertBooking(supabaseResult ?? booking)
    } catch (fileError) {
      console.warn('File store upsert skipped:', fileError)
    }

    const result = supabaseResult ?? booking
    const emailErrors: string[] = []

    if (!isExisting) {
      await notifyNewBooking(result)
      const customerEmail = booking.customerEmail?.trim()
      if (customerEmail && !isPlaceholderCustomerEmail(customerEmail) && !isStaffCreate) {
        const emailResult = await sendBookingSubmittedEmail(bookingEmailPayload(result, booking))
        if (!emailResult.success) {
          emailErrors.push(emailResult.error || 'Failed to email customer about booking submission.')
        }
      }
    }

    const rejectionChanged =
      isExisting &&
      booking.bookingStatus === 'Pending Payment' &&
      priorBookingStatus === 'Pending Verification' &&
      !!booking.rejectionReason?.trim()

    if (rejectionChanged) {
      const customerEmail = booking.customerEmail?.trim()
      if (!customerEmail) {
        emailErrors.push('No customer email on booking — rejection notice not sent.')
      } else {
        const emailResult = await sendPaymentRejectedEmail(
          { ...result, customerEmail },
          booking.rejectionReason!,
          booking.rejectionReasonId,
        )
        if (!emailResult.success) {
          emailErrors.push(emailResult.error || 'Failed to email customer about rejection.')
        }
      }
    }

    const approvedNow =
      isExisting &&
      booking.bookingStatus === 'Confirmed' &&
      priorBookingStatus !== 'Confirmed'

    if (approvedNow) {
      const customerEmail = booking.customerEmail?.trim()
      if (!customerEmail) {
        emailErrors.push('No customer email on booking — confirmation not sent.')
      } else {
        const deposit = depositPaymentFromBooking(booking)
        if (!deposit) {
          emailErrors.push('No deposit payment record — confirmation email not sent.')
        } else {
          const emailResult = await sendDepositApprovedEmails(
            bookingEmailPayload(result, booking),
            deposit,
          )
          if (!emailResult.success) {
            emailErrors.push(emailResult.error || 'Failed to email customer confirmation.')
          }
        }
      }
    }

    if (!supabaseResult && isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error:
            'Could not save booking to database. Ensure migrations 002–004 are applied and SUPABASE_SERVICE_ROLE_KEY is set on Vercel.',
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      emailErrors.length > 0 ? { ...result, emailErrors } : result,
      { status: isExisting ? 200 : 201 },
    )
  } catch (error) {
    console.error('POST /api/bookings', error)
    const message = error instanceof Error ? error.message : 'Failed to save booking'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
