import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { markBookingNotificationsReadInDb } from '@/lib/supabase-store'
import { markServerNotificationsReadForBooking } from '@/lib/server-store'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { canManageShootReminders } from '@/lib/shoot-reminder-settings'
import { SHOOT_REMINDER_NOTIFICATION_PREFIX } from '@/lib/shoot-reminder-issues'

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const { bookingId } = (await request.json()) as { bookingId?: string }
    if (!bookingId?.trim()) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
    }
    if (bookingId.startsWith(SHOOT_REMINDER_NOTIFICATION_PREFIX)
      && !canManageShootReminders(await getWorkflowAccess(user!))) {
      return NextResponse.json({ error: 'Only a Fico Mana administrator can dismiss reminder alerts.' }, { status: 403 })
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
