import { NextResponse } from 'next/server'
import { addServerNotification, listNotifications } from '@/lib/server-store'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { listNotificationsFromDb, addNotificationToDb } from '@/lib/supabase-store'
import type { Notification } from '@/lib/data-store'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { canManageShootReminders } from '@/lib/shoot-reminder-settings'
import { getShootReminderHealth, notifyShootReminderIssue } from '@/lib/shoot-reminder-alerts'
import { SHOOT_REMINDER_NOTIFICATION_TYPE } from '@/lib/shoot-reminder-issues'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

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

    let notifications: Notification[]
    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) throw new Error('Notification storage unavailable')
      const fromDb = await listNotificationsFromDb(admin)
      if (!fromDb) throw new Error('Notification storage unavailable')
      notifications = fromDb
    } else {
      notifications = await listNotifications()
    }

    return NextResponse.json(notifications.filter(n =>
      n.type !== 'OPS_REMINDER' &&
      n.type !== 'OPS_PAID' &&
      (reminderAdmin || n.type !== SHOOT_REMINDER_NOTIFICATION_TYPE)
    ), { headers: privateNoStoreHeaders() })
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

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) throw new Error('Notification storage unavailable')
      const saved = await addNotificationToDb(admin, bookingId, type, message)
      if (!saved) throw new Error('Notification storage unavailable')
      return NextResponse.json(saved, { status: 201 })
    }

    const notification = await addServerNotification(bookingId, type, message)
    return NextResponse.json(notification, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}
