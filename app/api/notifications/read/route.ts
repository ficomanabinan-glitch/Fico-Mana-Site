import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { canManageShootReminders } from '@/lib/shoot-reminder-settings'
import { SHOOT_REMINDER_NOTIFICATION_TYPE } from '@/lib/shoot-reminder-issues'
import { listNotifications, markServerNotificationIdsRead } from '@/lib/server-store'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

export async function PATCH(request: Request) {
  try {
    const { user, error: authError } = await requireStaffAuth(request)
    if (authError) return authError
    const body = await request.json().catch(() => null) as { ids?: unknown } | null
    const ids = body?.ids
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || id.length < 1 || id.length > 128)) {
      return NextResponse.json({ error: 'Invalid notification list' }, { status: 400, headers: privateNoStoreHeaders() })
    }
    const uniqueIds = [...new Set(ids as string[])]
    const access = await getWorkflowAccess(user!).catch(() => null)
    const canDismissReminder = canManageShootReminders(access)
    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) throw new Error('Notification storage unavailable')
      const { data, error: readError } = await admin.from('notifications').select('id,type').in('id', uniqueIds)
      if (readError) throw readError
      if (!canDismissReminder && data?.some((item) => item.type === SHOOT_REMINDER_NOTIFICATION_TYPE)) {
        return NextResponse.json({ error: 'Reminder alerts require administrator access' }, { status: 403, headers: privateNoStoreHeaders() })
      }
      const { error } = await admin.from('notifications').update({ is_read: true }).in('id', uniqueIds)
      if (error) throw error
    } else {
      const notifications = await listNotifications()
      if (!canDismissReminder && notifications.some((item) => uniqueIds.includes(item.id) && item.type === SHOOT_REMINDER_NOTIFICATION_TYPE)) {
        return NextResponse.json({ error: 'Reminder alerts require administrator access' }, { status: 403, headers: privateNoStoreHeaders() })
      }
      await markServerNotificationIdsRead(uniqueIds)
    }
    return NextResponse.json({ ok: true }, { headers: privateNoStoreHeaders() })
  } catch {
    return NextResponse.json({ error: 'Could not clear notifications' }, { status: 500, headers: privateNoStoreHeaders() })
  }
}
