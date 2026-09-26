import { STAFF_READ_FRESH_MS } from './admin-cache-policy.ts'

export type SalesPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
export type SalesReportBy = 'shoot_date' | 'booking_date'
export const SALES_DATA_CHANGED_EVENT = 'admin:sales-data-changed'

export type SalesTrendPoint = {
  key: string
  label: string
  revenue: number
  expenses: number
  netProfit: number
}

export type SalesSummaryPayload = {
  summary: {
    bookedSales: number
    cashCollected: number
    outstandingReceivables: number
    fixedExpenses: number
    variableExpenses: number
    totalExpenses: number
    netProfit: number
    projectedProfit: number
    profitMargin: number
    revenueGoal: number
    revenueGoalProgress: number
    remainingRevenueTarget: number
    averageBookingValue: number
    totalBookings: number
    unpaidBookingCount: number
    sessions: { total: number; completed: number; upcoming: number; cancelled: number }
    revenueBreakdown: {
      packageRevenue: number
      addonRevenue: number
      printFrameRevenue: number
      otherAddonRevenue: number
      discounts: number
      total: number
    }
    packagePerformance: Array<{ name: string; bookings: number; revenue: number; share: number; averageValue: number }>
    addonPerformance: Array<{ name: string; quantity: number; revenue: number }>
    bookingsNeeded: number | null
    averageVariableCost: number
    contributionPerBooking: number
    breakEvenBookings: number | null
    desiredProfit: number
    desiredProfitBookings: number | null
    desiredProfitMargin: number
    daily: SalesTrendPoint[]
    monthly: SalesTrendPoint[]
  }
  settings: {
    monthlyRevenueTarget: number
    desiredMonthlyProfit: number
    desiredProfitMargin: number
  }
}

const SALES_CACHE_LIMIT = 12

type SalesCacheEntry = {
  data: SalesSummaryPayload
  cachedAt: number
}

type SalesViewState = {
  period: SalesPeriod
  anchor: string
  reportBy?: SalesReportBy
  start?: string
  end?: string
}

const salesCache = new Map<string, SalesCacheEntry>()
const salesRequests = new Map<string, Promise<SalesSummaryPayload>>()
let cacheGeneration = 0
let rememberedView: SalesViewState | null = null

export function salesCacheKey(period: SalesPeriod, anchor: string, reportBy: SalesReportBy = 'shoot_date', start = '', end = '') {
  return `${period}:${anchor}:${reportBy}:${start}:${end}`
}

export function getCachedSales(period: SalesPeriod, anchor: string, reportBy: SalesReportBy = 'shoot_date', start = '', end = '') {
  return salesCache.get(salesCacheKey(period, anchor, reportBy, start, end))?.data ?? null
}

export function isSalesCacheFresh(period: SalesPeriod, anchor: string, reportBy: SalesReportBy = 'shoot_date', start = '', end = '') {
  const entry = salesCache.get(salesCacheKey(period, anchor, reportBy, start, end))
  return Boolean(entry && Date.now() - entry.cachedAt < STAFF_READ_FRESH_MS)
}

export function getRememberedSalesView() {
  return rememberedView
}

export function rememberSalesView(period: SalesPeriod, anchor: string, reportBy: SalesReportBy = 'shoot_date', start?: string, end?: string) {
  rememberedView = {
    period,
    anchor,
    ...(reportBy === 'shoot_date' ? {} : { reportBy }),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  }
}

export async function fetchSales(
  period: SalesPeriod,
  anchor: string,
  { force = false, reportBy = 'shoot_date', start = '', end = '' }: { force?: boolean; reportBy?: SalesReportBy; start?: string; end?: string } = {},
) {
  const key = salesCacheKey(period, anchor, reportBy, start, end)
  const cached = salesCache.get(key)
  if (!force && cached && Date.now() - cached.cachedAt < STAFF_READ_FRESH_MS) {
    return cached.data
  }
  const currentRequest = salesRequests.get(key)
  if (currentRequest) return currentRequest

  const requestGeneration = cacheGeneration
  const request = (async () => {
    const params = new URLSearchParams({ period, anchor, reportBy })
    if (period === 'custom') {
      params.set('start', start)
      params.set('end', end)
    }
    const response = await fetch(`/api/sales/summary?${params}`, {
      cache: 'no-store',
      credentials: 'include',
    })
    const body = (await response.json().catch(() => ({}))) as SalesSummaryPayload & { error?: string }
    if (!response.ok) throw new Error(body.error || 'Could not load sales data.')
    if (requestGeneration === cacheGeneration) {
      salesCache.delete(key)
      salesCache.set(key, { data: body, cachedAt: Date.now() })
      while (salesCache.size > SALES_CACHE_LIMIT) {
        const oldestKey = salesCache.keys().next().value as string | undefined
        if (!oldestKey) break
        salesCache.delete(oldestKey)
      }
    }
    return body
  })()

  salesRequests.set(key, request)
  try {
    return await request
  } finally {
    if (salesRequests.get(key) === request) salesRequests.delete(key)
  }
}

export function invalidateSalesDataCache() {
  cacheGeneration += 1
  // A mutation makes summaries stale, not absent. Keep the last view on screen
  // until its replacement arrives; sign-out still removes every snapshot.
  for (const [key, entry] of salesCache) salesCache.set(key, { ...entry, cachedAt: 0 })
  salesRequests.clear()
}

export function signalSalesDataChanged() {
  invalidateSalesDataCache()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SALES_DATA_CHANGED_EVENT))
  }
}

export function clearSalesReadCache() {
  invalidateSalesDataCache()
  salesCache.clear()
  rememberedView = null
}
