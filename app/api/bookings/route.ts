import { NextResponse } from 'next/server'
import { listBookings, upsertBooking, getBookingById, addServerNotification } from '@/lib/server-store'
import type { Booking, PaymentRecord } from '@/lib/data-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { requireStaffAuth } from '@/lib/auth-api'
import {
  getBookingFromDb,
  saveBookingToDb,
  addNotificationToDb,
} from '@/lib/supabase-store'
import { mapDbPackageRow, type DbPackageRow } from '@/lib/booking-db'
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
import {
  bookingPackageRequiresDeposit,
  getBookingPackage,
  packageUsesMakeupSlots,
  parsePackagePrice,
  type BookingPackage,
} from '@/lib/booking-packages'
import {
  findSlotByBookingTime,
  formatSlotBookingTime,
  getSlotById,
  FICO_BOOKING_TIME_LABEL,
  FICO_ARRIVAL_LABEL,
} from '@/lib/booking-slots'
import {
  disableClientPortal,
  provisionBookingResources,
  recordConfirmedPayment,
} from '@/lib/booking-provisioning'
import { getAdminAuthContext } from '@/lib/supabase/server'
import { API_RATE_LIMITS, enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { rejectUntrustedMutation } from '@/lib/security/request-security'
import { bookingMutationSchema } from '@/lib/security/schemas'
import { recordSecurityAuditEvent } from '@/lib/security/security-audit'
import { secureErrorMessage } from '@/lib/security/error-response'

/** Keep slotId in sync with bookingTime so reschedules pass capacity checks. */
function normalizeBookingSchedule(booking: Booking, isMakeupPackage: boolean): Booking {
  if (isMakeupPackage) {
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

async function loadPackageDefinition(packageId: string): Promise<BookingPackage | null> {
  const catalogPackage = getBookingPackage(packageId)
  const fallback = catalogPackage ? { ...catalogPackage, isActive: true } : null
  if (!isSupabaseConfigured()) return fallback
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const { data, error } = await admin.from('packages').select('*').eq('id', packageId).maybeSingle()
  if (error || !data) return null
  const mapped = mapDbPackageRow(data as DbPackageRow)
  return {
    id: mapped.id,
    category: mapped.category as BookingPackage['category'],
    title: mapped.title,
    price: mapped.price,
    priceAmount: mapped.priceAmount,
    duration: mapped.duration || 'Studio session',
    description: mapped.description || '',
    features: mapped.features,
    slotType: mapped.slotType === 'makeup' ? 'makeup' : 'standard',
    selectionLimit: mapped.selectionLimit,
    isActive: mapped.isActive,
    sortOrder: mapped.sortOrder,
    note: mapped.note,
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
  if (!isSupabaseConfigured()) return listBookings()

  const admin = getSupabaseAdmin()
  if (!admin) return []

  const [bookingsResult, packagesResult] = await Promise.all([
    admin
      .from('bookings')
      .select('id, booking_date, slot_id, package_id, booking_status, booking_time')
      .order('created_at', { ascending: false }),
    admin.from('packages').select('id, slot_type'),
  ])

  if (bookingsResult.error || !bookingsResult.data) return []

  const packageSlotTypes = new Map<string, 'makeup' | 'standard'>(
    (packagesResult.data ?? []).map((pkg) => [
      String(pkg.id),
      pkg.slot_type === 'makeup' ? 'makeup' : 'standard',
    ]),
  )

  return bookingsResult.data.map((b) => ({
    id: String(b.id),
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerFbLink: '',
    customerFbName: '',
    packageId: String(b.package_id),
    packageSlotType: packageSlotTypes.get(String(b.package_id)),
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
      if (booking.receiptUrl) await addNotificationToDb(admin, booking.id, 'RECEIPT_UPLOAD', receiptMsg)
      return
    }
    await addServerNotification(booking.id, 'NEW_BOOKING', newBookingMsg)
    if (booking.receiptUrl) await addServerNotification(booking.id, 'RECEIPT_UPLOAD', receiptMsg)
  } catch (error) {
    console.warn('notifyNewBooking skipped:', error)
  }
}

export async function GET() {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError
    return NextResponse.json(await loadSyncedBookings())
  } catch (error) {
    console.error('GET /api/bookings', error)
    return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const originError = rejectUntrustedMutation(request)
    if (originError) return originError
    const parsed = bookingMutationSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid booking information.' }, { status: 400 })
    }
    const incoming = parsed.data as Booking

    const caller = await getAdminAuthContext()
    if (!caller.user) {
      const limited = await enforceApiRateLimit(request, API_RATE_LIMITS.bookingCreate, [incoming.id, incoming.packageId])
      if (limited) return limited
    }

    let isExisting = false
    let priorBooking: Booking | null = null
    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) {
        return NextResponse.json({ error: 'Booking service is temporarily unavailable.' }, { status: 503 })
      }
      priorBooking = await getBookingFromDb(admin, incoming.id)
      isExisting = !!priorBooking
    } else {
      priorBooking = await getBookingById(incoming.id)
      isExisting = !!priorBooking
    }
    const priorBookingStatus = priorBooking?.bookingStatus

    const { user: staffUser, error: staffAuthError } = await requireStaffAuth(request)
    if (isExisting && staffAuthError) return staffAuthError

    const isStaffCreate = !isExisting && !!staffUser && !staffAuthError
    const packageDefinition = await loadPackageDefinition(incoming.packageId)
    if (!packageDefinition) {
      return NextResponse.json({ error: 'The selected package is not available.' }, { status: 400 })
    }
    if (!isExisting && !packageDefinition.isActive) {
      return NextResponse.json({ error: 'The selected package is no longer bookable.' }, { status: 409 })
    }
    const requiresDeposit = bookingPackageRequiresDeposit(packageDefinition)
    const packageChanged = !priorBooking || priorBooking.packageId !== incoming.packageId
    const trustedIncoming: Booking = {
      ...incoming,
      packageName: packageChanged ? packageDefinition.title : incoming.packageName,
      price: packageChanged
        ? packageDefinition.priceAmount ?? parsePackagePrice(packageDefinition.price)
        : incoming.price,
      selectionLimit: packageChanged ? packageDefinition.selectionLimit : incoming.selectionLimit,
      packageSlotType: packageDefinition.slotType,
    }

    const booking = normalizeBookingSchedule(
      isExisting
        ? trustedIncoming
        : isStaffCreate
          ? {
              ...trustedIncoming,
              depositAmount: Number(trustedIncoming.depositAmount) || (requiresDeposit ? 500 : 0),
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
                ...trustedIncoming,
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
                    method: trustedIncoming.paymentHistory?.[0]?.method || 'BPI',
                    type: 'Deposit',
                    transactionRef: trustedIncoming.transactionRef || trustedIncoming.paymentHistory?.[0]?.transactionRef,
                    date: new Date().toISOString(),
                  },
                ],
              }
            : {
                ...trustedIncoming,
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
      packageUsesMakeupSlots(packageDefinition),
    )

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
      if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 409 })
    }

    const db = getSupabaseAdmin()
    if (isSupabaseConfigured() && !db) {
      return NextResponse.json({ error: 'Booking service is temporarily unavailable.' }, { status: 503 })
    }
    const supabaseResult = db ? await saveBookingToDb(db, booking) : null

    if (db && !supabaseResult) throw new Error('The booking could not be saved.')
    if (!isSupabaseConfigured()) await upsertBooking(booking)

    const result = supabaseResult ?? booking
    const emailErrors: string[] = []
    let provisioning: unknown = undefined

    if (!isExisting) {
      await notifyNewBooking(result)
      const customerEmail = booking.customerEmail?.trim()
      if (customerEmail && !isPlaceholderCustomerEmail(customerEmail) && !isStaffCreate) {
        const emailResult = await sendBookingSubmittedEmail(bookingEmailPayload(result, booking))
        if (!emailResult.success) emailErrors.push(emailResult.error || 'Failed to email customer about booking submission.')
      }
    }

    const rejectionChanged =
      isExisting &&
      booking.bookingStatus === 'Pending Payment' &&
      priorBookingStatus === 'Pending Verification' &&
      !!booking.rejectionReason?.trim()

    if (rejectionChanged) {
      await recordSecurityAuditEvent({
        eventType: 'payment_rejected',
        outcome: 'success',
        actorId: staffUser?.id,
        bookingId: booking.id,
        route: '/api/bookings',
      })
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
          emailErrors.push(
            process.env.NODE_ENV === 'production'
              ? 'Failed to email customer about rejection.'
              : emailResult.error || 'Failed to email customer about rejection.',
          )
        }
      }
    }

    const approvedNow = isExisting && booking.bookingStatus === 'Confirmed' && priorBookingStatus !== 'Confirmed'

    if (approvedNow && db) {
      await recordSecurityAuditEvent({
        eventType: 'payment_verified',
        outcome: 'success',
        actorId: staffUser?.id,
        bookingId: booking.id,
        route: '/api/bookings',
      })
      const deposit = depositPaymentFromBooking(booking)
      if (deposit) {
        try {
          await recordConfirmedPayment(db, result, deposit, { type: 'staff', id: staffUser?.id || null })
        } catch (error) {
          console.error('Confirmed payment record failed:', error)
          emailErrors.push(secureErrorMessage(error, 'Confirmed payment record failed.'))
        }
      }
    }

    const bookingBecameCancelled =
      isExisting && booking.bookingStatus === 'Cancelled' && priorBookingStatus !== 'Cancelled'
    if (bookingBecameCancelled && db) {
      await disableClientPortal(booking.id, { type: 'staff', id: staffUser?.id || null }).catch(console.error)
    }

    const alreadyProvisionable =
      booking.bookingStatus === 'Confirmed' || booking.bookingStatus === 'Completed'
    const reconcileProvisionedProject =
      isExisting &&
      alreadyProvisionable &&
      !!priorBooking &&
      (priorBooking.bookingDate !== booking.bookingDate || priorBooking.customerName !== booking.customerName)
    const shouldProvision =
      !!db &&
      !bookingBecameCancelled &&
      (approvedNow || (!isExisting && alreadyProvisionable) || reconcileProvisionedProject)

    if (shouldProvision) {
      try {
        provisioning = await provisionBookingResources(booking.id, {
          type: staffUser ? 'staff' : 'system',
          id: staffUser?.id || null,
        })
      } catch (error) {
        console.error('Booking provisioning failed:', error)
      }
    }

    if (approvedNow) {
      const customerEmail = booking.customerEmail?.trim()
      if (!customerEmail) {
        emailErrors.push('No customer email on booking — confirmation not sent.')
      } else {
        const deposit = depositPaymentFromBooking(booking)
        if (!deposit) {
          emailErrors.push('No deposit payment record — confirmation email not sent.')
        } else {
          const emailResult = await sendDepositApprovedEmails(bookingEmailPayload(result, booking), deposit)
          if (!emailResult.success) emailErrors.push(emailResult.error || 'Failed to email customer confirmation.')
        }
      }
    }

    if (!supabaseResult && isSupabaseConfigured()) {
      return NextResponse.json(
        { error: 'Booking service is temporarily unavailable.' },
        { status: 503 },
      )
    }

    const responseBody = {
      ...result,
      ...(emailErrors.length > 0 ? { emailErrors } : {}),
      ...(provisioning ? { provisioning } : {}),
    }
    return NextResponse.json(responseBody, { status: isExisting ? 200 : 201 })
  } catch (error) {
    console.error('POST /api/bookings', error)
    return NextResponse.json({ error: 'Failed to save booking.' }, { status: 500 })
  }
}
