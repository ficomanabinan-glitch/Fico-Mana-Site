import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/booking-clarity'
import { renderedContrast } from './fixtures/rendered-contrast'

test.use({ serviceWorkers: 'block' })

for (const width of [390, 768, 1440]) {
test(`public inclusion and weekday labels meet contrast and category controls meet touch size at ${width}`, async ({ booking }, testInfo) => {
  const { page } = booking
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await booking.open(false)
    const category = page.getByRole('button', { name: 'creative', exact: true })
    await category.click()
    const box = await category.boundingBox()
    expect.soft(box!.height, `category target at ${width}`).toBeGreaterThanOrEqual(44)
    const includes = page.getByText('Includes', { exact: true })
    await expect(includes).toBeVisible()
    const inclusion = await renderedContrast(includes)
    expect(inclusion.flat).toBe(true)
    expect.soft(inclusion.ratio, `Includes contrast at ${width}`).toBeGreaterThanOrEqual(4.5)
    await page.getByRole('button', { name: /Synthetic Creative Package/ }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const weekday = page.getByText('Su', { exact: true })
    await expect(weekday).toBeVisible()
    const dayContrast = await renderedContrast(weekday)
    expect(dayContrast.flat).toBe(true)
    expect.soft(dayContrast.ratio, `weekday contrast at ${width}`).toBeGreaterThanOrEqual(4.5)
    await testInfo.attach(`booking-contrast-${width}`, { body: JSON.stringify({ inclusion, dayContrast }), contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath(`booking-readable-calendar-${width}.png`) })
  expect(booking.mutations).toEqual([])
  expect(booking.runtimeErrors).toEqual([])
})
}

async function completeSyntheticBooking(page: Page) {
  await page.getByRole('button', { name: /October 2, 2026/ }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByLabel('Full Name', { exact: false }).fill('Synthetic Copy Test')
  await page.getByLabel('Phone Number').fill('09170000001')
  await page.getByLabel('Email Address *', { exact: true }).fill('copy@example.test')
  await page.getByLabel('Confirm Email Address').fill('copy@example.test')
  await page.getByLabel('Facebook Profile Name').fill('Synthetic Copy Test')
  await page.getByLabel('Facebook Profile Link').fill('https://facebook.com/synthetic.copy')
  await page.getByRole('button', { name: 'Proceed to Payment' }).click()
  await page.getByLabel('BPI Transaction Reference (optional)', { exact: true }).fill('SYNTHETIC-COPY-REF')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /^Upload payment receipt/ }).click()
  await (await chooserPromise).setFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2K0AAAAASUVORK5CYII=', 'base64') })
  await page.getByRole('button', { name: 'Submit Booking', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking Submitted', exact: true })).toBeVisible()
}

for (const label of ['Copy reference', 'Copy transaction ref']) {
  test(`${label} confirms only after completion and recovers from clipboard denial`, async ({ booking }, testInfo) => {
    const { page } = booking
    booking.allowSyntheticSubmission()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: () => new Promise<void>((resolve, reject) => {
          Object.assign(window, { finishSyntheticCopy: (success: boolean) => success ? resolve() : reject(new Error('Synthetic clipboard denial')) })
        }),
      } })
    })
    await booking.open()
    await completeSyntheticBooking(page)
    const copy = page.getByRole('button', { name: label, exact: true })
    await copy.click()
    await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copying…', exact: true })).toBeDisabled()
    await page.evaluate(() => (window as unknown as { finishSyntheticCopy: (success: boolean) => void }).finishSyntheticCopy(false))
    await expect(page.getByRole('alert', { name: `${label} problem` })).toHaveText('Couldn’t copy automatically. Select and copy the reference above.')
    await expect(copy).toBeEnabled()
    await copy.click()
    await page.evaluate(() => (window as unknown as { finishSyntheticCopy: (success: boolean) => void }).finishSyntheticCopy(true))
    await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible()
    await expect(page.getByRole('alert', { name: `${label} problem` })).toHaveCount(0)
    expect(booking.mutations).toEqual(['POST /api/receipts/upload', 'POST /api/bookings'])
    expect(booking.runtimeErrors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`booking-${label.replaceAll(' ', '-')}.png`) })
  })
}
