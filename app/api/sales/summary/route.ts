import { NextResponse } from 'next/server'
import { requireStaffAuth } from '@/lib/auth-api'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { listBookingsFromDb } from '@/lib/supabase-store'
import { calculateSalesSummary, type SalesPeriod } from '@/lib/sales-finance'
import { getSalesSettings, listSalesExpenses } from '@/lib/sales-store'

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
      listBookingsFromDb(admin),
      listSalesExpenses(admin),
      getSalesSettings(admin),
    ])

    if (!bookings) return NextResponse.json({ error: 'Could not load bookings.' }, { status: 500 })

    return NextResponse.json({
      summary: calculateSalesSummary(bookings, expenses, settings, period, anchor),
      settings,
      expenses,
    })
  } catch (error) {
    console.error('GET /api/sales/summary', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load sales summary.' }, { status: 500 })
  }
}
