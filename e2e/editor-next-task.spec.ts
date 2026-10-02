import { test, expect } from '@playwright/test'

// REQ-4/5: local synthetic responses exercise the real rendered dashboard only.
for (const scenario of ['failed-upload', 'onsite-only', 'unavailable'] as const) {
  test(`editor next task is truthful and capability-scoped: ${scenario}`, async ({ page, context, baseURL, isMobile }, testInfo) => {
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
    await page.clock.install({ time: new Date('2026-10-01T04:00:00Z') })
    const origin = new URL(baseURL!).origin
    const user = { id: 'next-task-test', email: 'next-task@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }
    const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: user.id })).toString('base64url')}.test`, refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    let fails = scenario === 'unavailable'
    const mutations: string[] = [], runtimeErrors: string[] = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) { await route.abort(); return }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      if (route.request().method() !== 'GET') { mutations.push(`${route.request().method()} ${url.pathname}`); await route.fulfill({ status: 405, json: {} }); return }
      if (url.pathname === '/api/editor-workflow/session') { await route.fulfill({ json: { user: { ...user, displayName: 'Synthetic Editor' }, workspace: { name: 'Synthetic Studio' }, role: scenario === 'onsite-only' ? 'onsite' : 'editor', capabilities: { edit: scenario !== 'onsite-only', onsite: true, admin: false } } }); return }
      if (url.pathname === '/api/editor-workflow/batches') {
        if (fails) { await route.fulfill({ status: 503, json: { error: 'Synthetic batch outage' } }); return }
        await route.fulfill({ json: [{ id: 'FM-BATCH-SYNTHETIC', workspaceId: 'synthetic', shootDate: '2026-10-01', locationKey: 'MAIN', status: 'FAILED', totalClients: 1, totalSelectedPhotos: 5, storageReady: true, clients: [], counts: { failed: scenario === 'unavailable' ? 0 : 1, waitingForSelection: 0, readyForEditing: 0, downloaded: 0, editing: 0, readyToUpload: 0, uploading: 0, delivered: 0 } }] }); return
      }
      if (url.pathname === '/api/editor-workflow/onsite') { await route.fulfill({ json: { batch: { jobs: [{ bookingId: 'FM-SYNTHETIC', customerName: 'Synthetic Maya Santos', packageName: 'Synthetic FICO Package', bookingTime: '8:00 AM – 4:00 PM', galleryCount: 0, storageReady: true }] } } }); return }
      await route.fulfill({ json: [] })
    })
    await page.goto('/editor')
    const heading = scenario === 'onsite-only' ? 'Today’s onsite photo uploads' : 'Today’s upload and editing work'
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    if (scenario === 'failed-upload') {
      await expect(page.getByRole('heading', { name: 'Retry failed upload', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Retry upload', exact: true })).toHaveAttribute('href', '/editor/upload?batch=FM-BATCH-SYNTHETIC&retry=1')
    } else if (scenario === 'onsite-only') {
      await expect(page.getByRole('heading', { name: 'Check today’s original-photo upload', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open onsite upload', exact: true }).first()).toHaveAttribute('href', '/editor/onsite?date=2026-10-01&booking=FM-SYNTHETIC')
      await expect(page.getByRole('link', { name: 'Retry upload', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Download Batch', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Upload Batch', exact: true })).toHaveCount(0)
      await expect(page.getByText('Batches download as ZIP files. Extract a batch before uploading edited photos.', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Today’s upload and editing work', exact: true })).toHaveCount(0)
    } else {
      await expect(page.getByRole('heading', { name: 'Check the latest work list', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Retry dashboard', exact: true })).toBeVisible()
      fails = false
      await page.getByRole('button', { name: 'Retry dashboard', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Check today’s original-photo upload', exact: true })).toBeVisible()
    }
    await page.screenshot({ path: testInfo.outputPath(`editor-next-${scenario}.png`) })
    // Horizontal geometry is checked at phone, tablet, and desktop widths.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    if (!isMobile) {
      await page.setViewportSize({ width: 768, height: 1024 })
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath(`editor-next-${scenario}-tablet.png`) })
    }
    expect(mutations).toEqual([])
    expect(runtimeErrors).toEqual([])
  })
}
