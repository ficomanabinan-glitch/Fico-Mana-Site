import { NextResponse } from 'next/server'
import { markServerNotificationRead } from '@/lib/server-store'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { canManageShootReminders } from '@/lib/shoot-reminder-settings'
import { SHOOT_REMINDER_NOTIFICATION_TYPE } from '@/lib/shoot-reminder-issues'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, error: authError } = await requireStaffAuth(request)
    if (authError) return authError

    const { id } = await params

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (admin) {
        const { data: notification, error: readError } = await admin.from('notifications').select('type').eq('id', id).maybeSingle()
        if (readError) throw new Error('Notification unavailable')
        if (notification?.type === SHOOT_REMINDER_NOTIFICATION_TYPE
          && !canManageShootReminders(await getWorkflowAccess(user!))) {
          return NextResponse.json({ error: 'Only a Fico Mana administrator can dismiss reminder alerts.' }, { status: 403 })
        }
        const { error } = await admin.from('notifications').update({ is_read: true }).eq('id', id)
        if (!error) {
          await markServerNotificationRead(id)
          return NextResponse.json({ ok: true })
        }
      }
    }

    await markServerNotificationRead(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}
