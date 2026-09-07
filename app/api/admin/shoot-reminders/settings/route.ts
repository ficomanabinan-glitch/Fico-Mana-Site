import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'
import { privateNoStoreHeaders } from '@/lib/security/request-security'
import { getResendFromAddress, isResendConfigured } from '@/lib/resend-config'
import { canManageShootReminders, shootReminderSettingsAction } from '@/lib/shoot-reminder-settings'

async function handle(request: Request, mutate: boolean) {
  const headers = privateNoStoreHeaders()
  const { user, error: authError } = await requireStaffAuth(mutate ? request : undefined)
  if (authError) return authError
  try {
    const access = await getWorkflowAccess(user!)
    if (!access || !canManageShootReminders(access)) {
      return NextResponse.json({ error: 'Only a Fico Mana administrator can manage shoot reminders.' }, { status: 403, headers })
    }
    const admin = getSupabaseAdmin()
    if (!admin) throw new Error('Reminder database unavailable')
    let action: 'check' | 'enable' | 'pause' | undefined
    if (mutate) {
      const limited = await enforceApiRateLimit(request, {
        name: 'shoot-reminder-settings', limit: 20, windowSeconds: 60, failClosed: true,
      }, [user!.id, access.workspaceId])
      if (limited) return limited
      const parsed = shootReminderSettingsAction.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return NextResponse.json({ error: 'Choose Check Reminder Service, Enable Reminders, or Pause Reminders.' }, { status: 400, headers })
      action = parsed.data.action
      if (action !== 'pause' && !isResendConfigured()) {
        return NextResponse.json({ error: 'The email service is not configured. Try: ask the deployment administrator to configure Resend; no emails were sent.' }, { status: 503, headers })
      }
    }
    const args = { p_workspace: access.workspaceId, p_actor: user!.id }
    const result = action === 'check'
      ? await admin.rpc('check_shoot_reminder_service', args)
      : action === 'enable' || action === 'pause'
        ? await admin.rpc('set_shoot_reminders_enabled', { ...args, p_enabled: action === 'enable' })
        : await admin.rpc('get_shoot_reminder_control', args)
    if (result.error) {
      if (result.error.code === '22023') return NextResponse.json({ error: 'Please run Check Reminder Service and wait for a successful result, then enable reminders within 10 minutes.' }, { status: 409, headers })
      if (result.error.code === '42501') return NextResponse.json({ error: 'Your workspace role cannot change these reminder settings.' }, { status: 403, headers })
      throw new Error('Reminder configuration unavailable')
    }
    if (!result.data) throw new Error('Reminder configuration unavailable')
    return NextResponse.json({ ...result.data, emailConfigured: isResendConfigured(),
      senderAddress: isResendConfigured() ? getResendFromAddress() : null }, { headers })
  } catch {
    return NextResponse.json({ error: 'Reminder settings are temporarily unavailable. Try: refresh after the reminder-settings database update has been installed.' }, { status: 503, headers })
  }
}

export function GET(request: Request) { return handle(request, false) }
export function POST(request: Request) { return handle(request, true) }
