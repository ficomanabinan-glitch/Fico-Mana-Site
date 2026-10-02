import { test as base, expect, type Page } from '@playwright/test'
import { DEFAULT_WEBSITE_CONTENT } from '../../lib/website-content'

export const SYNTHETIC_PACKAGE = { id: 'qa-creative-package', category: 'creative', title: 'Synthetic Creative Package', price: '₱3,500', duration: '30 minutes', description: 'Isolated booking test package.', features: ['Synthetic inclusion'], slotType: 'standard', selectionLimit: 5 }
export const SYNTHETIC_GRADUATION_PACKAGE = { ...SYNTHETIC_PACKAGE, id: 'qa-graduation-package', category: 'graduation', title: 'Synthetic Graduation Package' }
type BookingFixture = { page: Page; mutations: string[]; runtimeErrors: string[]; failAvailability: (value: boolean) => void; failPackages: (value: boolean) => void; useGraduation: () => void; allowSyntheticSubmission: () => void; open: (preselected?: boolean) => Promise<void> }

export const test = base.extend<{ booking: BookingFixture }>({
  booking: async ({ page, context, baseURL }, provide) => {
    const origin = new URL(baseURL!).origin
    const mutations: string[] = [], runtimeErrors: string[] = []
    let availabilityFailure = false, packageFailure = false, graduation = false, syntheticSubmission = false
    await page.clock.install({ time: new Date('2026-10-01T04:00:00Z') })
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) { await route.abort(); return }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      if (route.request().method() !== 'GET') {
        mutations.push(`${route.request().method()} ${url.pathname}`)
        // Opt-in completion tests fulfill both writes in the browser; nothing reaches a server/provider.
        if (syntheticSubmission && route.request().method() === 'POST' && url.pathname === '/api/receipts/upload') { await route.fulfill({ json: { receiptUrl: '/synthetic-receipt.png' } }); return }
        if (syntheticSubmission && route.request().method() === 'POST' && url.pathname === '/api/bookings') { await route.fulfill({ json: route.request().postDataJSON() }); return }
        await route.fulfill({ status: 405, json: { error: 'This read-only test prohibits submissions.' } }); return
      }
      if (url.pathname === '/api/website-content') { await route.fulfill({ json: DEFAULT_WEBSITE_CONTENT }); return }
      if (url.pathname === '/api/packages') { await route.fulfill(packageFailure ? { status: 503, json: { error: 'Synthetic catalog outage' } } : { json: graduation ? [SYNTHETIC_GRADUATION_PACKAGE] : [SYNTHETIC_PACKAGE] }); return }
      if (url.pathname === '/api/bookings/availability' && availabilityFailure) { await route.fulfill({ status: 503, json: { error: 'Synthetic availability outage' } }); return }
      await route.fulfill({ json: [] })
    })
    await provide({ page, mutations, runtimeErrors, failAvailability: value => { availabilityFailure = value }, failPackages: value => { packageFailure = value }, useGraduation: () => { graduation = true }, allowSyntheticSubmission: () => { syntheticSubmission = true }, open: async (preselected = true) => { await page.goto(preselected ? `/?package=${graduation ? 'qa-graduation-package' : 'qa-creative-package'}#booking` : '/#booking') } })
  },
})
export { expect }
