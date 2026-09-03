import { NextResponse } from 'next/server'
import { addServerNotification, listNotifications } from '@/lib/server-store'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { listNotificationsFromDb, addNotificationToDb } from '@/lib/supabase-store'
import type { Notification } from '@/lib/data-store'
import { getActiveEmailStorageReminder } from '@/lib/ops-subscriptions'

function mergeNotifications(primary: Notification[], secondary: Notification[]) {
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
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

/** Ensure the email-storage renewal reminder exists in DB so mark-read works. */
async function ensureOpsReminders(existing: Notification[]): Promise<Notification[]> {
  const draft = getActiveEmailStorageReminder(new Date(), existing)
  if (!draft) return existing

  const already = existing.find(
    (n) => n.type === 'OPS_REMINDER' && n.bookingId === draft.bookingId,
  )
  if (already) return existing

  const admin = getSupabaseAdmin()
  if (isSupabaseConfigured() && admin) {
    const saved = await addNotificationToDb(admin, draft.bookingId, draft.type, draft.message)
    if (saved) return [saved, ...existing]
  }

  const saved = await addServerNotification(draft.bookingId, draft.type, draft.message)
  return [saved, ...existing]
}

export async function GET() {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    let notifications: Notification[] = []

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (admin) {
        const fromDb = await listNotificationsFromDb(admin)
        if (fromDb) {
          const fileNotifications = await listNotifications()
          notifications = mergeNotifications(fromDb, fileNotifications)
        }
      }
    }

    if (notifications.length === 0) {
      notifications = await listNotifications()
    }

    notifications = await ensureOpsReminders(notifications)
    return NextResponse.json(notifications)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const body = await request.json()
    const { bookingId, type, message } = body as {
      bookingId: string
      type: Notification['type']
      message: string
    }

    const admin = getSupabaseAdmin()
    if (isSupabaseConfigured() && admin) {
      const saved = await addNotificationToDb(admin, bookingId, type, message)
      if (saved) return NextResponse.json(saved, { status: 201 })
    }

    const notification = await addServerNotification(bookingId, type, message)
    return NextResponse.json(notification, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}
