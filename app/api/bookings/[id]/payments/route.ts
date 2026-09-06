import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mapDbBookingToModel } from '@/lib/booking-db'
import {
  provisionBookingResources,
  recordConfirmedPayment,
  totalConfirmedPayments,
} from '@/lib/booking-provisioning'
import type { PaymentRecord } from '@/lib/data-store'
import { secureErrorResponse } from '@/lib/security/error-response'

const ALLOWED_METHODS = new Set(['GCash', 'Cash', 'Card', 'Maya', 'Bank Transfer', 'BPI'])
const ALLOWED_TYPES = new Set(['Deposit', 'Balance Payment'])

type Body = {
  amount?: number
  method?: PaymentRecord['method']
  type?: PaymentRecord['type']
  transactionRef?: string
  date?: string
  providerEventId?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error: authError } = await requireStaffAuth(request)
  if (authError) return authError

  try {
    const { id } = await params
    const body = (await request.json()) as Body
    const amount = Number(body.amount)
    const method = body.method || 'Cash'
    const type = body.type || 'Balance Payment'

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 })
    }
    if (!ALLOWED_METHODS.has(method)) {
      return NextResponse.json({ error: 'Unsupported payment method.' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'Unsupported payment type.' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

    const { data: row, error } = await admin.from('bookings').select('*').eq('id', id).maybeSingle()
    if (error || !row) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    const booking = mapDbBookingToModel(row)

    const payment: PaymentRecord = {
      id: `PAY-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
      amount,
      method,
      type,
      transactionRef: body.transactionRef?.trim() || undefined,
      date: body.date || new Date().toISOString(),
    }

    try {
      await recordConfirmedPayment(
        admin,
        booking,
        payment,
        { type: 'staff', id: user?.id || null },
        body.providerEventId?.trim() || undefined,
      )
    } catch (paymentError) {
      const message = paymentError instanceof Error ? paymentError.message : 'Could not record payment.'
      const duplicate = /duplicate key|unique constraint|already/i.test(message)
      if (duplicate) {
        return NextResponse.json(
          { error: 'This payment reference or provider event has already been recorded.' },
          { status: 409 },
        )
      }
      return secureErrorResponse(paymentError, 'Could not record payment.', {
        request,
        context: 'POST /api/bookings/[id]/payments',
      })
    }

    const history = [...(booking.paymentHistory || []), payment]
    const confirmedTotal = await totalConfirmedPayments(admin, booking)
    const paymentStatus =
      booking.price > 0 && confirmedTotal >= booking.price
        ? 'Paid Full'
        : confirmedTotal > 0
          ? 'Paid Deposit'
          : booking.paymentStatus

    await admin
      .from('bookings')
      .update({ payment_history: history, payment_status: paymentStatus })
      .eq('id', id)

    const provisioning = await provisionBookingResources(id, { type: 'staff', id: user?.id || null })

    return NextResponse.json({
      ok: true,
      payment,
      confirmedTotal,
      remainingBalance: Math.max(0, Number(booking.price || 0) - confirmedTotal),
      provisioning,
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to record payment.', {
      request,
      context: 'POST /api/bookings/[id]/payments',
    })
  }
}
