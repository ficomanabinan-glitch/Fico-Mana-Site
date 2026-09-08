import { ADMIN_QUERY_STALE_MS } from './admin-cache-policy'

export type SalesPeriod = 'month' | 'quarter' | 'year'
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
    profitMargin: number
    revenueGoal: number
    revenueGoalProgress: number
    remainingRevenueTarget: number
    averageBookingValue: number
    totalBookings: number
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
const SALES_CACHE_FRESH_MS = ADMIN_QUERY_STALE_MS

type SalesCacheEntry = {
  data: SalesSummaryPayload
  cachedAt: number
}

type SalesViewState = {
  period: SalesPeriod
  anchor: string
}

const salesCache = new Map<string, SalesCacheEntry>()
const salesRequests = new Map<string, Promise<SalesSummaryPayload>>()
let cacheGeneration = 0
let rememberedView: SalesViewState | null = null

export function salesCacheKey(period: SalesPeriod, anchor: string) {
  return `${period}:${anchor}`
}

export function getCachedSales(period: SalesPeriod, anchor: string) {
  return salesCache.get(salesCacheKey(period, anchor))?.data ?? null
}

export function isSalesCacheFresh(period: SalesPeriod, anchor: string) {
  const entry = salesCache.get(salesCacheKey(period, anchor))
  return Boolean(entry && Date.now() - entry.cachedAt < SALES_CACHE_FRESH_MS)
}

export function getRememberedSalesView() {
  return rememberedView
}

export function rememberSalesView(period: SalesPeriod, anchor: string) {
  rememberedView = { period, anchor }
}

export async function fetchSales(
  period: SalesPeriod,
  anchor: string,
  { force = false }: { force?: boolean } = {},
) {
  const key = salesCacheKey(period, anchor)
  const cached = salesCache.get(key)
  if (!force && cached && Date.now() - cached.cachedAt < SALES_CACHE_FRESH_MS) {
    return cached.data
  }
  const currentRequest = salesRequests.get(key)
  if (currentRequest) return currentRequest

  const requestGeneration = cacheGeneration
  const request = (async () => {
    const params = new URLSearchParams({ period, anchor })
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
