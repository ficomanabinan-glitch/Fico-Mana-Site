import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { secureErrorResponse } from '@/lib/security/error-response'

export async function GET() {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
    }

    const { data, error } = await admin
      .from('bookings')
      .select('id, booking_date, client_priority')
      .not('client_priority', 'is', null)

    if (error) throw error

    return NextResponse.json(
      (data ?? []).map((row) => ({
        bookingId: String(row.id),
        bookingDate: String(row.booking_date),
        clientPriority: Number(row.client_priority),
      })),
    )
  } catch (error) {
    console.error('GET /api/bookings/client-priorities', error)
    return NextResponse.json({ error: 'Failed to load client order.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const body = (await request.json()) as {
      bookingId?: string
      priority?: number
      previousPriority?: number
      swapBookingId?: string | null
    }

    const bookingId = body.bookingId?.trim()
    const priority = Number(body.priority)
    const previousPriority = Number(body.previousPriority)
    const swapBookingId = body.swapBookingId?.trim() || null

    if (
      !bookingId ||
      !Number.isInteger(priority) ||
      priority < 1 ||
      !Number.isInteger(previousPriority) ||
      previousPriority < 1
    ) {
      return NextResponse.json({ error: 'Invalid client order update.' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
    }

    const { data, error } = await admin.rpc('set_booking_client_priority', {
      p_booking_id: bookingId,
      p_priority: priority,
      p_previous_priority: previousPriority,
      p_swap_booking_id: swapBookingId,
    })

    if (error) throw error

    return NextResponse.json({
      ok: true,
      updates: (data ?? []).map((row: { booking_id: string; client_priority: number }) => ({
        bookingId: String(row.booking_id),
        clientPriority: Number(row.client_priority),
      })),
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to update client order.', {
      request,
      context: 'PATCH /api/bookings/client-priorities',
    })
  }
}
