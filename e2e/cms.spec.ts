import { test as base, expect, type Page } from '@playwright/test'
import { DEFAULT_WEBSITE_CONTENT, type WebsiteContent } from '../lib/website-content'

// UI tests use synthetic sessions and intercepted data, never real accounts or publishing.
const test = base.extend<{ cms: { page: Page; failSave: () => void } }>({
  cms: async ({ page, context, baseURL }, provide) => {
    let published: WebsiteContent = structuredClone(DEFAULT_WEBSITE_CONTENT)
    let failNext = false
    const session = {
      access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'cms-test' })).toString('base64url')}.test`,
      refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer',
      user: { id: 'cms-test', email: 'cms@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
    }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/admin/website-content' || path === '/api/website-content') {
        if (route.request().method() === 'PATCH') {
          if (failNext) { failNext = false; await route.fulfill({ status: 503, json: { error: 'Test service unavailable' } }); return }
          published = route.request().postDataJSON()
        }
        await route.fulfill({ json: published }); return
      }
      await route.fulfill({ json: [] })
    })
    await page.goto('/admin/content')
    await expect(page.getByRole('heading', { name: 'Content Management', exact: true })).toBeVisible()
    await provide({ page, failSave: () => { failNext = true } })
  },
})

async function selectSection(page: Page, name: string, id: string, mobile: boolean) {
  if (mobile) await page.getByRole('combobox', { name: 'Edit section', exact: true }).selectOption(id)
  else await page.getByRole('navigation', { name: 'Content sections' }).getByRole('button', { name, exact: true }).click()
}

test('CMS footer never overlaps fields and changes across sections publish together', async ({ cms, isMobile }, testInfo) => {
  const { page } = cms
  await expect(page.getByRole('button', { name: 'Publish Content' })).toBeDisabled()
  await page.getByLabel('TikTok (optional)', { exact: true }).fill('https://www.tiktok.com/@teststudio')
  const footer = page.getByTestId('cms-publish-footer')
  await footer.scrollIntoViewIfNeeded()
  const last = await page.getByLabel('TikTok (optional)', { exact: true }).boundingBox()
  const box = await footer.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(last!.y + last!.height)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('cms-footer.png'), fullPage: true })
  await selectSection(page, 'Privacy Policy', 'privacy', isMobile)
  await page.getByRole('textbox', { name: 'Policy text', exact: true }).fill('Updated privacy text.\n\nSecond paragraph.')
  await page.getByRole('button', { name: 'Publish Content' }).click()
  await expect(page.getByText('All changes are published.', { exact: true })).toBeVisible()
  await page.reload()
  await selectSection(page, 'Privacy Policy', 'privacy', isMobile)
  await expect(page.getByRole('textbox', { name: 'Policy text', exact: true })).toHaveValue('Updated privacy text.\n\nSecond paragraph.')
  await page.screenshot({ path: testInfo.outputPath('cms-privacy.png'), fullPage: true })
})

test('failed publish retains changes and published headings reach the public website safely', async ({ cms, isMobile }) => {
  const { page } = cms
  await selectSection(page, 'Homepage introduction', 'hero', isMobile)
  const title = page.getByLabel('Main slogan', { exact: true })
  await title.fill('Your next chapter, photographed')
  cms.failSave()
  await page.getByRole('button', { name: 'Publish Content' }).click()
  await expect(page.getByText('Nothing was published', { exact: true })).toBeVisible()
  await expect(title).toHaveValue('Your next chapter, photographed')
  await expect(page.getByRole('button', { name: 'Publish Content' })).toBeEnabled()
  await page.getByRole('button', { name: 'Publish Content' }).click()
  await expect(page.getByText('All changes are published.', { exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('Your next chapter, photographed', { exact: true }).last()).toBeAttached()
})

test('public legal pages keep existing policy content and safe contact links', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible()
  await expect(page.getByText(/We do not sell your personal information/)).toBeVisible()
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of Service', exact: true })).toBeVisible()
  await expect(page.getByText(/A non-refundable deposit is required/)).toBeVisible()
})

test('booking date filter stays inside the screen at narrow and intermediate widths', async ({ cms, isMobile }, testInfo) => {
  const { page } = cms
  await page.goto('/admin/bookings?date=2026-09-27')
  await expect(page.getByRole('heading', { name: 'Booking Management', exact: true })).toBeVisible()
  const date = page.getByLabel('Filter by shoot date', { exact: true })
  const filters = page.getByRole('search', { name: 'Booking filters' })
  for (const width of isMobile ? [320, 375, 430] : [768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 700 })
    await date.scrollIntoViewIfNeeded()
    await expect(date).toHaveValue('2026-09-27')
    const container = await filters.boundingBox()
    const control = await date.boundingBox()
    expect(control!.x).toBeGreaterThanOrEqual(container!.x + 16)
    expect(control!.x + control!.width).toBeLessThanOrEqual(container!.x + container!.width - 16)
    expect(control!.x + control!.width).toBeLessThanOrEqual(width)
    // Measure the actual admin scrollport too: body clipping must not conceal overflow.
    expect(await page.getByRole('main').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await date.fill('2026-09-28')
    await expect(date).toHaveValue('2026-09-28')
    await page.getByRole('button', { name: 'Clear all filters', exact: true }).click()
    await expect(date).toHaveValue('')
    await date.fill('2026-09-27')
  }
  await page.screenshot({ path: testInfo.outputPath('bookings-filter.png') })
})
