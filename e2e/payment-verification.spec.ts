import { test as base, expect } from '@playwright/test'
import { bookingMutationSchema } from '../lib/security/schemas.ts'
import type { Booking } from '../lib/data-store.ts'

const booking: Booking = { id: 'FM-203904', clientId: '11111111-1111-4111-8111-111111111111',
  customerName: 'Synthetic Verification Client', customerEmail: 'verification@example.test', customerPhone: '09170000001',
  customerFbLink: '', customerFbName: '', packageId: 'fico-synthetic', packageName: 'Synthetic FICO Package',
  bookingDate: '2026-10-04', bookingTime: 'Available Time: 8:00 AM - 4:00 PM', depositAmount: 500, price: 3500,
  bookingStatus: 'Pending Verification', paymentStatus: 'Pending Verification', createdAt: '2026-10-03T01:00:00Z',
  receiptUrl: '/api/receipts/22222222-2222-4222-8222-222222222222',
  paymentHistory: [{ id: 'PAY-SYNTHETIC', amount: 500, method: 'BPI', type: 'Deposit', date: '2026-10-03T01:00:00Z' }] }

type Verification = { writes: Booking[]; failNext: () => void; holdNext: () => () => void }
const test = base.extend<{ verification: Verification }>({
  verification: async ({ page, context, baseURL }, provide, testInfo) => {
    if (new URL(baseURL!).origin !== 'http://127.0.0.1:3200') throw new Error('Synthetic local verification only.')
    await page.clock.install({ time: new Date('2026-10-03T01:00:00Z') })
    const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'client-workspace-test' })).toString('base64url')}.test`,
      refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer',
      user: { id: 'client-workspace-test', email: 'verification@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    const writes: Booking[] = [], violations: string[] = [], runtimeErrors: string[] = []
    let current: Booking = { ...booking }, failNext = false, hold: Promise<void> | null = null, release = () => {}
    page.on('dialog', async dialog => { violations.push('Browser confirmation opened'); await dialog.dismiss() })
    page.on('pageerror', error => runtimeErrors.push(error.message))
    page.on('download', () => violations.push('Customer download attempted'))
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      if (url.origin !== new URL(baseURL!).origin) { violations.push(`Hosted request ${url.origin}`); await route.abort(); return }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      if (url.pathname === '/api/bookings' && method === 'GET') { await route.fulfill({ json: [current] }); return }
      if (url.pathname === '/api/bookings' && method === 'POST') {
        const payload = request.postDataJSON() as Booking; writes.push(payload)
        if (hold) { const pending = hold; hold = null; await pending }
        if (failNext) { failNext = false; await route.fulfill({ status: 503, json: { error: 'Synthetic booking service unavailable. Please retry.' } }); return }
        const parsed = bookingMutationSchema.safeParse(payload)
        if (!parsed.success) { await route.fulfill({ status: 400, json: { error: 'Synthetic strict booking validation rejected the payload.' } }); return }
        current = { ...parsed.data, clientId: booking.clientId } as Booking
        await route.fulfill({ json: current }); return
      }
      if (url.pathname.startsWith('/api/receipts/') && method === 'GET') {
        await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2K0AAAAASUVORK5CYII=', 'base64') }); return
      }
      if (url.pathname === '/api/sync') { await route.fulfill({ json: { ok: true } }); return }
      if (url.pathname === '/api/notifications/dismiss' || url.pathname === '/api/notifications') {
        await route.fulfill({ json: method === 'GET' ? [] : { ok: true } }); return
      }
      if (url.pathname === '/api/editor-workflow/session') { await route.fulfill({ json: { user: { id: 'client-workspace-test', email: 'verification@example.test', displayName: 'Synthetic Admin' },
        workspace: { name: 'Synthetic Studio' }, role: 'admin', capabilities: { admin: true, edit: true, onsite: true } } }); return }
      violations.push(`Unlisted API ${method} ${url.pathname}`)
      await route.fulfill({ status: 405, json: { error: 'Synthetic fixture blocks undeclared APIs.' } })
    })
    try { await provide({ writes, failNext: () => { failNext = true }, holdNext: () => {
      hold = new Promise<void>(resolve => { release = resolve }); return () => { release() }
    } }) } finally {
      release()
      await testInfo.attach('isolated-verification-evidence', { body: JSON.stringify({ writes, violations, runtimeErrors }), contentType: 'application/json' })
      expect(violations).toEqual([]); expect(runtimeErrors).toEqual([])
    }
  },
})
test.use({ serviceWorkers: 'block', locale: 'en-PH', timezoneId: 'Asia/Manila' })

test('approval opens in-site, cancels safely, traps/restores focus and prevents duplicate saves', async ({ page, verification }, testInfo) => {
  await page.goto('/admin/verification')
  const opener = page.getByRole('button', { name: 'Approve', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Approve payment?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('FM-203904')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('approval-confirmation.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  // Native dialogs can allow traversal to browser chrome; page controls stay inert.
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Approve Payment', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused(); expect(verification.writes).toHaveLength(0)
  await opener.click()
  const release = verification.holdNext()
  try {
    await dialog.getByRole('button', { name: 'Approve Payment', exact: true }).evaluate((element: HTMLButtonElement) => { element.click(); element.click() })
    await expect(dialog.getByRole('button', { name: 'Approving…', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape'); await expect(dialog).toBeVisible()
    await expect.poll(() => verification.writes.length).toBe(1)
  } finally { release() }
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Payment approved', { exact: true })).toBeVisible()
  expect(verification.writes[0].bookingStatus).toBe('Confirmed')
  expect(verification.writes[0]).not.toHaveProperty('clientId')
})

test('failed approval keeps the in-site confirmation and can retry', async ({ page, verification }) => {
  await page.goto('/admin/verification'); await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Approve payment?' })
  verification.failNext()
  await dialog.getByRole('button', { name: 'Approve Payment', exact: true }).click()
  await expect(page.getByText('Approval failed', { exact: true })).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('Synthetic booking service unavailable. Please retry.')
  await expect(dialog.getByRole('button', { name: 'Approve Payment', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Approve Payment', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(verification.writes).toHaveLength(2)
})

test('confirmation from a receipt preview returns to that preview without changing the booking', async ({ page, verification }) => {
  await page.goto('/admin/verification')
  await page.getByRole('button', { name: 'View receipt for Synthetic Verification Client FM-203904', exact: true }).click()
  const receipt = page.getByRole('dialog', { name: 'Receipt for Synthetic Verification Client', exact: true })
  const opener = receipt.getByRole('button', { name: 'Approve Payment', exact: true })
  await expect(receipt).toBeVisible()
  await opener.click()
  const confirmation = page.getByRole('dialog', { name: 'Approve payment?', exact: true })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(receipt).toBeVisible()
  await expect(opener).toBeFocused()
  expect(verification.writes).toHaveLength(0)
})

test('ordinary rejection stays in-site and saves its selected reason', async ({ page, verification }) => {
  await page.goto('/admin/verification'); await page.getByRole('button', { name: 'Reject', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Reject Payment Receipt' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Rejection Reason', { exact: true }).selectOption('blurry')
  await dialog.getByRole('button', { name: 'Confirm Rejection', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(verification.writes).toHaveLength(1)
  expect(verification.writes[0].rejectionReasonId).toBe('blurry')
  expect(verification.writes[0].receiptUrl).toBe(booking.receiptUrl)
})

test('forged rejection clears only the intended receipt data with no browser dialog', async ({ page, verification }, testInfo) => {
  await page.route('**/api/bookings', route => route.request().method() === 'GET'
    ? route.fulfill({ json: [{ ...booking, receiptUrl: undefined }] }) : route.fallback())
  await page.goto('/admin/verification')
  const opener = page.getByRole('button', { name: 'Reject — Forged / Not a receipt', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Reject forged receipt?' })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('forged-confirmation.png') })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(opener).toBeFocused()
  expect(verification.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Reject — Forged / Not a receipt', exact: true }).click()
  await dialog.getByRole('button', { name: 'Reject Receipt', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(verification.writes).toHaveLength(1)
  expect(verification.writes[0].receiptUrl).toBe('')
  expect(verification.writes[0].paymentHistory).toEqual([])
})
