import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getWorkflowAccess } from '@/lib/auth/workflow'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

export async function GET(request: Request) {
  const headers = privateNoStoreHeaders()
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError
  const query = new URL(request.url).searchParams
  const from = query.get('from') || ''
  const to = query.get('to') || ''
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value
  if (!validDate(from) || !validDate(to) || from > to || Date.parse(to)-Date.parse(from)>31*86400000) {
    return NextResponse.json({ error: 'Choose a valid date range of 31 days or fewer.' }, { status: 400, headers })
  }
  try {
    const admin = getSupabaseAdmin()
    const access = await getWorkflowAccess(user!)
    if (!admin || !access) return NextResponse.json({ error: 'Workspace unavailable. Try: sign in again.' }, { status: 403, headers })
    const [attendance, settings] = await Promise.all([
      admin.rpc('list_shoot_attendance', { p_workspace: access.workspaceId, p_from: from, p_to: to }),
      admin.from('shoot_reminder_settings').select('enabled,last_started_at,last_completed_at,last_result').eq('id',1).single(),
    ])
    if (attendance.error || settings.error) throw new Error('Reminder database setup is unavailable.')
    const rows = attendance.data || []
    return NextResponse.json({ rows: rows.slice(0,2000), truncated: rows.length>2000, settings: settings.data }, { headers })
  } catch {
    return NextResponse.json({ error: 'Shoot reminders could not be loaded. Try: refresh this page, or ask your administrator to check the reminder settings.' }, { status: 503, headers })
  }
}
