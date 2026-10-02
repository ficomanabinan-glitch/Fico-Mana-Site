// Bounded optimized local browser baselines. Never starts a server or contacts providers.
import { chromium, expect } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { performance as nodePerformance } from 'node:perf_hooks'
import { CLIENT_ID, CLIENT_NAME, FIRST_BOOKING, SECOND_BOOKING, OTHER_BOOKING,
  workspaceBooking, workspaceCore, workspaceLinks } from '../e2e/fixtures/client-workspace.ts'

const baseURL = 'http://127.0.0.1:3200'
const artifactPath = process.env.QA_PERFORMANCE_OUTPUT || 'test-results/operational-performance-2026-10-01.json'
const buildId = (await readFile('.next-qa/BUILD_ID', 'utf8')).trim()
const bookings = [FIRST_BOOKING, SECOND_BOOKING, OTHER_BOOKING].map(id => workspaceBooking(id))
const batchId = 'FM-BATCH-SYNTHETIC'
const batch = { id: batchId, workspaceId: 'synthetic', shootDate: '2026-10-01', locationKey: 'MAIN',
  status: 'FAILED', totalClients: 1, totalSelectedPhotos: 5, storageReady: true, clients: [],
  counts: { failed: 1, waitingForSelection: 0, readyForEditing: 0, downloaded: 0, editing: 0,
    readyToUpload: 0, uploading: 0, delivered: 0 } }
const onsite = { batch: { jobs: [{ bookingId: FIRST_BOOKING, customerName: CLIENT_NAME,
  packageName: 'FICO Package', bookingTime: '8:00 AM – 4:00 PM', galleryCount: 0, storageReady: true }] } }
const files = Array.from({ length: 500 }, (_, index) => ({ id: `synthetic-file-${index + 1}`, source: 'gallery',
  fileName: `SYNTHETIC-${String(index + 1).padStart(4, '0')}.JPG`, size: 5_242_880,
  previewAvailable: false, storageStatus: 'available' }))
const summary = { fileCount: files.length, indexedBytes: files.length * 5_242_880,
  storageGb: files.length * 5_242_880 / 1024 ** 3, estimatedMonthlyUsd: 0, candidateFiles: 0,
  candidateBytes: 0, categories: [{ category: 'raw', files: files.length, bytes: files.length * 5_242_880 }],
  retention: { enabled: true, days: 7 },
  delivery: { privateWorkerConfigured: true, portalDownloads: 'ZIP', editorBatchDownloads: 'ZIP' } }
const categories = { level: 'categories', shootDate: '2026-10-01', booking: { id: FIRST_BOOKING, customer_name: CLIENT_NAME },
  items: [{ id: 'raw', name: 'raw', fileCount: files.length, bytes: summary.indexedBytes }] }
const fileView = { level: 'files', shootDate: '2026-10-01', booking: categories.booking, items: files }
const attention = { items: [{ bookingId: SECOND_BOOKING, clientId: CLIENT_ID, name: CLIENT_NAME,
  shootDate: '2026-10-03', actionId: 'storage-error', label: 'Review portal setup',
  explanation: 'Synthetic portal provisioning issue requires attention.',
  href: workspaceLinks(workspaceBooking(SECOND_BOOKING)).workspace, priority: 0 }], unavailableSources: [], truncated: false }
const searchResults = [FIRST_BOOKING, OTHER_BOOKING].map(id => {
  const core = workspaceCore(id)
  return { clientId: core.client.id, clientReference: core.client.reference, identitySource: 'client',
    bookingId: id, name: CLIENT_NAME, contactHint: core.client.email, packageName: core.booking.packageName,
    shootDate: core.booking.bookingDate, bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit',
    productionStatus: 'READY_FOR_EDITING', href: core.links.workspace }
})
const result = { recordedAt: new Date().toISOString(), buildId, baseURL,
  environment: { viewport: { width: 1440, height: 900 }, browser: 'Chrome', contexts: 'fresh, routing disables HTTP cache',
    network: 'unthrottled loopback, synthetic API fulfillment', cpu: 'unthrottled', fixedBusinessDate: '2026-10-01T04:00:00Z',
    server: 'pre-existing optimized .next-qa; warmed; no auto-dev/server mutations' },
  fixture: { bookings: 3, searchResults: 2, attentionItems: 1, editorBatches: 1, onsiteJobs: 1,
    files: 500, fileBytesEach: 5_242_880, filesPreviewAvailable: false,
    metadataPayloadBytes: Buffer.byteLength(JSON.stringify(fileView)),
    sourceFixtures: ['e2e/fixtures/client-workspace.ts', 'e2e/editor-next-task.spec.ts', 'e2e/staff-recovery.spec.ts'] },
  observations: [] }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
result.browserVersion = browser.version()

async function observePage(page) {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map(entry => ({ name: entry.name,
      initiatorType: entry.initiatorType, encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize, transferSize: entry.transferSize,
      startTime: entry.startTime, responseEnd: entry.responseEnd }))
    const groups = {}
    for (const entry of resources) {
      const path = new URL(entry.name).pathname
      const group = path.startsWith('/api/') ? 'synthetic-api' : path.endsWith('.js') ? 'javascript'
        : path.endsWith('.css') ? 'css' : /\.(woff2?|ttf)$/.test(path) ? 'fonts' : 'other-local'
      groups[group] ??= { count: 0, encodedBytes: 0, decodedBytes: 0, transferBytes: 0 }
      groups[group].count++
      groups[group].encodedBytes += entry.encodedBodySize
      groups[group].decodedBytes += entry.decodedBodySize
      groups[group].transferBytes += entry.transferSize
    }
    const nav = performance.getEntriesByType('navigation')[0]
    return { lab: window.__operationalLab, resourceGroups: groups, resources,
      navigation: { responseEnd: nav?.responseEnd, domContentLoaded: nav?.domContentLoadedEventEnd, load: nav?.loadEventEnd },
      capturedAtMs: performance.now() }
  })
}

try {
  for (const surface of ['admin-search', 'editor-dashboard', 'files-metadata']) {
    for (let trial = 1; trial <= 3; trial++) {
      const context = await browser.newContext({ viewport: result.environment.viewport, serviceWorkers: 'block', timezoneId: 'Asia/Manila' })
      const page = await context.newPage()
      const observation = { surface, trial, status: 'pending', requests: [], blockedOrigins: [], prohibitedMutations: [], runtimeErrors: [], checkpoints: {} }
      result.observations.push(observation)
      const requestEntries = new Map()
      context.on('request', request => {
        if (!new URL(request.url()).pathname.startsWith('/api/')) return
        const entry = { url: request.url(), method: request.method(), status: 'pending' }
        observation.requests.push(entry); requestEntries.set(request, entry)
      })
      context.on('requestfinished', request => { const entry = requestEntries.get(request); if (entry) entry.status = 'completed' })
      context.on('requestfailed', request => { const entry = requestEntries.get(request); if (entry) { entry.status = 'failed'; entry.failure = request.failure()?.errorText } })
      page.on('pageerror', error => observation.runtimeErrors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') observation.runtimeErrors.push(message.text()) })
      const user = { id: 'client-workspace-test', email: 'workspace@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }
      const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: user.id })).toString('base64url')}.test`,
        refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }
      await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL }])
      await context.addInitScript(() => {
        const NativeDate = Date
        class FixedBusinessDate extends NativeDate {
          constructor(...args) { super(...(args.length ? args : ['2026-10-01T04:00:00Z'])) }
          static now() { return new NativeDate('2026-10-01T04:00:00Z').getTime() }
        }
        window.Date = FixedBusinessDate
        performance.setResourceTimingBufferSize(2000)
        const lab = window.__operationalLab = { clsMaxWindow: 0, layoutShifts: [], lcp: null, longTasks: [] }
        let windowStart = 0, lastShift = 0, windowValue = 0
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput) continue
            lab.layoutShifts.push({ startTime: entry.startTime, value: entry.value })
            if (windowValue && entry.startTime - lastShift < 1000 && entry.startTime - windowStart < 5000) windowValue += entry.value
            else { windowStart = entry.startTime; windowValue = entry.value }
            lastShift = entry.startTime; lab.clsMaxWindow = Math.max(lab.clsMaxWindow, windowValue)
          }
        }).observe({ type: 'layout-shift', buffered: true })
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) lab.lcp = { startTime: entry.startTime, size: entry.size, tag: entry.element?.tagName, text: entry.element?.textContent?.slice(0, 100) }
        }).observe({ type: 'largest-contentful-paint', buffered: true })
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) lab.longTasks.push({ startTime: entry.startTime, duration: entry.duration })
        }).observe({ type: 'longtask', buffered: true })
      })
      await context.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== baseURL) { observation.blockedOrigins.push(url.origin + url.pathname); await route.abort(); return }
        if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
        const method = route.request().method()
        // Existing consoles auto-sync. Even this POST is fulfilled; no server API sees it.
        if (method !== 'GET' && url.pathname !== '/api/sync') {
          observation.prohibitedMutations.push(`${method} ${url.pathname}`)
          await route.fulfill({ status: 405, json: { error: 'Performance fixture prohibits mutations.' } }); return
        }
        let body = []
        if (url.pathname === '/api/editor-workflow/session') body = { user: { ...user, displayName: 'Synthetic Staff' }, workspace: { name: 'Synthetic Studio' }, role: surface === 'admin-search' ? 'admin' : 'editor', capabilities: { edit: true, onsite: true, admin: surface === 'admin-search' } }
        else if (url.pathname === '/api/bookings') body = bookings
        else if (url.pathname === '/api/bookings/client-priorities') body = [{ bookingId: FIRST_BOOKING, clientPriority: 1 }, { bookingId: OTHER_BOOKING, clientPriority: 2 }]
        else if (url.pathname === '/api/sync') body = { ok: true }
        else if (url.pathname.endsWith('/client-workspace/attention')) body = attention
        else if (url.pathname.endsWith('/client-workspace/search')) body = { query: url.searchParams.get('q') || '', results: searchResults, hasMore: false }
        else if (url.pathname === '/api/editor-workflow/batches') body = [batch]
        else if (url.pathname === '/api/editor-workflow/onsite') body = onsite
        else if (url.pathname === '/api/editor-files') {
          if (url.searchParams.has('source') || url.searchParams.has('file') || url.searchParams.has('preview')) {
            observation.prohibitedMutations.push('Photo content unexpectedly requested'); await route.fulfill({ status: 405, json: {} }); return
          }
          body = url.searchParams.has('summary') ? summary : url.searchParams.get('category') === 'raw' ? fileView : categories
        }
        await route.fulfill({ json: body })
      })
      const started = nodePerformance.now()
      try {
        if (surface === 'admin-search') {
          await page.goto(`${baseURL}/admin/dashboard`, { waitUntil: 'domcontentloaded' })
          const actionCenter = page.getByRole('region', { name: 'Action center', exact: true })
          await expect(actionCenter.getByText('Synthetic portal provisioning issue requires attention.', { exact: true })).toBeVisible()
          const action = actionCenter.getByRole('link', { name: 'Open client', exact: true }).first()
          await action.focus(); await expect(action).toBeFocused()
          await expect(action).toHaveAttribute('href', workspaceLinks(workspaceBooking(SECOND_BOOKING)).workspace)
          observation.checkpoints.dashboardActionFocusableMs = nodePerformance.now() - started
          await page.waitForTimeout(500)
          observation.initialPage = await observePage(page)
          const trigger = page.getByRole('button', { name: 'Search clients', exact: true })
          await trigger.focus(); await page.keyboard.press('Enter')
          const dialog = page.getByRole('dialog', { name: 'Search clients', exact: true })
          const input = dialog.getByRole('searchbox', { name: 'Find a client or booking', exact: true })
          await input.focus()
          const queryStarted = nodePerformance.now()
          await page.keyboard.type(FIRST_BOOKING)
          const searchResult = dialog.getByRole('link').filter({ hasText: FIRST_BOOKING })
          await expect(searchResult).toHaveCount(1); await expect(searchResult).toBeVisible()
          await expect(searchResult).toHaveAttribute('href', workspaceCore().links.workspace)
          await searchResult.focus(); await expect(searchResult).toBeFocused()
          observation.checkpoints.keyboardQueryToCorrectFocusableResultMs = nodePerformance.now() - queryStarted
          observation.checkpoints.searchResultCount = await dialog.locator('li').count()
          observation.checkpoints.actualQuery = await input.inputValue()
        } else if (surface === 'editor-dashboard') {
          await page.goto(`${baseURL}/editor`, { waitUntil: 'domcontentloaded' })
          await expect(page.getByRole('heading', { name: 'Retry failed upload', exact: true })).toBeVisible()
          const action = page.getByRole('link', { name: 'Retry upload', exact: true })
          await expect(action).toHaveAttribute('href', `/editor/upload?batch=${batchId}&retry=1`)
          await action.focus(); await expect(action).toBeFocused()
          observation.checkpoints.correctNextTaskFocusableMs = nodePerformance.now() - started
        } else {
          await page.goto(`${baseURL}/editor/files?date=2026-10-01&booking=${FIRST_BOOKING}`, { waitUntil: 'domcontentloaded' })
          await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
          const folder = page.getByRole('button', { name: 'Original photos 500 files', exact: true })
          await folder.focus(); await expect(folder).toBeFocused()
          observation.checkpoints.correctFolderFocusableMs = nodePerformance.now() - started
          const listStarted = nodePerformance.now()
          await page.keyboard.press('Enter')
          await expect(page.getByRole('link', { name: /^Open SYNTHETIC-/ })).toHaveCount(500)
          const input = page.getByRole('textbox', { name: 'Search this folder', exact: true })
          await input.focus(); await expect(input).toBeFocused()
          observation.checkpoints.folderActivationTo500RowsAndFocusableSearchMs = nodePerformance.now() - listStarted
          const queryStarted = nodePerformance.now()
          await page.keyboard.type('SYNTHETIC-0500')
          await expect(page.getByRole('link', { name: /^Open SYNTHETIC-/ })).toHaveCount(1)
          await expect(page.getByRole('link', { name: 'Open SYNTHETIC-0500.JPG', exact: true })).toBeVisible()
          observation.checkpoints.keyboardFolderFilterToCorrectRowMs = nodePerformance.now() - queryStarted
        }
        await page.waitForTimeout(500)
        observation.finalPage = await observePage(page)
        expect(observation.prohibitedMutations).toEqual([])
        expect(observation.blockedOrigins).toEqual([])
        expect(observation.runtimeErrors).toEqual([])
        observation.status = 'passed'
      } catch (error) {
        observation.status = 'failed'; observation.error = String(error)
        observation.finalPage = await observePage(page).catch(() => null)
      } finally {
        observation.totalObservationMs = nodePerformance.now() - started
        observation.requestCounts = { attempted: observation.requests.length,
          completed: observation.requests.filter(item => item.status === 'completed').length,
          failed: observation.requests.filter(item => item.status === 'failed').length,
          pending: observation.requests.filter(item => item.status === 'pending').length }
        await context.close()
        await mkdir('test-results', { recursive: true })
        await writeFile(artifactPath, JSON.stringify(result, null, 2))
        console.log(JSON.stringify({ surface, trial, status: observation.status, checkpoints: observation.checkpoints,
          requests: observation.requestCounts, initialResources: observation.initialPage?.resourceGroups,
          resources: observation.finalPage?.resourceGroups, cls: observation.finalPage?.lab.clsMaxWindow, error: observation.error }))
      }
    }
  }
} finally { await browser.close() }
process.exitCode = result.observations.every(item => item.status === 'passed') ? 0 : 1
