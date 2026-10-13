import { test as base, expect } from '@playwright/test'
import path from 'node:path'

const batchId = 'FM-BATCH-2026-10-04-MAIN'
const test = base.extend<{ batchReview: { starts: string[][]; delivered: Set<string>; errors: string[] } }>({
  batchReview: async ({ page, context, baseURL }, provide) => {
    const origin = new URL(baseURL!).origin
    if (origin !== 'http://127.0.0.1:3200') throw new Error('Batch fixtures require the isolated local QA server.')
    const user = { id: 'synthetic-editor', email: 'editor@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }
    const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: user.id })).toString('base64url')}.test`, refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    const starts: string[][] = [], delivered = new Set<string>(), errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== origin) { errors.push(`Unexpected hosted request ${url.origin}`); await route.abort(); return }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      if (url.pathname === '/api/editor-workflow/session') {
        await route.fulfill({ json: { user: { ...user, displayName: 'Synthetic Editor' }, workspace: { name: 'Test Studio' }, role: 'editor', capabilities: { edit: true, onsite: true, admin: false } } }); return
      }
      if (url.pathname === '/api/editor-workflow/uploads/report') { await route.fulfill({ json: [] }); return }
      const action = url.pathname.split('/').at(-1)
      const body = request.postDataJSON() as { clients?: Array<{ bookingId: string }>; bookingId?: string }
      if (action === 'preflight') {
        const clients = body.clients!.map(client => ({ bookingId: client.bookingId, customerName: `Synthetic Client ${client.bookingId.at(-1)}`, workflowStatus: 'DOWNLOADED', status: delivered.has(client.bookingId) ? 'DELIVERED' : ['FM-TEST-4', 'FM-TEST-5'].includes(client.bookingId) ? 'ATTENTION' : 'READY', reason: ['FM-TEST-4', 'FM-TEST-5'].includes(client.bookingId) ? 'This booking requires studio review.' : '' }))
        await route.fulfill({ json: { clients, totalClients: 5, readyClients: clients.filter(client => client.status === 'READY').length, attentionClients: 2 } }); return
      }
      if (action === 'start-upload') { starts.push(body.clients!.map(client => client.bookingId)); await route.fulfill({ json: { uploadJobId: 'synthetic-run' } }); return }
      if (action === 'upload-session') { await route.fulfill({ json: { uploadFileId: 'synthetic-file', fileName: 'test.jpg', duplicate: true } }); return }
      if (action === 'finalize-client') { delivered.add(body.bookingId!); await route.fulfill({ json: { bookingId: body.bookingId, customerName: `Synthetic Client ${body.bookingId!.at(-1)}`, status: 'DELIVERED', expected: 1, uploaded: 1 } }); return }
      if (action === 'finalize-upload') { await route.fulfill({ json: { id: 'synthetic-run', status: 'COMPLETED', totalClients: 3, completedClients: 3, failedClients: 0, photosUploaded: 3, batchStatus: 'PARTIALLY_COMPLETED', failedBookingIds: [] } }); return }
      errors.push(`Unexpected API ${request.method()} ${url.pathname}`)
      await route.abort()
    })
    await provide({ starts, delivered, errors })
    expect(errors, 'No hosted requests or runtime errors').toEqual([])
  },
})

test('five manifest clients are reviewed; only three explicitly confirmed eligible clients upload', async ({ page, batchReview }, testInfo) => {
  await page.goto(`/editor/upload?batch=${batchId}`)
  await expect(page.getByRole('heading', { name: 'Return edited batches to clients' })).toBeVisible()
  await page.getByLabel('Choose edited batch folder').setInputFiles(path.resolve('e2e/fixtures/batch-return-folder'))
  await expect(page.getByText('5 total · 3 eligible · 2 skipped', { exact: true })).toBeVisible()
  await expect(page.getByText('This booking requires studio review.', { exact: true })).toHaveCount(2)
  expect(batchReview.starts).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('region', { name: 'Batch upload review' }).screenshot({ path: testInfo.outputPath('batch-review.png') })
  const confirm = page.getByRole('button', { name: 'Upload 3 Eligible Clients', exact: true })
  await confirm.focus(); await expect(confirm).toBeFocused(); await page.keyboard.press('Enter')
  await expect(page.getByText('Upload complete', { exact: true })).toBeVisible()
  expect(batchReview.starts).toEqual([['FM-TEST-1', 'FM-TEST-2', 'FM-TEST-3']])
  expect([...batchReview.delivered]).toEqual(['FM-TEST-1', 'FM-TEST-2', 'FM-TEST-3'])
  await expect(page.getByRole('button', { name: 'Upload 0 Eligible Clients', exact: true })).toBeDisabled()
  await expect(page.getByText('0/0', { exact: true })).toHaveCount(0)
})
