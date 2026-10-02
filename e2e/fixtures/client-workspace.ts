import { test as base, expect, type Page } from '@playwright/test'
import type {
  ClientWorkspaceCore,
  ClientWorkspaceDetails,
  ClientWorkspaceIdentity,
  ClientWorkspaceLinks,
  ClientWorkspaceSearchResult,
  ClientWorkspaceAttention,
  WorkspaceBooking,
} from '../../lib/client-workspace-types'

export const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
export const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222'
export const FIRST_BOOKING = 'FM-120001'
export const SECOND_BOOKING = 'FM-120002'
export const OTHER_BOOKING = 'FM-120003'
export const PENDING_BOOKING = 'FM-120004'
export const CLIENT_NAME = 'Synthetic Ana María Cruz'

const client: ClientWorkspaceIdentity = {
  id: CLIENT_ID, reference: CLIENT_ID, identitySource: 'client', name: CLIENT_NAME,
  email: 'ana.maria@example.test', phone: '09170000001', createdAt: '2026-09-01T00:00:00Z',
}

export function workspaceBooking(id = FIRST_BOOKING): WorkspaceBooking {
  return {
    id, clientId: id === OTHER_BOOKING ? OTHER_CLIENT_ID : CLIENT_ID,
    customerName: CLIENT_NAME, customerEmail: id === OTHER_BOOKING ? 'other.ana@example.test' : client.email,
    customerPhone: id === OTHER_BOOKING ? '09170000002' : client.phone,
    customerFbName: null, customerFbLink: null, packageId: id === SECOND_BOOKING ? 'pinning' : 'fico',
    packageName: id === SECOND_BOOKING ? 'Capping and Pinning Photoshoot' : 'FICO Package',
    selectionLimit: id === SECOND_BOOKING ? 2 : 5,
    bookingDate: id === SECOND_BOOKING ? '2026-10-03' : '2026-10-01', bookingTime: '8:00 AM – 4:00 PM',
    slotId: null, arrivalTime: null, shootTime: null, clientPriority: 2, isWalkIn: false,
    bookingStatus: id === PENDING_BOOKING ? 'Pending Verification' : 'Confirmed', paymentStatus: id === PENDING_BOOKING ? 'Pending Verification' : 'Paid Deposit', price: 3500, depositAmount: 500,
    discountAmount: 0, discountLabel: null,
    paymentHistory: [{ id: `payment-${id}`, amount: 500, method: 'GCash', type: 'Deposit',
      transactionRef: 'SYNTHETIC-PAYMENT-REFERENCE', date: '2026-09-30T03:00:00Z',
      verifiedAt: '2026-09-30T03:10:00Z', status: 'verified' }],
    receiptAvailable: false, receiptHref: null, transactionRef: 'SYNTHETIC-PAYMENT-REFERENCE',
    rejectionReason: null, note: 'Synthetic fixture — never a real customer record.', staffNotes: null,
    schoolName: null, course: null, hoodColor: null, togaColor: null, tasselColor: null, backgroundColor: null,
    createdAt: '2026-09-30T03:00:00Z', confirmedAt: '2026-09-30T03:10:00Z',
    rawPhotoStatus: 'Approved', rawPhotoNotes: null, rawPhotoSubmittedAt: '2026-10-01T02:00:00Z',
    rawPhotoApprovedAt: '2026-10-01T03:00:00Z', editedPhotoDeliveredAt: null,
  }
}

export function workspaceLinks(booking: WorkspaceBooking): ClientWorkspaceLinks {
  const reference = booking.clientId || `booking:${booking.id}`
  const id = encodeURIComponent(booking.id)
  const batch = 'FM-BATCH-2026-10-01-MAIN'
  return {
    workspace: `/admin/clients/${encodeURIComponent(reference)}?booking=${id}`,
    booking: `/admin/bookings?search=${id}`, payment: id === PENDING_BOOKING ? `/admin/verification?search=${id}` : `/admin/bookings?search=${id}&details=${id}`,
    selection: `/editor/filtering?search=${id}&tab=queue`,
    onsite: `/editor/onsite?date=${booking.bookingDate}&booking=${id}`,
    queue: `/editor/queue?search=${id}`, portalManagement: `/editor/client-portals?search=${id}`,
    portal: `/api/bookings/${id}/portal`, files: `/editor/files?date=${booking.bookingDate}&booking=${id}`,
    batch: `/editor/batch/${batch}`, upload: `/editor/upload?batch=${batch}`,
    retryUpload: `/editor/upload?batch=${batch}&retry=1`,
  }
}

export function workspaceCore(id = FIRST_BOOKING): ClientWorkspaceCore {
  const booking = workspaceBooking(id)
  return {
    kind: 'core', client: id === OTHER_BOOKING ? { ...client, id: OTHER_CLIENT_ID,
      reference: OTHER_CLIENT_ID, email: 'other.ana@example.test', phone: '09170000002' } : client,
    bookings: id === OTHER_BOOKING ? [booking] : id === PENDING_BOOKING ? [workspaceBooking(PENDING_BOOKING)] : [workspaceBooking(FIRST_BOOKING), workspaceBooking(SECOND_BOOKING)],
    selectedBookingId: id, booking, links: workspaceLinks(booking),
    package: { status: 'ready', data: { id: booking.packageId, category: 'graduation', title: booking.packageName,
      description: null, features: ['Private originals', `${booking.selectionLimit} enhanced photographs`],
      duration: '30 minutes', selectionLimit: booking.selectionLimit,
      usesOnsiteWorkflow: true, usesSelectionWorkflow: true } },
  }
}

export function workspaceDetails(id = FIRST_BOOKING, unavailableFiles = false): ClientWorkspaceDetails {
  const booking = workspaceBooking(id)
  const count = booking.selectionLimit || 5
  return {
    kind: 'details', bookingId: id, links: workspaceLinks(booking),
    sections: {
      payments: { status: 'ready', data: { source: 'payments', packageTotal: 3500, amountPaid: 500,
        packageBalance: 3000, paymentStatus: 'Paid Deposit', records: booking.paymentHistory,
        receiptAvailable: false, receiptHref: null } },
      storage: { status: 'ready', data: { provisioningStatus: 'ready', provider: 'r2', status: 'ready',
        provisionedAt: '2026-10-01T01:00:00Z', lastRetryAt: null, hasError: false } },
      selection: { status: 'ready', data: { status: 'SUBMITTED', clientStatus: 'submitted', reviewStatus: 'Approved',
        requiredCount: count, includedLimit: count, selectedCount: count, extraEditCount: 0,
        submittedAt: '2026-10-01T02:00:00Z', reopenedAt: null, approvedAt: '2026-10-01T03:00:00Z',
        noRevisionAcknowledged: true, totalAddonAmount: 0, resetInProgress: false,
        photos: [{ id: `photo-${id}`, fileName: `SYNTHETIC-${id}.JPG`, preference: 'Standard Softness', extraEdit: false }] } },
      prints: { status: 'empty', data: [] }, addons: { status: 'empty', data: [] },
      production: { status: 'ready', data: { jobId: `job-${id}`, status: 'READY_FOR_EDITING', selectedCount: count,
        expectedOutputCount: count, assignedEditorName: 'Synthetic Editor', photographerName: 'Synthetic Photographer',
        downloadedAt: id === FIRST_BOOKING ? '2026-10-01T01:00:00Z' : null,
        editingStartedAt: id === FIRST_BOOKING ? '2026-10-01T02:00:00Z' : null, readyToUploadAt: null, deliveredAt: null,
        updatedAt: '2026-10-01T03:00:00Z', hasError: false,
        batch: { id: 'FM-BATCH-2026-10-01-MAIN', status: 'READY_FOR_EDITING', shootDate: booking.bookingDate, location: 'MAIN' }, uploads: [] } },
      portal: { status: 'ready', data: { status: 'active', expired: false, createdAt: '2026-10-01T01:00:00Z',
        lastAccessedAt: '2026-10-01T02:00:00Z', accessEmailSentAt: '2026-10-01T01:10:00Z',
        deliverablesUploadedAt: null, firstDownloadAt: null, expiresAt: null, downloadExpiryDays: 30,
        pendingDownloadRequests: 0, completedOriginalDownloads: 1, latestDownloadRequestAt: null } },
      files: unavailableFiles ? { status: 'unavailable', data: null,
        message: 'File counts are temporarily unavailable. Retry details; other records remain usable.' } : {
        status: 'ready', data: { rawCount: 115, rawFailedCount: 0, rawUploadingCount: 0,
          enhancedCount: 0, enhancedFailedCount: 0, lastRawUploadAt: '2026-10-01T01:30:00Z',
          lastEnhancedUploadAt: null, recentFiles: [{ id: `file-${id}`, fileName: `SYNTHETIC-${id}.JPG`,
            size: 5242880, status: 'ready', timestamp: '2026-10-01T01:30:00Z', kind: 'raw' }] } },
      activity: { status: 'ready', data: [{ id: `activity-${id}`, timestamp: '2026-10-01T03:00:00Z',
        label: `Selection approved for ${id}`, source: 'selection' }] },
    },
  }
}

function searchResult(id: string): ClientWorkspaceSearchResult {
  const core = workspaceCore(id)
  return { clientId: core.client.id, clientReference: core.client.reference, identitySource: 'client',
    bookingId: id, name: CLIENT_NAME, contactHint: core.client.email, packageName: core.booking.packageName,
    shootDate: core.booking.bookingDate, bookingStatus: 'Confirmed', paymentStatus: 'Paid Deposit',
    productionStatus: 'READY_FOR_EDITING', href: core.links.workspace }
}

type Read = { path: string; booking: string | null; section: string | null }
type WorkspaceFixture = {
  page: Page
  reads: Read[]
  mutations: string[]
  runtimeErrors: string[]
  blockedExternalRequests: string[]
  expectHttpFailure: (url: string) => void
  failSearch: () => void
  failCore: () => void
  recoverCore: () => void
  failDetails: () => void
  unavailableFiles: (value: boolean) => void
  dashboardMode: (value: 'empty' | 'failed' | 'attention') => void
  holdDetails: () => { release: () => void; requested: Promise<void> }
  open: (booking?: string) => Promise<void>
}

export const test = base.extend<{ workspace: WorkspaceFixture }>({
  workspace: async ({ page, context, baseURL }, provide) => {
    const localOrigin = new URL(baseURL!).origin
    const reads: Read[] = [], mutations: string[] = [], runtimeErrors: string[] = [], blockedExternalRequests: string[] = []
    const expectedHttpFailures = new Set<string>()
    let searchFails = false, coreFails = false, detailsFail = false, filesUnavailable = false, includePendingBooking = false
    let dashboardMode: 'empty' | 'failed' | 'attention' | null = null
    let detailHold: { pending: Promise<void>; release: () => void; notify: () => void } | null = null
    const session = {
      access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 4102444800, sub: 'client-workspace-test' })).toString('base64url')}.test`,
      refresh_token: 'test-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer',
      user: { id: 'client-workspace-test', email: 'workspace@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
    }
    await context.addCookies([{ name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: baseURL! }])
    page.on('pageerror', error => runtimeErrors.push(error.message))
    page.on('console', message => {
      if (message.type() !== 'error') return
      // Dev HMR transport is not an application console error; assert app errors separately.
      if (message.text().includes('/_next/hmr')) return
      if (message.text().startsWith('Failed to load resource:') && expectedHttpFailures.has(message.location().url)) return
      runtimeErrors.push(message.text())
    })
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== localOrigin) {
        blockedExternalRequests.push(url.origin + url.pathname)
        await route.abort(); return
      }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      const method = route.request().method()
      if (url.pathname.startsWith('/api/admin/client-workspace/')) {
        if (method !== 'GET') { mutations.push(`${method} ${url.pathname}`); await route.fulfill({ status: 405, json: { error: 'This read-only test prohibits mutations.' } }); return }
        reads.push({ path: url.pathname, booking: url.searchParams.get('booking'), section: url.searchParams.get('section') })
        if (url.pathname.endsWith('/attention')) {
          const attention: ClientWorkspaceAttention = { items: dashboardMode === 'attention' ? [{
            bookingId: SECOND_BOOKING, clientId: CLIENT_ID, name: CLIENT_NAME, shootDate: '2026-10-03',
            actionId: 'storage-error', label: 'Review portal setup', explanation: 'Synthetic portal provisioning issue requires attention.',
            href: workspaceLinks(workspaceBooking(SECOND_BOOKING)).workspace, priority: 0,
          }] : [], unavailableSources: [], truncated: false }
          await route.fulfill({ json: attention }); return
        }
        if (url.pathname.endsWith('/search')) {
          if (searchFails) { searchFails = false; expectedHttpFailures.add(url.href); await route.fulfill({ status: 503, json: { error: 'Synthetic search outage' } }); return }
          const query = url.searchParams.get('q') || ''
          await route.fulfill({ json: { query, results: query.toLowerCase().includes('nomatch') ? [] : [searchResult(FIRST_BOOKING), searchResult(OTHER_BOOKING)], hasMore: false } }); return
        }
        const booking = url.searchParams.get('booking') || FIRST_BOOKING
        if (url.searchParams.get('section') === 'details') {
          if (detailHold) { const hold = detailHold; hold.notify(); await hold.pending; if (detailHold === hold) detailHold = null }
          if (detailsFail) { detailsFail = false; expectedHttpFailures.add(url.href); await route.fulfill({ status: 503, json: { error: 'Synthetic details outage' } }); return }
          await route.fulfill({ json: workspaceDetails(booking, filesUnavailable) }); return
        }
        if (coreFails) { expectedHttpFailures.add(url.href); await route.fulfill({ status: 503, json: { error: 'Synthetic workspace unavailable' } }); return }
        await route.fulfill({ json: workspaceCore(booking) }); return
      }
      if (url.pathname === '/api/bookings' || url.pathname === '/api/editor-workflow/filtering') {
        if (dashboardMode === 'failed') { expectedHttpFailures.add(url.href); await route.fulfill({ status: 503, json: { error: 'Synthetic booking read unavailable' } }); return }
        if (dashboardMode === 'empty') { await route.fulfill({ json: [] }); return }
        await route.fulfill({ json: includePendingBooking
          ? [workspaceBooking(PENDING_BOOKING), workspaceBooking(OTHER_BOOKING)]
          : [workspaceBooking(FIRST_BOOKING), workspaceBooking(SECOND_BOOKING), workspaceBooking(OTHER_BOOKING)] }); return
      }
      if (url.pathname === '/api/bookings/client-priorities') {
        await route.fulfill({ json: [{ bookingId: FIRST_BOOKING, clientPriority: 1 }, { bookingId: OTHER_BOOKING, clientPriority: 2 }] }); return
      }
      if (url.pathname === '/api/sync') { await route.fulfill({ json: { ok: true } }); return }
      if (method !== 'GET') mutations.push(`${method} ${url.pathname}`)
      if (url.pathname === '/api/editor-workflow/session') {
        await route.fulfill({ json: { user: { id: 'client-workspace-test', email: 'workspace@example.test', displayName: 'Synthetic Admin' },
          workspace: { name: 'Synthetic Studio' }, role: 'admin', capabilities: { edit: true, onsite: true, admin: true } } }); return
      }
      await route.fulfill({ json: [] })
    })
    await provide({ page, reads, mutations, runtimeErrors, blockedExternalRequests,
      expectHttpFailure: url => { expectedHttpFailures.add(url) },
      failSearch: () => { searchFails = true }, failCore: () => { coreFails = true },
      recoverCore: () => { coreFails = false },
      failDetails: () => { detailsFail = true }, unavailableFiles: value => { filesUnavailable = value },
      dashboardMode: value => { dashboardMode = value },
      holdDetails: () => {
        let release!: () => void, notify!: () => void
        const pending = new Promise<void>(resolve => { release = resolve })
        const requested = new Promise<void>(resolve => { notify = resolve })
        detailHold = { pending, release, notify }
        return { release, requested }
      },
      open: async (booking = FIRST_BOOKING) => {
        includePendingBooking = booking === PENDING_BOOKING
        await page.goto(`/admin/clients/${CLIENT_ID}?booking=${booking}`)
        await expect(page.getByRole('region', { name: 'Client workspace', exact: true })).toBeVisible()
        await expect(page.getByRole('heading', { name: CLIENT_NAME, exact: true })).toBeVisible()
      },
    })
    const unfinishedHold = detailHold as { release: () => void } | null
    unfinishedHold?.release()
    expect(mutations, 'Read-only client navigation must not make unmocked writes').toEqual([])
    expect(blockedExternalRequests, 'The isolated workflow must not contact hosted services').toEqual([])
    expect(runtimeErrors, 'Unexpected client console or page errors').toEqual([])
  },
})

export { expect }
