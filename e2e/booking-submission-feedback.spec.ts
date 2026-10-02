import { test, expect } from './fixtures/booking-clarity'
import type { Page } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

async function contact(booking: { page: Page; open: () => Promise<void> }) {
  const { page } = booking
  await booking.open()
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('Full Name', { exact: false }).fill('Synthetic Feedback Test')
  await page.getByLabel('Phone Number').fill('09170000001')
  await page.getByLabel('Email Address *', { exact: true }).fill('feedback@example.test')
  await page.getByLabel('Confirm Email Address').fill('feedback@example.test')
  await page.getByLabel('Facebook Profile Name').fill('Synthetic Feedback Test')
  await page.getByLabel('Facebook Profile Link').fill('https://facebook.com/synthetic.feedback')
}

test('contact errors identify and focus the relevant field without submitting', async ({ booking }) => {
  const { page } = booking
  await contact(booking)
  const confirm = page.getByLabel('Confirm Email Address')
  await confirm.fill('different@example.test')
  await page.getByRole('button', { name: 'Proceed to Payment' }).click()
  await expect(confirm).toBeFocused()
  await expect(confirm).toHaveAttribute('aria-invalid', 'true')
  await expect(confirm).toHaveAccessibleDescription(/Email addresses do not match/)
  await confirm.fill('feedback@example.test')
  await expect(confirm).not.toHaveAttribute('aria-invalid', 'true')
  const facebook = page.getByLabel('Facebook Profile Link')
  await facebook.fill('http://facebook.com/synthetic.invalid')
  await expect(facebook).toHaveValue('http://facebook.com/synthetic.invalid')
  await page.getByRole('button', { name: 'Proceed to Payment' }).click()
  await expect(facebook).toBeFocused()
  await expect(facebook).toHaveAttribute('aria-invalid', 'true')
  await expect(facebook).toHaveAccessibleDescription(/valid Facebook profile link/)
  expect(booking.mutations).toEqual([])
  expect(booking.runtimeErrors).toEqual([])
})

test('submission announces checking, receipt upload, and saving as separate truthful phases', async ({ booking }) => {
  const { page } = booking
  booking.allowSyntheticSubmission()
  await contact(booking)
  await page.getByRole('button', { name: 'Proceed to Payment' }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2K0AAAAASUVORK5CYII=', 'base64') })
  let allowCheck!: () => void, allowReceipt!: () => void, allowSave!: () => void
  const checked = new Promise<void>(resolve => { allowCheck = resolve })
  const uploaded = new Promise<void>(resolve => { allowReceipt = resolve })
  const saved = new Promise<void>(resolve => { allowSave = resolve })
  // All responses are fulfilled inside the browser. No booking/receipt reaches a provider.
  await page.route('**/api/bookings/availability', async route => { await checked; await route.fulfill({ json: [] }) })
  await page.route('**/api/receipts/upload', async route => { await uploaded; await route.fulfill({ json: { receiptUrl: '/synthetic-receipt.png' } }) })
  await page.route('**/api/bookings', async route => { await saved; await route.fulfill({ json: route.request().postDataJSON() }) })
  try {
    await page.getByRole('button', { name: 'Submit Booking', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Checking session availability…')
    allowCheck()
    await expect(page.getByRole('status')).toContainText('Uploading your receipt…')
    allowReceipt()
    await expect(page.getByRole('status')).toContainText('Saving your booking…')
    allowSave()
    await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
    expect(booking.runtimeErrors).toEqual([])
  } finally { allowCheck(); allowReceipt(); allowSave() }
})
