import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getSalesSettings } from '@/lib/sales-store'

function validMoney(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

export async function GET() {
  const { error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })
  try {
    return NextResponse.json(await getSalesSettings(admin))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load settings.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const { user, error: authError } = await requireStaffAuth()
  if (authError) return authError
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

  try {
    const body = await request.json()
    const monthlyRevenueTarget = validMoney(body.monthlyRevenueTarget)
    const desiredMonthlyProfit = validMoney(body.desiredMonthlyProfit)
    const desiredProfitMargin = Number(body.desiredProfitMargin)

    if (monthlyRevenueTarget === null || desiredMonthlyProfit === null || !Number.isFinite(desiredProfitMargin) || desiredProfitMargin < 0 || desiredProfitMargin > 100) {
      return NextResponse.json({ error: 'Targets must be non-negative and margin must be from 0 to 100.' }, { status: 400 })
    }

    const { error } = await admin.from('sales_settings').upsert({
      id: 'default',
      monthly_revenue_target: monthlyRevenueTarget,
      desired_monthly_profit: desiredMonthlyProfit,
      desired_profit_margin: desiredProfitMargin,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    if (error) throw new Error(error.message)

    return NextResponse.json(await getSalesSettings(admin))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save settings.' }, { status: 500 })
  }
}
