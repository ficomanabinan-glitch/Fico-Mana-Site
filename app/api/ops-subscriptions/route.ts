import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import {
  addSystemNotificationToDb,
  listNotificationsFromDb,
} from '@/lib/supabase-store'
import { listNotifications, addServerNotification, markServerNotificationsReadForBooking } from '@/lib/server-store'
import type { Notification } from '@/lib/data-store'
import {
  buildEmailStoragePaidMessage,
  emailStorageOpsBookingId,
  getEmailStoragePeriod,
  isEmailStorageCyclePaid,
  opsNotificationId,
} from '@/lib/ops-subscriptions'

async function loadNotifications(): Promise<Notification[]> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (!admin) throw new Error('Subscription records are temporarily unavailable.')
    const fromDb = await listNotificationsFromDb(admin)
    if (!fromDb) throw new Error('Subscription records are temporarily unavailable.')
    return fromDb
  }
  return listNotifications()
}

export async function GET() {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const period = getEmailStoragePeriod()
    const notifications = await loadNotifications()
    const isPaid = isEmailStorageCyclePaid(notifications, period.cycleKey)

    return NextResponse.json({
      period: {
        cycleKey: period.cycleKey,
        periodEnd: period.periodEnd.toISOString(),
        daysLeft: period.daysLeft,
        shouldNotify: period.shouldNotify,
        isOverdue: period.isOverdue,
      },
      isPaid,
    })
  } catch (error) {
    console.error('GET /api/ops-subscriptions', error)
    return NextResponse.json({ error: 'Failed to load ops subscription status' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const period = getEmailStoragePeriod()
    const notifications = await loadNotifications()

    if (isEmailStorageCyclePaid(notifications, period.cycleKey)) {
      return NextResponse.json({ ok: true, alreadyPaid: true, cycleKey: period.cycleKey })
    }

    const bookingId = emailStorageOpsBookingId(period.cycleKey)
    const message = buildEmailStoragePaidMessage(period)

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) throw new Error('Subscription records are temporarily unavailable.')
      const saved = await addSystemNotificationToDb(admin, opsNotificationId(period.cycleKey, 'paid'), 'OPS_PAID', message)
      if (!saved) throw new Error('Subscription records are temporarily unavailable.')
      const { error } = await admin.from('notifications').update({ is_read: true })
        .eq('id', opsNotificationId(period.cycleKey, 'reminder'))
      if (error) throw new Error('Subscription records are temporarily unavailable.')
    } else {
      await addServerNotification(bookingId, 'OPS_PAID', message)
      await markServerNotificationsReadForBooking(bookingId)
    }

    return NextResponse.json({ ok: true, cycleKey: period.cycleKey })
  } catch (error) {
    console.error('POST /api/ops-subscriptions', error)
    return NextResponse.json({ error: 'Failed to mark subscription paid' }, { status: 500 })
  }
}
