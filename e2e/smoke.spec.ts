import { test as base, expect } from '@playwright/test'
import { PortalSample } from './pages/portal-sample'

const test = base.extend<{ portal: PortalSample }>({
  portal: async ({ page }, provide) => { await provide(new PortalSample(page)) },
})

test('sample gallery opens without a real booking and fits the viewport', async ({ portal, page, isMobile }) => {
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
})

for (const path of ['/admin/users', '/admin/bookings', '/editor/client-portals', '/editor/files', '/editor/onsite']) {
  test(`anonymous visitor cannot open ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveURL(/\/(?:admin(?:\?.*)?|editor\/login(?:\?.*)?)$/)
  })
}
