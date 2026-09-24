import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaffAuth } from '@/lib/auth-api'
import { canUseWorkflow, getWorkflowAccess } from '@/lib/auth/workflow'
import { EMAIL_PLANS, emailUsagePeriod, type EmailPlan } from '@/lib/email-usage'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { privateNoStoreHeaders } from '@/lib/security/request-security'

const updateSchema = z.object({ plan: z.enum(['free', 'pro']) }).strict()

async function context(request?: Request) {
  const { user, error } = await requireStaffAuth(request)
  if (error || !user) return { response: error || NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const access = await getWorkflowAccess(user)
  if (!access || !canUseWorkflow(access, 'admin')) {
    return { response: NextResponse.json({ error: 'Only an administrator can view email usage.' }, { status: 403, headers: privateNoStoreHeaders() }) }
  }
  const admin = getSupabaseAdmin()
  if (!admin) return { response: NextResponse.json({ error: 'Email usage is temporarily unavailable.' }, { status: 503, headers: privateNoStoreHeaders() }) }
  return { user, access, admin }
}

async function readUsage(current: Exclude<Awaited<ReturnType<typeof context>>, { response: NextResponse }>) {
  const dates = emailUsagePeriod()
  const [{ data: setting, error: settingError }, monthly, failed, daily] = await Promise.all([
    current.admin.from('email_usage_settings').select('plan,monthly_limit')
      .eq('workspace_id', current.access.workspaceId).maybeSingle(),
    current.admin.from('email_logs').select('id', { count: 'exact', head: true })
      .eq('status', 'SENT').gte('sent_at', dates.periodStart).lt('sent_at', dates.periodEnd),
    current.admin.from('email_logs').select('id', { count: 'exact', head: true })
      .eq('status', 'FAILED').gte('sent_at', dates.periodStart).lt('sent_at', dates.periodEnd),
    current.admin.from('email_logs').select('id', { count: 'exact', head: true })
      .eq('status', 'SENT').gte('sent_at', dates.dayStart).lt('sent_at', dates.dayEnd),
  ])
  if (settingError || monthly.error || failed.error || daily.error) throw new Error('Email usage query failed.')

  const plan: EmailPlan = setting?.plan === 'pro' ? 'pro' : 'free'
  const allowance = EMAIL_PLANS[plan]
  return {
    plan,
    monthlyLimit: allowance.monthlyLimit,
    dailyLimit: allowance.dailyLimit,
    sentThisMonth: monthly.count || 0,
    failedThisMonth: failed.count || 0,
    sentToday: daily.count || 0,
    periodStart: dates.periodStart,
    periodEnd: dates.periodEnd,
    source: 'fico-mana-email-logs' as const,
  }
}

export async function GET() {
  const current = await context()
  if ('response' in current) return current.response
  try {
    return NextResponse.json(await readUsage(current), { headers: privateNoStoreHeaders() })
  } catch (error) {
    console.error('GET /api/emails/usage', error)
    return NextResponse.json({ error: 'Email usage could not be loaded. Try: refresh Email Logs.' }, { status: 500, headers: privateNoStoreHeaders() })
  }
}

export async function PATCH(request: Request) {
  const current = await context(request)
  if ('response' in current) return current.response
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose the Free or Pro email plan.' }, { status: 400, headers: privateNoStoreHeaders() })

  const plan = parsed.data.plan
  const { error } = await current.admin.from('email_usage_settings').upsert({
    workspace_id: current.access.workspaceId,
    plan,
    monthly_limit: EMAIL_PLANS[plan].monthlyLimit,
    updated_at: new Date().toISOString(),
    updated_by: current.user.id,
  }, { onConflict: 'workspace_id' })
  if (error) {
    console.error('PATCH /api/emails/usage', error)
    return NextResponse.json({ error: 'Email plan could not be saved. Try again.' }, { status: 500, headers: privateNoStoreHeaders() })
  }
  return NextResponse.json(await readUsage(current), { headers: privateNoStoreHeaders() })
}
