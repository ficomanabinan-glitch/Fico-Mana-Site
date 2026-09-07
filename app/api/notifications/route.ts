import { NextResponse } from 'next/server'
import { addServerNotification, listNotifications } from '@/lib/server-store'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { listNotificationsFromDb, addNotificationToDb } from '@/lib/supabase-store'
import type { Notification } from '@/lib/data-store'
import { getActiveEmailStorageReminder } from '@/lib/ops-subscriptions'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { canManageShootReminders } from '@/lib/shoot-reminder-settings'
import { getShootReminderHealth, notifyShootReminderIssue } from '@/lib/shoot-reminder-alerts'
import { SHOOT_REMINDER_NOTIFICATION_TYPE } from '@/lib/shoot-reminder-issues'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

function mergeNotifications(primary: Notification[], secondary: Notification[]) {
  const map = new Map<string, Notification>()
  for (const n of [...primary, ...secondary]) {
    const key = n.type === SHOOT_REMINDER_NOTIFICATION_TYPE ? n.id : `${n.bookingId}:${n.type}:${n.message.slice(0, 40)}`
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
    const { user, error: authError } = await requireStaffAuth()
    if (authError) return authError

    // Failure to resolve reminder access must not break ordinary booking notifications.
    const access = await getWorkflowAccess(user!).catch(() => null)
    const reminderAdmin = canManageShootReminders(access)

    // Recover alerts from saved delivery/run state if the worker could not persist
    // its notification, and detect missing scheduled checks. Never claim or send.
    const reminderAdminClient = getSupabaseAdmin()
    if (reminderAdmin && access && reminderAdminClient) {
      try {
        const health = await getShootReminderHealth(reminderAdminClient, access.workspaceId)
        if (health.available && health.issue) await notifyShootReminderIssue(reminderAdminClient, health.issue.code)
      } catch {
        console.error('Reminder notification health check unavailable; existing notifications are preserved.')
      }
    }

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
    return NextResponse.json(notifications.filter(n => reminderAdmin || n.type !== SHOOT_REMINDER_NOTIFICATION_TYPE), { headers: privateNoStoreHeaders() })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const body = await request.json()
    const { bookingId, type, message } = body as {
      bookingId: string
      type: Notification['type']
      message: string
    }
    if (typeof bookingId !== 'string' || type === SHOOT_REMINDER_NOTIFICATION_TYPE) {
      return NextResponse.json({ error: 'This notification reference is reserved for the reminder service.' }, { status: 400, headers: privateNoStoreHeaders() })
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
