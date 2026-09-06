import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { calculateSalesSummary, type SalesPeriod } from '@/lib/sales-finance'
import { getSalesSettings, listSalesBookings, listSalesExpenses } from '@/lib/sales-store'
import { secureErrorResponse } from '@/lib/security/error-response'

const VALID_PERIODS = new Set<SalesPeriod>(['month', 'quarter', 'year'])

export async function GET(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'Database admin client unavailable.' }, { status: 500 })

    const url = new URL(request.url)
    const requestedPeriod = url.searchParams.get('period') as SalesPeriod | null
    const period: SalesPeriod = requestedPeriod && VALID_PERIODS.has(requestedPeriod) ? requestedPeriod : 'month'
    const anchorRaw = url.searchParams.get('anchor')
    const anchor = anchorRaw ? new Date(`${anchorRaw}T12:00:00`) : new Date()
    if (!Number.isFinite(anchor.getTime())) {
      return NextResponse.json({ error: 'Invalid reporting date.' }, { status: 400 })
    }

    const [bookings, expenses, settings] = await Promise.all([
      listSalesBookings(admin),
      listSalesExpenses(admin, { activeOnly: true, ordered: false }),
      getSalesSettings(admin),
    ])

    return NextResponse.json({
      summary: calculateSalesSummary(bookings, expenses, settings, period, anchor),
      settings,
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to load sales summary.', { request, context: 'GET /api/sales/summary' })
  }
}
