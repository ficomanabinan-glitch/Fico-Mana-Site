import { test as base, expect } from '@playwright/test'
import type { SalesSummaryPayload } from '../../lib/sales-read-cache'

type Mode = 'failed' | 'empty' | 'ready'
type Read = { method: string; path: string; query: string; status: number }
type AdminRecoveryFixture = {
  packages: (mode: Mode) => void
  sales: (mode: Mode) => void
  holdPackages: () => { requested: Promise<void>; release: () => void }
  reads: Read[]
}

function salesPayload(empty: boolean): SalesSummaryPayload {
  const revenue = empty ? 0 : 3500
  return {
    summary: {
      bookedSales: revenue, cashCollected: empty ? 0 : 500, outstandingReceivables: empty ? 0 : 3000,
      fixedExpenses: 0, variableExpenses: 0, totalExpenses: 0, netProfit: revenue,
      projectedProfit: revenue, profitMargin: empty ? 0 : 100, revenueGoal: 10000,
      revenueGoalProgress: empty ? 0 : 35, remainingRevenueTarget: 10000 - revenue,
      averageBookingValue: revenue, totalBookings: empty ? 0 : 1, unpaidBookingCount: empty ? 0 : 1,
      sessions: { total: empty ? 0 : 1, completed: 0, upcoming: empty ? 0 : 1, cancelled: 0 },
      revenueBreakdown: { packageRevenue: revenue, addonRevenue: 0, printFrameRevenue: 0, otherAddonRevenue: 0, discounts: 0, total: revenue },
      packagePerformance: empty ? [] : [{ name: 'Synthetic FICO Package', bookings: 1, revenue, share: 100, averageValue: revenue }],
      addonPerformance: [], bookingsNeeded: null, averageVariableCost: 0, contributionPerBooking: revenue,
      breakEvenBookings: null, desiredProfit: 1000, desiredProfitBookings: null, desiredProfitMargin: 20,
      daily: [], monthly: [],
    },
    settings: { monthlyRevenueTarget: 10000, desiredMonthlyProfit: 1000, desiredProfitMargin: 20 },
  }
}

export const test = base.extend<{ adminRecovery: AdminRecoveryFixture }>({
  adminRecovery: async ({ page, context, baseURL }, provide, testInfo) => {
    if (new URL(baseURL!).origin !== 'http://127.0.0.1:3200') throw new Error('Admin recovery requires the owned isolated port3200.')
    await page.clock.install({ time: new Date('2026-10-01T04:00:00Z') })
    const session = {
      access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'client-workspace-test' })).toString('base64url')}.test`,
      refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer',
      user: { id: 'client-workspace-test', email: 'admin-recovery@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
    }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    let packageMode: Mode = 'failed', salesMode: Mode = 'failed'
    let hold: { pending: Promise<void>; release: () => void; notify: () => void } | null = null
    const reads: Read[] = [], violations: string[] = [], errors: string[] = [], classifiedErrors: string[] = []
    const expectedFailures = new Set<string>()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() !== 'error') return
      if (/^Failed to load resource: the server responded with a status of 503(?:\s|\()/.test(message.text()) && expectedFailures.has(message.location().url)) {
        classifiedErrors.push(`${message.location().url}|503`); return
      }
      errors.push(message.text())
    })
    page.on('download', () => violations.push('Actual download started'))
    context.on('page', popup => { if (popup !== page) violations.push('Unexpected popup') })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      if (url.origin !== 'http://127.0.0.1:3200') { violations.push(`Hosted origin ${url.origin}`); await route.abort(); return }
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method) || /\/(?:download|upload|raw-photos-folder|deliverables-folder)(?:\/|$)/.test(url.pathname)) {
          violations.push(`Forbidden document/content ${method} ${url.pathname}`); await route.abort(); return
        }
        await route.continue(); return
      }
      const reply = async (json: unknown, status = 200) => {
        reads.push({ method, path: url.pathname, query: url.search, status })
        if (status === 503) expectedFailures.add(url.href)
        await route.fulfill({ status, json })
      }
      // Existing shell infrastructure emits this POST on mount. In-memory no-op only;
      // no business mutation, real synchronization, or provider call is permitted.
      if (method === 'POST' && url.pathname === '/api/sync') {
        await reply({ ok: true, bookingsPushed: 0, bookingsUpdated: 0, notificationsPushed: 0, packagesSynced: false }); return
      }
      if (method !== 'GET') { violations.push(`Forbidden mutation ${method} ${url.pathname}`); await route.fulfill({ status: 405, json: { error: 'Read-only fixture prohibits writes.' } }); return }
      if (url.pathname === '/api/admin/packages') {
        if (hold) { const active = hold; active.notify(); await active.pending; if (hold === active) hold = null }
        if (packageMode === 'failed') { await reply({ error: 'Synthetic package catalog unavailable.' }, 503); return }
        await reply(packageMode === 'empty' ? [] : [{ id: 'fico-synthetic', category: 'self-portrait', title: 'Synthetic FICO Package',
          price: '₱1,500', priceAmount: 1500, features: ['Synthetic metadata only'], slotType: 'standard', selectionLimit: 5, isActive: true, sortOrder: 1 }]); return
      }
      if (url.pathname === '/api/sales/summary') {
        if (salesMode === 'failed') { await reply({ error: 'Synthetic sales report unavailable.' }, 503); return }
        await reply(salesPayload(salesMode === 'empty')); return
      }
      if (['/api/bookings', '/api/notifications', '/api/admin/addons', '/api/admin/website-media'].includes(url.pathname)) { await reply([]); return }
      if (url.pathname === '/api/editor-workflow/session') {
        await reply({ user: { id: 'client-workspace-test', email: 'admin-recovery@example.com', displayName: 'Synthetic Admin' }, workspace: { name: 'Synthetic Studio' },
          role: 'admin', capabilities: { edit: true, onsite: true, admin: true } }); return
      }
      violations.push(`Unlisted metadata/API ${method} ${url.pathname}`)
      await route.fulfill({ status: 405, json: { error: 'Only declared metadata APIs are permitted.' } })
    })
    try {
      await provide({ packages: value => { packageMode = value }, sales: value => { salesMode = value }, reads,
        holdPackages: () => {
          let release!: () => void, notify!: () => void
          const pending = new Promise<void>(resolve => { release = resolve })
          const requested = new Promise<void>(resolve => { notify = resolve })
          hold = { pending, release, notify }; return { requested, release }
        },
      })
    } finally {
      const unfinished = hold as { release: () => void } | null
      unfinished?.release()
      await testInfo.attach('admin-recovery-intercepted-evidence', { body: JSON.stringify({ reads, classifiedErrors, violations, errors }), contentType: 'application/json' })
      expect(violations, 'No hosted/private-content/download/business mutations').toEqual([])
      expect(errors, 'Only exact declared503 resource errors expected').toEqual([])
    }
  },
})
export { expect }
