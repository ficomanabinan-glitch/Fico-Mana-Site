import { test as base, expect } from '@playwright/test'
import type { PortalData } from '../../components/client-portal-page'
import type { ClientSelection } from '../../components/client-photo-selection'

export const PRIVATE_PORTAL_ID = '77777777-7777-4777-8777-777777777777'
export const PRIVATE_CLIENT_NAME = 'Synthetic Amihan Reyes'
export const PRIVATE_BOOKING_ID = 'FM-120047'
export const PRIVATE_PIN = '4826'
export const PRIVATE_REASON = 'Please allow a replacement backup after my interrupted transfer.'
export const PRIVATE_PHOTO_IDS = Array.from({ length: 5 }, (_, i) => `88888888-8888-4888-8888-${String(i + 1).padStart(12, '0')}`)
const root = `/api/editor-workflow/portal/${PRIVATE_PORTAL_ID}`
const previewPath = '/qa-synthetic-portal-preview.svg'
const generatedPreview = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80"><rect width="64" height="80" fill="#516481"/><text x="5" y="42" fill="white" font-size="9">Synthetic</text></svg>'
export const PRIVATE_PRINT_CATEGORIES = ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R', 'WALLET_SIZE'] as const

type SelectionPayload = {
  pin: string; fileIds: string[]; includedFileIds: string[]; extraEditFileIds: string[]
  preferences: Array<Pick<ClientSelection['selectedItems'][number], 'fileId' | 'preference'>>
  printAllocations: Array<Omit<ClientSelection['printAllocations'][number], 'label'>>; addons: unknown[]; acknowledgeNoRevision: boolean
}
type PortalFixture = {
  mode: (mode: 'selection' | 'downloads') => void
  expire: (value: boolean) => void
  selectionPosts: SelectionPayload[]
  requestPosts: Array<{ reason: string }>
  requests: Array<{ method: string; path: string; query: string; status: number }>
}

function portalData(submitted: boolean, pending: boolean, enhanced: boolean): PortalData {
  const gallery = PRIVATE_PHOTO_IDS.map((id, i) => ({ id, fileName: `SYNTHETIC-${String(i + 1).padStart(2, '0')}.JPG`, mimeType: 'image/jpeg', previewUrl: previewPath }))
  return {
    booking: { id: PRIVATE_BOOKING_ID, customerName: PRIVATE_CLIENT_NAME, packageName: 'Synthetic FICO Package', packageCategory: 'graduation',
      bookingDate: '2026-10-01', bookingTime: '8:00 AM – 4:00 PM', bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit', price: 3500, depositAmount: 500, amountPaid: 500 },
    portalId: PRIVATE_PORTAL_ID, shareUrl: `http://127.0.0.1:3200/portal/${PRIVATE_PORTAL_ID}`,
    expiry: { days: 30, portalReadyEmailSentAt: '2026-10-01T01:00:00Z', deliverablesUploadedAt: enhanced ? '2026-10-01T03:00:00Z' : null, expiresAt: enhanced ? '2026-10-31T03:00:00Z' : null },
    selection: { id: '99999999-9999-4999-8999-999999999999', status: submitted ? 'SUBMITTED' : 'OPEN', requiredCount: 5, includedLimit: 5,
      clientStatus: submitted ? 'submitted' : 'selecting', noRevisionAcknowledged: true,
      submittedAt: submitted ? '2026-10-01T04:00:00Z' : null, reopenedAt: null, rawUploadGeneration: 0,
      selectedIds: PRIVATE_PHOTO_IDS, selectedItems: PRIVATE_PHOTO_IDS.map(fileId => ({ fileId, preference: 'standard', extraEdit: false })),
      printAllocations: PRIVATE_PRINT_CATEGORIES.map(category => ({ category, fileId: PRIVATE_PHOTO_IDS[0], quantity: 1, label: category })),
      addonOrders: [], totalAddonAmount: 0 },
    gallery, selectedGallery: gallery, galleryTotal: 5, rawDownloadBytes: 26_214_400, galleryOffset: 0, galleryLimit: 48,
    editingStatus: enhanced ? 'DELIVERED' : submitted ? 'READY_FOR_EDITING' : 'WAITING_FOR_SELECTION', addonCatalog: [],
    deliverables: enhanced ? [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fileName: 'SYNTHETIC-ENHANCED.JPG', mimeType: 'image/jpeg', fileSize: 1024, publishedAt: '2026-10-01T03:00:00Z', previewUrl: previewPath }] : [],
    resources: [], downloadAllUrl: `${root}/deliverables-folder`,
    rawDownloadAllUrl: submitted && !enhanced ? `${root}/raw-photos-folder` : null,
    rawDownloadRequestUrl: `${root}/raw-download-request`,
    rawDownloadAccess: { allowed: !enhanced, completedInWindow: enhanced ? 2 : 0, activeDownloads: 0, limit: 2,
      requestStatus: pending ? 'PENDING' : 'AVAILABLE', nextAvailableAt: enhanced ? '2026-10-08T03:00:00Z' : null }, warnings: [],
  }
}

export const test = base.extend<{ privatePortal: PortalFixture }>({
  privatePortal: async ({ page, context, baseURL }, provide, testInfo) => {
    if (new URL(baseURL!).origin !== 'http://127.0.0.1:3200') throw new Error('Private portal fixtures require the owned isolated port3200.')
    await page.clock.install({ time: new Date('2026-10-01T04:00:00Z') })
    let mode: 'selection' | 'downloads' = 'selection', submitted = false, pending = false, expired = false
    const selectionPosts: SelectionPayload[] = [], requestPosts: Array<{ reason: string }> = [], requests: PortalFixture['requests'] = []
    const violations: string[] = [], errors: string[] = [], expectedResourceErrors: string[] = []
    const expectedFailures = new Set<string>()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() !== 'error') return
      const status = /^Failed to load resource: the server responded with a status of (403|410|500)(?:\s|\()/.exec(message.text())?.[1]
      if (status && expectedFailures.has(`${message.location().url}|${status}`)) {
        expectedResourceErrors.push(`${message.location().url}|${status}`); return
      }
      errors.push(message.text())
    })
    context.on('page', popup => { if (popup !== page) violations.push('Unexpected popup/window') })
    page.on('download', () => violations.push('Actual download started'))
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      if (url.origin !== 'http://127.0.0.1:3200') { violations.push(`Hosted origin ${url.origin}`); await route.abort(); return }
      if (url.pathname === previewPath && method === 'GET') {
        await route.fulfill({ contentType: 'image/svg+xml', body: generatedPreview }); return
      }
      if (!url.pathname.startsWith('/api/')) {
        if (method !== 'GET' && method !== 'HEAD') { violations.push(`Unlisted document write ${method} ${url.pathname}`); await route.abort(); return }
        await route.continue(); return
      }
      const reply = async (body: unknown, status = 200) => {
        requests.push({ method, path: url.pathname, query: url.search, status })
        if (status !== 200) expectedFailures.add(`${url.href}|${status}`)
        await route.fulfill({ status, json: body })
      }
      if (method === 'GET' && url.pathname === root) {
        // The repaired typed expiry contract exposes only safe recovery guidance.
        if (expired) { await reply({ error: 'This client portal has expired. Try: contact FICO MANA to request access again.', code: 'PORTAL_EXPIRED', requestId: 'synthetic-expired-read' }, 410); return }
        await reply(portalData(submitted || mode === 'downloads', pending, mode === 'downloads')); return
      }
      if (method === 'GET' && url.pathname === `${root}/photo-revision`) {
        if (expired) { await reply({ error: 'This client portal has expired.', code: 'PORTAL_EXPIRED' }, 410); return }
        const data = portalData(submitted || mode === 'downloads', pending, mode === 'downloads')
        await reply({ generation: 0, reopenedAt: null, galleryCount: 5, resetting: false,
          expiresAt: data.expiry?.expiresAt, portalReadyEmailSentAt: data.expiry?.portalReadyEmailSentAt,
          deliverablesUploadedAt: data.expiry?.deliverablesUploadedAt }); return
      }
      if (method === 'GET' && url.pathname === `${root}/raw-download-state`) {
        await reply(portalData(submitted || mode === 'downloads', pending, mode === 'downloads').rawDownloadAccess); return
      }
      if (method === 'POST' && url.pathname === `${root}/selection` && mode === 'selection') {
        const body = request.postDataJSON() as SelectionPayload
        selectionPosts.push(body)
        if (body.pin !== PRIVATE_PIN) { await reply({ error: 'Incorrect PIN. Try: enter the last 4 digits of the phone number used for this booking.', code: 'SELECTION_PIN_INVALID' }, 403); return }
        submitted = true; await reply({ ok: true }); return
      }
      if (method === 'POST' && url.pathname === `${root}/raw-download-request` && mode === 'downloads' && !pending) {
        const body = request.postDataJSON() as { reason: string }
        requestPosts.push(body)
        if (requestPosts.length === 1) { await reply({ error: 'Synthetic request could not be sent. Please try again.' }, 500); return }
        pending = true; await reply({ request: { status: 'PENDING', existing: false } }); return
      }
      violations.push(`Forbidden API/content ${method} ${url.pathname}`)
      await route.fulfill({ status: 405, json: { error: 'This fixture prohibits unlisted API, file, download and grant calls.' } })
    })
    try {
      await provide({ mode: value => { mode = value }, expire: value => { expired = value }, selectionPosts, requestPosts, requests })
    } finally {
      await testInfo.attach('private-portal-intercepted-evidence', { body: JSON.stringify({ requests,
        // Synthetic PINs are not customer secrets, but raw evidence need not publish them.
        selectionPosts: selectionPosts.map(({ pin, ...body }) => ({ ...body, pin: pin === PRIVATE_PIN ? 'synthetic-correct' : 'synthetic-incorrect' })),
        requestPosts, expectedResourceErrors, violations, errors }), contentType: 'application/json' })
      expect(violations, 'No actual content/download/provider/unlisted mutations').toEqual([])
      expect(errors, 'Only exact classified fixture HTTP errors are expected').toEqual([])
    }
  },
})
export { expect }
