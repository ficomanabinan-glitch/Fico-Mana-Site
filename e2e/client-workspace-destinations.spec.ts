import { test, expect, FIRST_BOOKING, OTHER_BOOKING, CLIENT_NAME, workspaceBooking } from './fixtures/client-workspace'

// Read-only destination checks: no private-photo, approval, email, or download mutation.
test('manage client portal opens only the selected booking and preserves a return path', async ({ workspace }) => {
  const { page } = workspace
  await page.route('**/api/provisioning', route => route.fulfill({ json: {
    storage: { provider: 'r2', configured: true, privateBucket: true, portalExpiryDays: 30, signedUrlTtlSeconds: 300 },
    items: [FIRST_BOOKING, OTHER_BOOKING].map(id => {
      const booking = workspaceBooking(id)
      return { bookingId: id, customerName: booking.customerName, customerEmail: booking.customerEmail,
        shootDate: booking.bookingDate, packageName: booking.packageName, bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus, requiredDeposit: 500, provisioningStatus: 'ACTIVE',
        storageProvider: 'r2', storageStatus: 'ready', lastError: null,
        portal: { id: `synthetic-${id}`, publicId: `synthetic-${id}`, status: 'active', expiresAt: null } }
    }),
  } }))
  await workspace.open(FIRST_BOOKING)
  await page.locator('summary').filter({ hasText: /^Portal and delivery›$/ }).click()
  await page.getByRole('link', { name: 'Manage client portal', exact: true }).click()
  await expect(page).toHaveURL(url => url.pathname === '/editor/client-portals' && url.searchParams.get('search') === FIRST_BOOKING)
  await expect(page.getByLabel('Search clients', { exact: true })).toHaveValue(FIRST_BOOKING)
  await expect(page.getByText(FIRST_BOOKING, { exact: true })).toBeVisible()
  await expect(page.getByText(OTHER_BOOKING, { exact: true })).toHaveCount(0)
  await expect(page.getByText('Showing 1 of 2 clients', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to client workspace', exact: true })).toHaveCount(1)
})

test('editing batch opens the actual selected batch with its linked client', async ({ workspace }) => {
  const { page } = workspace
  const batchId = 'FM-BATCH-2026-10-01-MAIN'
  await page.route(`**/api/editor-workflow/batches/${batchId}`, route => route.fulfill({ json: {
    id: batchId, shootDate: '2026-10-01', totalClients: 1, totalSelectedPhotos: 5,
    counts: { waitingForSelection: 0, readyForEditing: 1, downloaded: 0, editing: 0,
      readyToUpload: 0, uploading: 0, delivered: 0, failed: 0 },
    jobs: [{ id: 'synthetic-job', bookingId: FIRST_BOOKING, clientId: '11111111-1111-4111-8111-111111111111',
      customerName: CLIENT_NAME, customerEmail: 'ana.maria@example.test', packageName: 'FICO Package',
      bookingTime: '8:00 AM – 4:00 PM', status: 'READY_FOR_EDITING', selectedCount: 5, expectedOutputCount: 5,
      galleryCount: 20, selectionStatus: 'SUBMITTED', selectionClientStatus: 'Submitted', selectionRequiredCount: 5,
      enhancementPreferences: [], printAllocations: [], addonOrders: [], totalAddonAmount: 0,
      deliverableCount: 0, storageReady: true }], auditLogs: [], needsReview: [],
  } }))
  await workspace.open(FIRST_BOOKING)
  await page.locator('summary').filter({ hasText: /^Production and files›$/ }).click()
  await page.locator('summary').filter({ hasText: /^Selection and editing workflows$/ }).click()
  await page.getByRole('link', { name: 'Editing batch', exact: true }).click()
  await expect(page).toHaveURL(url => url.pathname === `/editor/batch/${batchId}`)
  await expect(page.getByText(CLIENT_NAME, { exact: true })).toBeVisible()
  await expect(page.getByText(`8:00 AM – 4:00 PM · FICO Package · ${FIRST_BOOKING}`, { exact: true })).toBeVisible()
  await expect(page.getByText('Batch not found.', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Back to client workspace', exact: true })).toHaveCount(1)
})
