import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { markBookingNotificationsReadInDb } from '@/lib/supabase-store'
import { markServerNotificationsReadForBooking } from '@/lib/server-store'

export async function POST(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const { bookingId } = (await request.json()) as { bookingId?: string }
    if (!bookingId?.trim()) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
    }

    let dismissed = 0

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (admin) {
        dismissed += await markBookingNotificationsReadInDb(admin, bookingId)
      }
    }

    dismissed += await markServerNotificationsReadForBooking(bookingId)

    return NextResponse.json({ ok: true, dismissed })
  } catch (error) {
    console.error('POST /api/notifications/dismiss', error)
    return NextResponse.json({ error: 'Failed to dismiss notifications' }, { status: 500 })
  }
}
