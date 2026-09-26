import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { calculateSalesSummary, type SalesPeriod, type SalesReportBy } from '@/lib/sales-finance'
import { getSalesSettings, listSalesAddonOrders, listSalesBookings, listSalesExpenses } from '@/lib/sales-store'
import { secureErrorResponse } from '@/lib/security/error-response'

const VALID_PERIODS = new Set<SalesPeriod>(['day', 'week', 'month', 'quarter', 'year', 'custom'])
const VALID_REPORT_BY = new Set<SalesReportBy>(['shoot_date', 'booking_date'])

export async function GET(request: Request) {
  try {
    const { error: authError } = await requireStaffAuth()
    if (authError) return authError

    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'This service is temporarily unavailable. Try: refresh the page, or contact your administrator.' }, { status: 500 })

    const url = new URL(request.url)
    const requestedPeriod = url.searchParams.get('period') as SalesPeriod | null
    const period: SalesPeriod = requestedPeriod && VALID_PERIODS.has(requestedPeriod) ? requestedPeriod : 'month'
    const anchorRaw = url.searchParams.get('anchor')
    const anchor = anchorRaw ? new Date(`${anchorRaw}T12:00:00`) : new Date()
    if (!Number.isFinite(anchor.getTime())) {
      return NextResponse.json({ error: 'Invalid reporting date.' }, { status: 400 })
    }

    const reportByRaw = url.searchParams.get('reportBy') as SalesReportBy | null
    const reportBy = reportByRaw && VALID_REPORT_BY.has(reportByRaw) ? reportByRaw : 'shoot_date'
    const customStartRaw = url.searchParams.get('start')
    const customEndRaw = url.searchParams.get('end')
    const customStart = customStartRaw ? new Date(`${customStartRaw}T12:00:00`) : undefined
    const customEnd = customEndRaw ? new Date(`${customEndRaw}T12:00:00`) : undefined
    if (period === 'custom' && (!customStart || !customEnd || customEnd < customStart)) {
      return NextResponse.json({ error: 'Choose a valid custom reporting range.' }, { status: 400 })
    }

    const [bookings, addonOrders, expenses, settings] = await Promise.all([
      listSalesBookings(admin),
      listSalesAddonOrders(admin),
      listSalesExpenses(admin, { activeOnly: true, ordered: false }),
      getSalesSettings(admin),
    ])

    return NextResponse.json({
      summary: calculateSalesSummary(bookings, addonOrders, expenses, settings, period, anchor, {
        reportBy,
        customStart,
        customEnd,
      }),
      settings,
    })
  } catch (error) {
    return secureErrorResponse(error, 'Failed to load sales summary.', { request, context: 'GET /api/sales/summary' })
  }
}
