import { test, expect } from '@playwright/test'

for (const role of ['editor', 'admin'] as const) {
  test(`Client Selections loads queue positions for ${role} without offering unauthorized changes`, async ({ page, context, baseURL }, testInfo) => {
    await page.clock.install({ time: new Date('2026-09-27T04:00:00Z') })
    const session = {
      access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'queue-test' })).toString('base64url')}.test`,
      refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer',
      user: { id: 'queue-test', email: 'queue@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
    }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    let queueReads = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/editor-workflow/session') {
        await route.fulfill({ json: {
          user: { id: 'queue-test', email: 'queue@example.test', displayName: 'Queue Test' },
          workspace: { name: 'Test Studio' }, role,
          capabilities: { edit: true, onsite: true, admin: role === 'admin' },
        } }); return
      }
      if (path === '/api/editor-workflow/filtering') {
        await route.fulfill({ json: [{
          id: 'FM-TEST', customerName: 'Queue Test Client', customerEmail: 'client@example.test',
          packageId: 'fico', packageName: 'Test Package', bookingDate: '2026-09-27',
          bookingTime: '8:00 AM', bookingStatus: 'Confirmed', rawPhotoStatus: 'submitted',
          createdAt: '2026-09-26T00:00:00Z',
        }] }); return
      }
      if (path === '/api/bookings/client-priorities') {
        queueReads++
        await route.fulfill({ json: [{ bookingId: 'FM-TEST', clientPriority: 1 }] }); return
      }
      await route.fulfill({ json: [] })
    })
    await page.goto('/editor/filtering?tab=calendar')
    await expect(page.getByRole('heading', { name: 'Client Selections', exact: true })).toBeVisible()
    await expect(page.getByText('Queue Test Client', { exact: true })).toBeVisible()
    expect(queueReads).toBeGreaterThan(0)
    await expect(page.getByText('Client queue unavailable', { exact: true })).toHaveCount(0)
    const selector = page.getByRole('combobox', { name: 'Queue position: Client 1 of 1' })
    if (role === 'admin') await expect(selector).toBeEnabled()
    else {
      await expect(selector).toHaveCount(0)
      await expect(page.getByTitle('Queue order is managed by an administrator')).toHaveText('Client 1')
    }
    await page.screenshot({ path: testInfo.outputPath('editor-queue.png'), fullPage: true })
  })
}
