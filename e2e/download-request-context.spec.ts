import {
  test as workspaceTest, expect, CLIENT_NAME, FIRST_BOOKING, OTHER_BOOKING,
  workspaceBooking, workspaceDetails,
} from './fixtures/client-workspace'
import type { PortalRawDownloadRequest } from '../lib/portal-raw-downloads'

const OTHER_NAME = 'Synthetic Mateo Reyes'
const INTENDED_REASON = 'My laptop transfer was interrupted; please let me download my graduation photos again.'
const OTHER_REASON = 'I need a separate copy of my family photos on my new laptop.'

const test = workspaceTest.extend<{ downloadContext: { requestReads: string[] } }>({
  downloadContext: async ({ workspace, context, baseURL }, provide) => {
    // Preserve the shared synthetic session and strict origin/error/mutation guards.
    expect(workspace.page.context()).toBe(context)
    const localOrigin = new URL(baseURL!).origin
    const requestReads: string[] = []
    const requests: PortalRawDownloadRequest[] = [
      { id: 'synthetic-newer-download-request', bookingId: OTHER_BOOKING, customerName: OTHER_NAME,
        packageName: 'FICO Package', shootDate: '2026-10-01', reason: OTHER_REASON,
        requestedAt: '2026-10-01T03:30:00Z' },
      { id: 'synthetic-intended-download-request', bookingId: FIRST_BOOKING, customerName: CLIENT_NAME,
        packageName: 'FICO Package', shootDate: '2026-10-01', reason: INTENDED_REASON,
        requestedAt: '2026-10-01T03:00:00Z' },
    ]
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== localOrigin || route.request().method() !== 'GET') {
        await route.fallback(); return
      }
      if (url.pathname.startsWith('/api/admin/client-workspace/') && url.searchParams.get('section') === 'details') {
        const details = workspaceDetails(url.searchParams.get('booking') || FIRST_BOOKING)
        if (details.sections.portal.data) details.sections.portal.data.pendingDownloadRequests = 1
        await route.fulfill({ json: details }); return
      }
      if (url.pathname === '/api/editor-workflow/filtering') {
        await route.fulfill({ json: [workspaceBooking(FIRST_BOOKING), { ...workspaceBooking(OTHER_BOOKING), customerName: OTHER_NAME }] }); return
      }
      if (url.pathname === '/api/editor-workflow/download-requests') {
        requestReads.push(url.pathname)
        await route.fulfill({ json: { requests } }); return
      }
      await route.fallback()
    })
    await provide({ requestReads })
  },
})

/**
 * Scenario: SC-DOWNLOAD-CONTEXT
 * Requirements: REQ-D1 (preserve the chosen booking), REQ-D2 (return to all), INV-D3 (read only).
 * Priority: P1. An unrelated, newer request must not displace the intended client's context.
 */
test('Review download request retains the chosen client context and can explicitly return to all requests', async ({ workspace, downloadContext }, testInfo) => {
  const { page } = workspace
  await workspace.open(FIRST_BOOKING)
  const review = page.getByRole('region', { name: 'Client workspace', exact: true })
    .getByRole('link', { name: 'Review download request', exact: true })
  await expect(review).toBeVisible()
  await review.click()
  await expect(page).toHaveURL(url => url.pathname === '/editor/filtering'
    && url.searchParams.get('search') === FIRST_BOOKING && url.searchParams.get('tab') === 'downloads')

  const panel = page.getByRole('region', { name: 'Download requests', exact: true })
  await expect(panel.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('download-request-intended-context.png'), fullPage: true })
  // The URL alone is not proof: the actual destination must honor the chosen booking.
  await expect(panel.getByRole('article')).toHaveCount(1)
  const intended = panel.getByRole('article')
  await expect(intended.getByText(FIRST_BOOKING, { exact: true })).toBeVisible()
  await expect(intended.getByText(INTENDED_REASON, { exact: true })).toBeVisible()
  await expect(intended.getByRole('button', { name: 'Grant access', exact: true })).toBeEnabled()
  await expect(panel.getByText(OTHER_BOOKING, { exact: true })).toHaveCount(0)
  await expect(panel.getByText(OTHER_REASON, { exact: true })).toHaveCount(0)

  await panel.getByRole('button', { name: 'Show all download requests', exact: true }).click()
  await expect(panel.getByRole('article')).toHaveCount(2)
  await expect(panel.getByText(FIRST_BOOKING, { exact: true })).toBeVisible()
  await expect(panel.getByText(INTENDED_REASON, { exact: true })).toBeVisible()
  await expect(panel.getByText(OTHER_BOOKING, { exact: true })).toBeVisible()
  await expect(panel.getByText(OTHER_REASON, { exact: true })).toBeVisible()
  expect(downloadContext.requestReads.length).toBeGreaterThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('download-request-all-context.png'), fullPage: true })
})
