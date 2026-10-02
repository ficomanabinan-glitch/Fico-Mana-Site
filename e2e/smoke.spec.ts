import { test as base, expect } from '@playwright/test'
import { PortalSample } from './pages/portal-sample'

const test = base.extend<{ portal: PortalSample }>({
  portal: async ({ page }, provide) => { await provide(new PortalSample(page)) },
})

test('sample gallery opens without a real booking and fits the viewport', async ({ portal, page, isMobile }, testInfo) => {
  const mutations: string[] = [], runtimeErrors: string[] = []
  page.on('pageerror', error => runtimeErrors.push(error.message))
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') mutations.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    await route.fulfill({ status: 405, json: { error: 'The sample must not submit a booking.' } })
  })
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  await portal.open()
  await expect(portal.heading).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose 5 more', exact: true })).toBeDisabled()
  await expect(page.getByRole('complementary', { name: 'Sample portal information' })).toBeVisible()
  for (let index = 1; index <= 5; index++) {
    await page.getByRole('button', { name: new RegExp(`^View or select SAMPLE-0${index}\\.`) }).click()
    if (!isMobile) {
      // Desktop click previews only; selection remains an explicit action.
      await expect(page.getByRole('button', { name: `Selected ${index - 1}`, exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Select photo', exact: true }).click()
    }
    await expect(page.getByRole('button', { name: `Selected ${index}`, exact: true })).toBeVisible()
  }
  const continueButton = page.getByRole('button', { name: /Continue to free prints/i })
  await expect(continueButton).toBeEnabled()
  const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.width + 1)
  await continueButton.click()
  await expect(page.getByRole('button', { name: 'Free Prints', exact: true })).toBeEnabled()
  for (const title of ['Toga picture', 'Alampay / Barong', 'Frame', 'Wallet size']) {
    await page.getByRole('button', { name: `Use SAMPLE-01.JPG for ${title}`, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Continue to Add-ons', exact: true }).click()
  await page.getByRole('button', { name: 'Continue to Review', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review your choices', exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: /I have reviewed my photos/ }).check()
  await page.getByRole('button', { name: 'Finish sample', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your sample choices', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Your practice choices were not submitted or saved to a booking.' })).toBeVisible()
  const widths = isMobile ? [390] : [1440, 768]
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : width === 390 ? 844 : 900 })
    await page.getByRole('heading', { name: 'Your sample choices', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`portal-sample-review-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  }
  expect(mutations).toEqual([])
  expect(runtimeErrors).toEqual([])
})

for (const path of ['/admin/users', '/admin/bookings', '/editor/client-portals', '/editor/files', '/editor/onsite']) {
  test(`anonymous visitor cannot open ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/(?:admin(?:\?.*)?|editor\/login(?:\?.*)?)$/)
  })
}
