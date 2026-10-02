import { test as workspaceTest, expect, CLIENT_ID, CLIENT_NAME, FIRST_BOOKING, workspaceBooking } from './fixtures/client-workspace'

const LEGACY_BOOKING = 'FM-W20260920-001'
type StaffFixture = { recover: () => void; failOnly: (path: string) => void; downloadsUnavailable: (value: boolean) => void; reads: string[]; fileReads: string[] }

// Requirements audit: successful-empty displays must never stand in for an initial failed staff read.
// Reuse the existing local session/origin guard; override only the reads under test.
const test = workspaceTest.extend<{ staff: StaffFixture }>({
  staff: async ({ workspace, page, context, baseURL }, provide) => {
    await page.clock.install({ time: new Date('2026-10-01T04:00:00Z') })
    let unavailable = true
    let downloadsFail = false
    let failedPaths = new Set(['/api/bookings', '/api/editor-workflow/filtering', '/api/admin/users', '/api/provisioning'])
    const reads: string[] = [], fileReads: string[] = []
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== new URL(baseURL!).origin) { await route.fallback(); return }
      if (route.request().method() !== 'GET') { await route.fallback(); return }
      if (url.pathname === '/api/editor-workflow/download-requests') {
        reads.push(url.pathname)
        if (downloadsFail) {
          workspace.expectHttpFailure(url.href)
          await route.fulfill({ status: 503, json: { error: 'Synthetic download requests unavailable' } }); return
        }
        await route.fulfill({ json: { requests: [{ id: 'synthetic-download-request', bookingId: FIRST_BOOKING,
          customerName: CLIENT_NAME, packageName: 'FICO Package', shootDate: '2026-10-01',
          reason: 'Please allow another download after my transfer was interrupted.', requestedAt: '2026-10-01T03:00:00Z',
        }] } }); return
      }
      if (['/api/bookings', '/api/editor-workflow/filtering', '/api/blocked-slots', '/api/fico-spot-blocks', '/api/admin/users', '/api/provisioning'].includes(url.pathname)) {
        reads.push(url.pathname)
        if (unavailable && failedPaths.has(url.pathname)) {
          workspace.expectHttpFailure(url.href)
          await route.fulfill({ status: 503, json: { error: 'Synthetic staff records unavailable' } }); return
        }
        if (['/api/blocked-slots', '/api/fico-spot-blocks'].includes(url.pathname)) {
          await route.fulfill({ json: [] }); return
        }
        if (url.pathname === '/api/admin/users') {
          await route.fulfill({ json: { currentUserId: 'client-workspace-test', currentRole: 'owner', accounts: [{
            id: 'client-workspace-test', email: 'workspace@example.test', displayName: CLIENT_NAME, role: 'owner',
            createdAt: '2026-09-01T00:00:00Z', lastSignInAt: null, confirmedAt: '2026-09-01T00:00:00Z', isCurrent: true,
          }] } }); return
        }
        if (url.pathname === '/api/provisioning') {
          await route.fulfill({ json: { items: [{ bookingId: FIRST_BOOKING, customerName: CLIENT_NAME,
            customerEmail: 'ana.maria@example.test', shootDate: '2026-10-01', packageName: 'FICO Package',
            bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit', requiredDeposit: 500,
            provisioningStatus: 'ACTIVE', storageProvider: 'r2', storageStatus: 'ready', lastError: null,
            portal: { id: 'synthetic-portal', publicId: CLIENT_ID, status: 'active', expiresAt: null },
          }], storage: { provider: 'r2', configured: true, privateBucket: true, portalExpiryDays: 30, signedUrlTtlSeconds: 900 } } }); return
        }
        const booking = workspaceBooking()
        if (new URL(page.url()).pathname === '/admin/verification') {
          booking.bookingStatus = 'Pending Verification'; booking.paymentStatus = 'Pending Verification'
        }
        await route.fulfill({ json: [booking] }); return
      }
      if (url.pathname === '/api/editor-files') {
        if (url.searchParams.has('summary')) {
          await route.fulfill({ json: {
            fileCount: 1, indexedBytes: 1024, storageGb: 0.000001, estimatedMonthlyUsd: 0,
            candidateFiles: 0, candidateBytes: 0, categories: [{ category: 'raw', files: 1, bytes: 1024 }],
            retention: { enabled: true, days: 7 }, delivery: { privateWorkerConfigured: true, portalDownloads: 'ZIP', editorBatchDownloads: 'ZIP' },
          } }); return
        }
        fileReads.push(url.href)
        if (url.searchParams.get('booking') === LEGACY_BOOKING) {
          await route.fulfill({ json: { level: 'categories', shootDate: '2026-10-01', booking: { id: LEGACY_BOOKING, customer_name: CLIENT_NAME },
            items: [{ id: 'raw', name: 'raw', file_count: 1, bytes: 1024 }] } }); return
        }
        // Distinct sentinel proves that silently dropping the legacy filter cannot accidentally pass.
        await route.fulfill({ json: { level: 'clients', shootDate: '2026-10-01', items: [{
          id: 'FM-999999', customer_name: 'Unrelated synthetic client', file_count: 1, bytes: 1024,
        }] } }); return
      }
      await route.fallback()
    })
    await provide({ recover: () => { unavailable = false }, failOnly: path => { failedPaths = new Set([path]) },
      downloadsUnavailable: value => { downloadsFail = value }, reads, fileReads })
  },
})

// SC-DOWNLOAD-INDEPENDENCE: a shared filtering outage must not block separately loaded requests.
// Read-only proof only: grant controls are inspected, never activated.
test('Download requests remain independently usable while filtering reads fail and recover their own errors', async ({ workspace, staff }, testInfo) => {
  const { page } = workspace
  await page.goto('/editor/filtering?tab=downloads')
  const main = page.getByRole('main')
  const parentError = main.getByRole('alert').filter({ hasText: 'Client selections could not be loaded.' })
  await expect(parentError).toBeVisible()
  const requests = main.getByRole('region', { name: 'Download requests', exact: true })
  await expect(requests.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await expect(requests.getByText(FIRST_BOOKING, { exact: true })).toBeVisible()
  await expect(requests.getByText('Please allow another download after my transfer was interrupted.', { exact: true })).toBeVisible()
  await expect(requests.getByRole('button', { name: 'Grant access', exact: true })).toBeEnabled()
  await expect(requests.getByText('No download requests', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('download-requests-independent.png') })

  staff.downloadsUnavailable(true)
  await requests.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(requests.getByRole('alert')).toContainText('Download requests unavailable')
  await expect(requests.getByText('No download requests', { exact: true })).toHaveCount(0)
  await expect(parentError).toBeVisible()
  staff.downloadsUnavailable(false)
  await requests.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(requests.getByRole('alert')).toHaveCount(0)
  await expect(requests.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await expect(parentError).toBeVisible()
  expect(staff.reads.filter(path => path === '/api/editor-workflow/download-requests').length).toBeGreaterThanOrEqual(3)
  await page.screenshot({ path: testInfo.outputPath('download-requests-independent-recovered.png') })
})

const routes = [
  { path: '/admin/bookings', heading: 'Booking Management', empty: 'No bookings matching current search criteria.', recovery: 'record' },
  { path: '/admin/verification', heading: 'Payment Verification', empty: 'Verification Queue Empty', recovery: 'record' },
  { path: '/admin/calendar', heading: 'Session Calendar', empty: 'No sessions on this date', recovery: 'record' },
  { path: '/admin/reports', heading: 'Reports', empty: 'Figures are based on your bookings and payments.', recovery: 'report' },
  { path: `/editor/filtering?search=${FIRST_BOOKING}&tab=queue`, heading: 'Client Selections', empty: 'No submissions found', recovery: 'record' },
  { path: '/editor/filtering?tab=overview', heading: 'Client Selections', empty: 'Queue is clear', recovery: 'overview' },
  { path: '/admin/users', heading: 'User Access', empty: 'No staff accounts', recovery: 'accounts' },
  { path: '/editor/client-portals', heading: 'Client Portals', empty: 'No clients match these filters. Choose All statuses or change your search.', recovery: 'portals' },
] as const

for (const scenario of routes) {
  test(`${scenario.path} treats initial read failure as unavailable and retries without false empty success`, async ({ workspace, staff }, testInfo) => {
    const { page } = workspace
    await page.goto(scenario.path)
    await expect(page.getByRole('heading', { name: scenario.heading, exact: true })).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByRole('alert').first()).toBeVisible()
    await expect(main.getByRole('alert').first()).toContainText(/could not|unavailable|couldn’t|cannot/i)
    await expect(main.getByText(scenario.empty, { exact: true })).toHaveCount(0)
    await expect(main.locator('p').filter({ hasText: /Showing\s+0\s+of\s+0/ })).toHaveCount(0)
    if (scenario.recovery === 'report') await expect(main.getByText(/^(?:₱)?0(?:\.00)?$/, { exact: true })).toHaveCount(0)
    if (scenario.recovery === 'overview' || scenario.recovery === 'accounts') await expect(main.getByText('0', { exact: true })).toHaveCount(0)
    if (scenario.recovery === 'overview') await expect(main.getByText('0 active · 0 submitted', { exact: true })).toHaveCount(0)
    if (scenario.recovery === 'portals') await expect(main.getByRole('button', { name: 'Save policy', exact: true })).toHaveCount(0)
    if (scenario.path === '/admin/calendar') await expect(main.getByRole('button', { name: 'Export Excel', exact: true })).toHaveCount(0)
    const retry = main.getByRole('button', { name: /^Retry/i }).first()
    await expect(retry).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('staff-read-failure.png') })
    staff.recover()
    await retry.click()
    await expect(main.getByRole('alert')).toHaveCount(0)
    if (scenario.recovery === 'report') {
      await expect(main.getByText('₱500', { exact: true })).toBeVisible()
      await expect(main.getByText('Figures are based on your bookings and payments.', { exact: true })).toBeVisible()
    } else if (scenario.recovery === 'overview') {
      await expect(main.getByRole('button', { name: /Ready for Editor/ }).getByText('1', { exact: true })).toBeVisible()
      await expect(main.getByText('1 active · 1 submitted', { exact: true })).toBeVisible()
    } else await expect(main.getByText(CLIENT_NAME, { exact: true }).first()).toBeVisible()
    expect(staff.reads.length).toBeGreaterThanOrEqual(2)
    await page.screenshot({ path: testInfo.outputPath('staff-read-recovered.png') })
  })
}

for (const source of ['/api/blocked-slots', '/api/fico-spot-blocks']) {
  test(`Calendar treats unavailable ${source} as unknown capacity even when bookings load`, async ({ workspace, staff }, testInfo) => {
    staff.failOnly(source)
    const { page } = workspace
    await page.goto('/admin/calendar')
    await expect(page.getByRole('heading', { name: 'Session Calendar', exact: true })).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByRole('alert').first()).toBeVisible()
    await expect(main.getByRole('alert').first()).toContainText(/could not|unavailable|couldn’t|cannot/i)
    // Missing studio holds must not be presented as confirmed open capacity.
    await expect(main.getByRole('button', { name: 'Block', exact: true })).toHaveCount(0)
    await expect(main.getByRole('button', { name: 'Export Excel', exact: true })).toHaveCount(0)
    await expect(main.getByText('No sessions on this date', { exact: true })).toHaveCount(0)
    const retry = main.getByRole('button', { name: /^Retry/i }).first()
    await expect(retry).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('calendar-capacity-unavailable.png') })
    staff.recover()
    await retry.click()
    await expect(main.getByRole('alert')).toHaveCount(0)
    await expect(main.getByText(CLIENT_NAME, { exact: true }).first()).toBeVisible()
    expect(staff.reads.filter(path => path === source).length).toBeGreaterThanOrEqual(2)
    await page.screenshot({ path: testInfo.outputPath('calendar-capacity-recovered.png') })
  })
}

test('Files keeps a supported legacy FM-W booking deep-link scoped instead of listing unrelated folders', async ({ workspace, staff }, testInfo) => {
  const returnPath = `/admin/clients/${CLIENT_ID}?booking=${LEGACY_BOOKING}`
  const query = new URLSearchParams({ date: '2026-10-01', booking: LEGACY_BOOKING, return: returnPath })
  await workspace.page.goto(`/editor/files?${query}`)
  await expect.poll(() => staff.fileReads.map(read => new URL(read).searchParams.get('booking'))).toContain(LEGACY_BOOKING)
  await expect(workspace.page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
  await expect(workspace.page.getByText('Unrelated synthetic client', { exact: true })).toHaveCount(0)
  await expect(workspace.page.getByRole('link', { name: 'Back to client workspace', exact: true })).toHaveAttribute('href', returnPath)
  await workspace.page.screenshot({ path: testInfo.outputPath('legacy-booking-files.png') })
})
