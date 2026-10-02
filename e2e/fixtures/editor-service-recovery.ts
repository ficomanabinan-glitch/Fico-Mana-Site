import { test as base, expect } from '@playwright/test'

export const EDITOR_BOOKING = 'FM-120001'
export const EDITOR_BATCH = 'FM-BATCH-2026-10-01-MAIN'
export const EDITOR_CLIENT = 'Synthetic Ana María Cruz'
export type EditorReadSource = 'onsite' | 'queue' | 'upload' | 'batch'
type Mode = 'failed' | 'malformed' | 'populated' | 'empty'
const counts = { waitingForSelection: 0, readyForEditing: 1, downloaded: 0, editing: 0,
  readyToUpload: 0, uploading: 0, delivered: 0, failed: 0 }
const job = { id: 'synthetic-job', bookingId: EDITOR_BOOKING, clientId: 'synthetic-client',
  customerName: EDITOR_CLIENT, customerEmail: 'ana.maria@example.com', packageName: 'Synthetic FICO Package',
  bookingTime: '8:00 AM – 4:00 PM', status: 'READY_FOR_EDITING', selectedCount: 5,
  expectedOutputCount: 5, galleryCount: 20, selectionStatus: 'SUBMITTED', selectionClientStatus: 'Submitted',
  selectionRequiredCount: 5, enhancementPreferences: [], printAllocations: [], addonOrders: [],
  totalAddonAmount: 0, deliverableCount: 0, storageReady: true }
const summary = { id: EDITOR_BATCH, workspaceId: 'synthetic-workspace', shootDate: '2026-10-01',
  locationKey: 'MAIN', status: 'READY_FOR_EDITING', totalClients: 1, totalSelectedPhotos: 5, counts,
  clients: [{ bookingId: EDITOR_BOOKING, clientId: 'synthetic-client', clientName: EDITOR_CLIENT,
    packageName: 'Synthetic FICO Package', status: 'READY_FOR_EDITING', selectedCount: 5 }], storageReady: true }
const report = { id: 'synthetic-report', batchId: EDITOR_BATCH, shootDate: '2026-10-01',
  status: 'COMPLETED', totalClients: 1, completedClients: 1, failedClients: 0, photosUploaded: 5,
  createdAt: '2026-10-01T03:00:00Z', completedAt: '2026-10-01T03:01:00Z', clients: [{ bookingId: EDITOR_BOOKING,
    customerName: EDITOR_CLIENT, packageName: 'Synthetic FICO Package', status: 'DELIVERED',
    expectedFiles: 5, uploadedFiles: 5, lastError: null, updatedAt: '2026-10-01T03:01:00Z', storageReady: true }] }

export const editorPaths: Record<EditorReadSource, string> = {
  onsite: `/editor/onsite?date=2026-10-01&booking=${EDITOR_BOOKING}`,
  queue: `/editor/queue?search=${EDITOR_BOOKING}`,
  upload: `/editor/upload?batch=${EDITOR_BATCH}&retry=1`,
  batch: `/editor/batch/${EDITOR_BATCH}`,
}
const sourcePaths: Record<EditorReadSource, string> = {
  onsite: '/api/editor-workflow/onsite', queue: '/api/editor-workflow/batches',
  upload: '/api/editor-workflow/uploads/report', batch: `/api/editor-workflow/batches/${EDITOR_BATCH}`,
}
function payload(source: EditorReadSource, empty: boolean) {
  if (source === 'onsite') return { shootDate: '2026-10-01', batch: empty ? null : { id: EDITOR_BATCH, jobs: [job] } }
  if (source === 'queue') return empty ? [] : [summary]
  if (source === 'upload') return empty ? [] : [report]
  return { id: EDITOR_BATCH, shootDate: '2026-10-01', totalClients: empty ? 0 : 1,
    totalSelectedPhotos: empty ? 0 : 5, counts: empty ? { ...counts, readyForEditing: 0 } : counts,
    jobs: empty ? [] : [job], auditLogs: [], needsReview: [] }
}
type Fixture = { configure: (source: EditorReadSource, mode?: Mode) => void; mode: (mode: Mode) => void;
  hold: () => { requested: Promise<void>; release: () => void }; reads: string[] }

export const test = base.extend<{ editorRead: Fixture }>({
  editorRead: async ({ page, context, baseURL }, provide, testInfo) => {
    const origin = new URL(baseURL!).origin
    if (origin !== 'http://127.0.0.1:3200') throw new Error('This fixture only permits the owned isolated QA server.')
    await page.clock.install({ time: new Date('2026-10-01T04:00:00Z') })
    const user = { id: 'client-workspace-test', email: 'editor.qa@example.com', app_metadata: {},
      user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' }
    const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: user.id })).toString('base64url')}.test`,
      refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    let source: EditorReadSource = 'onsite', mode: Mode = 'failed'
    let hold: { pending: Promise<void>; release: () => void; notify: () => void } | null = null
    const reads: string[] = [], guardFailures: string[] = [], runtimeErrors: string[] = []
    const expectedHttpFailures = new Set<string>(), classifiedHttpErrors: string[] = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    page.on('download', () => guardFailures.push('Unexpected download'))
    page.on('filechooser', () => guardFailures.push('Unexpected file picker'))
    context.on('page', () => guardFailures.push('Unexpected extra page or popup'))
    page.on('console', message => {
      if (message.type() !== 'error') return
      if (/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/.test(message.text()) && expectedHttpFailures.has(message.location().url)) {
        classifiedHttpErrors.push(`${message.location().url}: ${message.text()}`)
        return
      }
      runtimeErrors.push(message.text())
    })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      if (url.origin !== origin) { guardFailures.push(`Hosted request ${url.origin}${url.pathname}`); await route.abort(); return }
      if (method !== 'GET' && method !== 'HEAD') { guardFailures.push(`Mutation ${method} ${url.pathname}`); await route.abort(); return }
      if (/\.(?:zip|bin|dng|cr2|cr3|nef|arw|orf|rw2|raf)(?:$|\/)|\/(?:downloads?|folders?|private-downloads)(?:\/|$)/i.test(url.pathname)) {
        guardFailures.push(`Binary or folder transfer ${url.pathname}`); await route.abort(); return
      }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      if (url.pathname === '/api/editor-workflow/session') {
        await route.fulfill({ json: { user: { ...user, displayName: 'Synthetic Editor' },
          workspace: { name: 'Synthetic Studio' }, role: 'editor', capabilities: { edit: true, onsite: true, admin: false } } }); return
      }
      if (url.pathname === sourcePaths[source]) {
        reads.push(url.href)
        if (hold) { const current = hold; current.notify(); await current.pending; if (hold === current) hold = null }
        if (mode === 'failed') {
          expectedHttpFailures.add(url.href)
          await route.fulfill({ status: 503, json: { error: 'Synthetic metadata service unavailable' } }); return
        }
        if (mode === 'malformed') { await route.fulfill({ json: { unexpected: 'not the metadata contract' } }); return }
        await route.fulfill({ json: payload(source, mode === 'empty') }); return
      }
      guardFailures.push(`Unlisted API ${method} ${url.pathname}`)
      await route.fulfill({ status: 405, json: { error: 'This fixture forbids unlisted API, file and transfer requests.' } })
    })
    await provide({ configure: (next, nextMode = 'failed') => { source = next; mode = nextMode }, mode: next => { mode = next }, reads,
      hold: () => {
        let release!: () => void, notify!: () => void
        const pending = new Promise<void>(resolve => { release = resolve })
        const requested = new Promise<void>(resolve => { notify = resolve })
        hold = { pending, release, notify }
        return { requested, release }
      } })
    // The control is assigned by the test callback; TS cannot observe that closure assignment.
    const outstandingHold = hold as { release: () => void } | null
    outstandingHold?.release()
    await testInfo.attach('editor-service-read-guards', { body: JSON.stringify({ reads, guardFailures, runtimeErrors, classifiedHttpErrors }, null, 2), contentType: 'application/json' })
    expect(guardFailures, 'No hosted APIs, transfers, file pickers or unlisted writes').toEqual([])
    expect(runtimeErrors, 'No unclassified application console or page errors').toEqual([])
  },
})
export { expect }
