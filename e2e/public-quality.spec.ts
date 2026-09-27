import { test, expect } from '@playwright/test'
import { DEFAULT_WEBSITE_CONTENT } from '../lib/website-content'
import { mkdir } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/website-content') { await route.fulfill({ json: DEFAULT_WEBSITE_CONTENT }); return }
    await route.fulfill({ json: [] })
  })
})

test('missing pages have a real 404, accessible recovery, no canonical, and no overflow', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
  const response = await page.goto('/quality-check-missing-page')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page is out of frame.')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toBeAttached()
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
  const back = page.getByRole('link', { name: 'Back to FICO MANA' })
  await expect(back).toHaveAttribute('href', '/')
  await expect(page.getByRole('link', { name: 'contact the studio' })).toHaveAttribute('href', 'https://www.ficomana.com/#contact')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(back).toBeFocused()
  expect(await back.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  if (!process.env.QA_SKIP_CAPTURE) {
    await mkdir('.impeccable/review', { recursive: true })
    await page.screenshot({ path: `.impeccable/review/${isMobile ? 'mobile' : 'desktop'}.png`, fullPage: true, animations: 'disabled' })
  }
  expect(errors).toEqual([])
  await back.click()
  await expect(page).toHaveURL(/\/$/)
})

for (const path of ['/', '/gallery', '/packages', '/privacy', '/terms']) {
  test(`${path} has one visible H1, its own canonical, and no uncaught browser errors`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    const heading = page.getByRole('heading', { level: 1 })
    await expect(page.locator('h1')).toHaveCount(1)
    await heading.scrollIntoViewIfNeeded()
    await expect(heading).toBeVisible()
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    // Next normalizes the root's trailing slash; compare URL identities.
    expect(new URL((await canonical.getAttribute('href'))!).href).toBe(`https://www.ficomana.com${path}`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    expect(errors).toEqual([])
    if (path === '/' && !process.env.QA_SKIP_CAPTURE) await page.screenshot({ path: testInfo.outputPath('home-heading.png'), animations: 'disabled' })
  })
}
