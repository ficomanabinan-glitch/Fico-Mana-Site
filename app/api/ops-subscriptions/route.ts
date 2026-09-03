import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import {
  addNotificationToDb,
  listNotificationsFromDb,
  markBookingNotificationsReadInDb,
} from '@/lib/supabase-store'
import { listNotifications, addServerNotification, markServerNotificationsReadForBooking } from '@/lib/server-store'
import type { Notification } from '@/lib/data-store'
import {
  buildEmailStoragePaidMessage,
  emailStorageOpsBookingId,
  getEmailStoragePeriod,
  isEmailStorageCyclePaid,
} from '@/lib/ops-subscriptions'

function mergeNotifications(primary: Notification[], secondary: Notification[]): Notification[] {
  const map = new Map<string, Notification>()
  for (const n of [...primary, ...secondary]) {
    const key = `${n.bookingId}:${n.type}:${n.message.slice(0, 40)}`
    const existing = map.get(key)
    if (
      !existing ||
      (n.isRead && !existing.isRead) ||
      new Date(n.createdAt).getTime() > new Date(existing.createdAt).getTime()
    ) {
      map.set(key, n)
    }
  }
  return Array.from(map.values())
}

async function loadNotifications(): Promise<Notification[]> {
  if (isSupabaseConfigured()) {
    const admin = getSupabaseAdmin()
    if (admin) {
      const fromDb = await listNotificationsFromDb(admin)
      if (fromDb) {
        return mergeNotifications(fromDb, await listNotifications())
      }
    }
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

export async function POST() {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const period = getEmailStoragePeriod()
    const notifications = await loadNotifications()

    if (isEmailStorageCyclePaid(notifications, period.cycleKey)) {
      return NextResponse.json({ ok: true, alreadyPaid: true, cycleKey: period.cycleKey })
    }

    const bookingId = emailStorageOpsBookingId(period.cycleKey)
    const message = buildEmailStoragePaidMessage(period)

    const admin = getSupabaseAdmin()
    if (isSupabaseConfigured() && admin) {
      await addNotificationToDb(admin, bookingId, 'OPS_PAID', message)
      await markBookingNotificationsReadInDb(admin, bookingId)
    }

    await addServerNotification(bookingId, 'OPS_PAID', message)
    await markServerNotificationsReadForBooking(bookingId)

    return NextResponse.json({ ok: true, cycleKey: period.cycleKey })
  } catch (error) {
    console.error('POST /api/ops-subscriptions', error)
    return NextResponse.json({ error: 'Failed to mark subscription paid' }, { status: 500 })
  }
}
