import { test, expect } from './fixtures/admin-service-recovery'

test.use({ serviceWorkers: 'block', locale: 'en-PH', timezoneId: 'Asia/Manila' })
for (const width of [390, 768, 1440]) {
  test.describe(`admin service recovery at ${width}`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 } })

    /** AR-P; AR-1/3/4/5. RED before app repairs. Human review DEFER. */
    test('package read outage is not false empty and retry preserves filters', async ({ page, adminRecovery }, testInfo) => {
      const held = adminRecovery.holdPackages()
      await page.goto('/admin/packages')
      await held.requested
      await expect(page.getByRole('heading', { name: 'Package Manager', exact: true })).toBeVisible()
      await page.getByRole('textbox', { name: 'Search packages', exact: true }).fill('Synthetic')
      await page.getByRole('combobox', { name: 'Package category', exact: true }).selectOption('self-portrait')
      // Existing loading branch does not render draft fields yet. This proves the
      // pending Add Package editor intent survives the read failure, not typed draft retry.
      await page.getByRole('button', { name: 'Add Package', exact: true }).click()
      const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/packages' && response.status() === 503)
      held.release(); await failed
      await expect(page.getByRole('heading', { name: 'Add Package', exact: true })).toBeVisible()
      await page.getByLabel('Package Name', { exact: true }).fill('FICO Synthetic Unsaved Draft')
      await expect(page.getByLabel('Package Name', { exact: true })).toHaveValue('FICO Synthetic Unsaved Draft')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.screenshot({ path: testInfo.outputPath(`packages-outage-${width}.png`) })
      await expect.soft(page.getByText('Total Packages', { exact: true })).toHaveCount(0)
      await expect.soft(page.getByText('Visible on Website', { exact: true })).toHaveCount(0)
      await expect.soft(page.getByText('No packages match these filters.', { exact: true })).toHaveCount(0)
      await expect(page.getByLabel('Loading package catalog', { exact: true })).toHaveCount(0)
      const retry = page.getByRole('alert').getByRole('button', { name: 'Retry package catalog', exact: true })
      await expect(retry).toBeVisible()
      adminRecovery.packages('empty')
      await retry.focus(); await expect(retry).toBeFocused(); await page.keyboard.press('Enter')
      await expect(page.getByText('No packages match these filters.', { exact: true })).toBeVisible()
      await expect(page.getByText('Total Packages', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry package catalog', exact: true })).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: 'Search packages', exact: true })).toHaveValue('Synthetic')
      await expect(page.getByRole('combobox', { name: 'Package category', exact: true })).toHaveValue('self-portrait')
      expect(adminRecovery.reads.filter(read => read.path === '/api/admin/packages').map(read => read.status)).toEqual([503, 200])
      await expect(page).toHaveURL(/\/admin\/packages$/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath(`packages-empty-recovered-${width}.png`) })
    })

    /** AR-S; AR-2/3/4/5. RED before app repairs. Human review DEFER. */
    test('sales outage ends loading and retry retains reporting context and dirty targets', async ({ page, adminRecovery }, testInfo) => {
      await page.goto('/admin/sales')
      await expect(page.getByRole('heading', { name: 'Sales Management', exact: true })).toBeVisible()
      await page.getByRole('combobox', { name: 'Sales reporting period', exact: true }).selectOption('week')
      await page.getByLabel('Sales reporting date', { exact: true }).fill('2026-10-02')
      const failed = page.waitForResponse(response => {
        const url = new URL(response.url())
        return url.pathname === '/api/sales/summary' && url.searchParams.get('reportBy') === 'booking_date' && response.status() === 503
      })
      await page.getByRole('combobox', { name: 'Report sales by', exact: true }).selectOption('booking_date')
      await failed
      await page.screenshot({ path: testInfo.outputPath(`sales-outage-${width}.png`) })
      await expect.soft(page.getByLabel('Loading sales data', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Booked Revenue', { exact: true })).toHaveCount(0)
      const retry = page.getByRole('alert').getByRole('button', { name: 'Retry sales data', exact: true })
      await expect(retry).toBeVisible()
      await expect(page.getByText('Sales data unavailable', { exact: true })).toHaveCount(0)
      adminRecovery.sales('empty')
      await retry.focus(); await expect(retry).toBeFocused(); await page.keyboard.press('Enter')
      const booked = page.getByTitle('Total value of confirmed bookings and selected add-ons for this period.', { exact: true })
      await expect(booked).toContainText('₱0')
      await expect(page.getByText('No package sales in this period.', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry sales data', exact: true })).toHaveCount(0)
      await expect(page.getByText('Sales data unavailable', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('combobox', { name: 'Sales reporting period', exact: true })).toHaveValue('week')
      await expect(page.getByLabel('Sales reporting date', { exact: true })).toHaveValue('2026-10-02')
      await expect(page.getByRole('combobox', { name: 'Report sales by', exact: true })).toHaveValue('booking_date')
      const emptyRead = adminRecovery.reads.filter(read => read.path === '/api/sales/summary').at(-1)!
      expect(new URLSearchParams(emptyRead.query).get('period')).toBe('week')
      expect(new URLSearchParams(emptyRead.query).get('anchor')).toBe('2026-10-02')
      expect(new URLSearchParams(emptyRead.query).get('reportBy')).toBe('booking_date')
      adminRecovery.sales('ready')
      await page.getByRole('combobox', { name: 'Sales reporting period', exact: true }).selectOption('day')
      await expect(booked).toContainText('₱3,500')
      const target = page.getByRole('spinbutton', { name: 'Monthly Revenue Target', exact: true })
      await target.fill('77777')
      adminRecovery.sales('failed')
      const refreshFailure = page.waitForResponse(response => new URL(response.url()).pathname === '/api/sales/summary' && response.status() === 503)
      // Existing app refresh event, not a business write or invented API.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('admin:sales-data-changed')))
      await refreshFailure
      await expect(retry).toBeVisible()
      await expect(target).toHaveValue('77777')
      adminRecovery.sales('ready')
      await retry.focus(); await page.keyboard.press('Enter')
      await expect(page.getByRole('button', { name: 'Retry sales data', exact: true })).toHaveCount(0)
      await expect(target).toHaveValue('77777')
      await expect(page.getByRole('combobox', { name: 'Sales reporting period', exact: true })).toHaveValue('day')
      await expect(page.getByLabel('Sales reporting date', { exact: true })).toHaveValue('2026-10-02')
      await expect(page.getByRole('combobox', { name: 'Report sales by', exact: true })).toHaveValue('booking_date')
      await expect(page).toHaveURL(/\/admin\/sales$/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath(`sales-recovered-${width}.png`) })
    })
  })
}
