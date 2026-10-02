import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTs } from './helpers/load-ts.ts'
import type { ClientWorkspaceAttention, ClientWorkspaceCore, ClientWorkspaceDetails, ClientWorkspaceSearch } from '../lib/client-workspace-types.ts'

const workspace = 'workspace-1'
const clientA = '11111111-1111-4111-8111-111111111111'
const clientB = '22222222-2222-4222-8222-222222222222'
type Row = Record<string, unknown>
type QueryCall = { table: string; columns: string; filters: Array<[string, string, unknown]>; limit: number | null; range: [number, number] | null; signal: boolean }
type Fixture = ReturnType<typeof fixture>

function fixture() {
  const calls: QueryCall[] = []
  const failed = new Set<string>()
  const rejected = new Set<string>()
  const baseBooking = { workspace_id: workspace, customer_name: 'Maria Santos', customer_email: 'maria@example.test', customer_phone: '09123456789',
    package_id: 'graduation', package_name: 'Graduation package', booking_time: '9:00 AM', booking_status: 'Confirmed', payment_status: 'Paid Deposit',
    price: 1500, deposit_amount: 500, payment_history: [{ id: 'history-1', amount: 500, method: 'GCash', type: 'Deposit', date: '2026-09-01T01:00:00Z' }],
    receipt_url: 'https://private.test/receipt?token=SECRET-RECEIPT', note: 'Needs extra preparation · Receipt: https://private.test/receipt?token=SECRET-RECEIPT',
    staff_notes: 'Allow time for a family photo', created_at: '2026-09-01T01:00:00Z', confirmed_at: '2026-09-02T01:00:00Z', selection_limit: 5,
    raw_photo_status: 'Pending Review', raw_photo_submitted_at: '2026-09-29T03:00:00Z', storage_key: 'SECRET-KEY', pin_hash: 'SECRET-PIN', secret_token: 'SECRET-TOKEN' }
  const tables: Record<string, Row[]> = {
    clients: [{ id: clientA, workspace_id: workspace, display_name: 'Maria Santos', email: 'maria@example.test', phone: '09123456789' },
      { id: clientB, workspace_id: workspace, display_name: 'Maria Santos', email: 'maria@example.test', phone: '09129876543' }],
    bookings: [{ ...baseBooking, id: 'FM-100001', client_id: clientA, booking_date: '2026-10-01', client_priority: 3 },
      { ...baseBooking, id: 'FM-100002', client_id: clientA, booking_date: '2026-10-15' },
      { ...baseBooking, id: 'FM-100003', client_id: clientB, booking_date: '2026-10-10' },
      { ...baseBooking, id: 'FM-100004', client_id: null, booking_date: '2026-09-10' },
      { ...baseBooking, id: 'FM-100005', client_id: clientA, workspace_id: 'workspace-other', booking_date: '2026-10-31' }],
    packages: [{ id: 'graduation', category: 'graduation', title: 'Graduation', features: ['Five enhanced photos', 'Included prints'], selection_limit: 5 }],
    payments: [{ id: 'payment-1', booking_id: 'FM-100001', amount: 600, status: 'confirmed', method: 'GCash', payment_type: 'Deposit', created_at: '2026-09-02T01:00:00Z', verified_at: '2026-09-02T02:00:00Z', provider_event_id: 'SECRET-PROVIDER' }],
    receipt_fingerprints: [{ id: '33333333-3333-4333-8333-333333333333', booking_id: 'FM-100001', created_at: '2026-09-01T01:00:00Z', storage_path: 'SECRET-RECEIPT-PATH' }],
    booking_provisioning: [{ workspace_id: workspace, booking_id: 'FM-100001', status: 'ACTIVE', storage_provider: 'r2', storage_status: 'ready', storage_prefix: 'SECRET-PREFIX' }],
    photo_selections: [{ id: 'selection-1', workspace_id: workspace, booking_id: 'FM-100001', status: 'SUBMITTED', client_status: 'Submitted', required_count: 5, included_limit: 5, total_addon_amount: 150, raw_reset_id: null, submitted_at: '2026-09-29T03:00:00Z' }],
    photo_selection_items: [{ selection_id: 'selection-1', gallery_file_id: 'file-1', enhancement_preference: 'less', is_extra_edit: false },
      { selection_id: 'selection-1', gallery_file_id: 'file-2', enhancement_preference: 'standard', is_extra_edit: true }],
    gallery_files: [{ id: 'file-1', workspace_id: workspace, booking_id: 'FM-100001', file_name: 'BNI001.JPG', storage_status: 'available', file_size: 123, created_at: '2026-09-28T01:00:00Z', storage_key: 'SECRET-RAW' },
      { id: 'file-2', workspace_id: workspace, booking_id: 'FM-100001', file_name: 'BNI002.JPG', storage_status: 'available', file_size: 124, created_at: '2026-09-28T02:00:00Z' },
      { id: 'file-other', workspace_id: 'workspace-other', booking_id: 'FM-100001', file_name: 'OTHER-CLIENT.JPG', storage_status: 'available' }],
    print_allocations: [{ id: 'print-1', workspace_id: workspace, booking_id: 'FM-100001', selection_id: 'selection-1', category: 'FRAME_8R', label_snapshot: 'Frame', gallery_file_id: 'file-1', quantity: 1, storage_status: 'available', print_storage_key: 'SECRET-PRINT' }],
    client_addon_orders: [{ id: 'addon-1', workspace_id: workspace, booking_id: 'FM-100001', selection_id: 'selection-1', name_snapshot: 'Extra edit', pricing_type_snapshot: 'per_photo', unit_price_snapshot: 150, quantity: 1, photo_count: 1, photo_ids: ['file-2'], total_amount: 150 }],
    editing_jobs: [{ id: 'job-1', workspace_id: workspace, booking_id: 'FM-100001', batch_id: 'batch-1', client_id: clientA, status: 'READY_FOR_EDITING', selected_count: 2, expected_output_count: 2, assigned_editor_name: 'Editor One', downloaded_at: '2026-09-30T01:00:00Z', last_error: 'SECRET-ERROR', download_locked_by: 'SECRET-LOCK' }],
    editing_batches: [{ id: 'batch-1', workspace_id: workspace, display_id: 'FM-BATCH-2026-10-01-MAIN', status: 'READY', shoot_date: '2026-10-01', location_key: 'MAIN', storage_prefix: 'SECRET-BATCH' }],
    batch_upload_items: [{ id: 'item-1', editing_job_id: 'job-1', booking_id: 'FM-100001', upload_job_id: 'upload-1', status: 'FAILED', expected_files: 2, uploaded_files: 1, attempt_count: 2, last_error: 'SECRET-UPLOAD', updated_at: '2026-09-30T01:00:00Z' }],
    batch_upload_files: [{ id: 'upload-file-1', upload_item_id: 'item-1', status: 'FAILED', storage_key: 'SECRET-UPLOAD-KEY' }],
    client_portals: [{ workspace_id: workspace, booking_id: 'FM-100001', status: 'active', created_at: '2026-09-28T03:00:00Z', access_email_sent_at: '2026-09-28T04:00:00Z', expires_at: null, download_expiry_days: 30, public_id: 'SECRET-PUBLIC-ID', pin_hash: 'SECRET-PIN', access_token: 'SECRET-ACCESS' }],
    portal_raw_download_requests: [{ id: 'request-1', workspace_id: workspace, booking_id: 'FM-100001', status: 'PENDING', requested_at: '2026-09-30T01:00:00Z', reason: 'PRIVATE-REASON' }],
    portal_raw_download_attempts: [{ id: 'attempt-1', workspace_id: workspace, booking_id: 'FM-100001', status: 'COMPLETED' }],
    deliverable_files: [{ id: 'deliverable-1', workspace_id: workspace, booking_id: 'FM-100001', file_name: 'ENHANCED 1 - MARIA SANTOS.JPG', storage_status: 'available', published_at: '2026-09-30T04:00:00Z', file_size: 99, storage_key: 'SECRET-DELIVERABLE' }],
    workflow_audit_logs: [{ id: 1, workspace_id: workspace, booking_id: 'FM-100001', action: 'DELIVERY_COMPLETED', created_at: '2026-09-30T04:00:00Z', metadata: { signedUrl: 'SECRET-SIGNED-URL' } },
      { id: 2, workspace_id: workspace, booking_id: 'FM-100001', action: 'UNKNOWN_TECHNICAL_EVENT', created_at: '2026-09-30T05:00:00Z' }],
    provisioning_audit: [{ id: 1, workspace_id: workspace, booking_id: 'FM-100001', action: 'payment_confirmed', created_at: '2026-09-02T02:00:00Z' }],
    email_logs: [{ id: 1, booking_id: 'FM-100001', status: 'SENT', sent_at: '2026-09-28T04:00:00Z', body: 'SECRET-EMAIL-TOKEN' }],
  }
  const admin = { from(table: string) {
    const call: QueryCall = { table, columns: '', filters: [], limit: null, range: null, signal: false }
    calls.push(call)
    let single = false
    let head = false
    const sorts: Array<[string, boolean]> = []
    const query = {
      select(columns: string, options?: { head?: boolean }) { call.columns = columns; head = Boolean(options?.head); return query },
      returns() { return query },
      eq(column: string, value: unknown) { call.filters.push(['eq', column, value]); return query },
      is(column: string, value: unknown) { call.filters.push(['eq', column, value]); return query },
      neq(column: string, value: unknown) { call.filters.push(['neq', column, value]); return query },
      in(column: string, values: unknown[]) { call.filters.push(['in', column, values]); return query },
      or(filter: string) { call.filters.push(['or', '', filter]); return query },
      order(column: string, options?: { ascending?: boolean }) { sorts.push([column, options?.ascending !== false]); return query },
      range(from: number, to: number) { call.range = [from, to]; return query },
      limit(value: number) { call.limit = value; return query },
      maybeSingle() { single = true; return query },
      abortSignal() { call.signal = true; return query },
      insert() { throw new Error('A Client Workspace read must not insert records') },
      update() { throw new Error('A Client Workspace read must not update records') },
      upsert() { throw new Error('A Client Workspace read must not upsert records') },
      delete() { throw new Error('A Client Workspace read must not delete records') },
      then<T>(resolve: (value: { data: unknown; error: { message: string } | null; count: number | null }) => T, reject?: (error: unknown) => T | PromiseLike<T>) {
        if (rejected.has(table)) return Promise.reject(new Error('SECRET network timeout')).then(resolve, reject)
        let data = [...(tables[table] || [])].filter(r => call.filters.every(([operator, column, value]) => {
          if (operator === 'eq') return r[column] === value || (value === null && r[column] == null)
          if (operator === 'neq') return r[column] !== value
          if (operator === 'in') return (value as unknown[]).includes(r[column])
          if (operator === 'or') {
            if (String(value) === 'status.in.(FAILED,PARTIAL_FAILURE),storage_status.eq.error') return ['FAILED', 'PARTIAL_FAILURE'].includes(String(r.status)) || r.storage_status === 'error'
            const matches = [...String(value).matchAll(/(\w+)\.ilike\."((?:\\.|[^"\\])*)"/g)]
            return matches.some(([, field, pattern]) => {
              const tokens = pattern.split('%').filter(Boolean).map(p => p.replace(/\\(.)/g, '$1').toLowerCase())
              let remainder = String(r[field] || '').toLowerCase()
              return tokens.every(token => { const index = remainder.indexOf(token); if (index < 0) return false; remainder = remainder.slice(index + token.length); return true })
            })
          }
          return true
        }))
        const count = data.length
        data.sort((a, b) => { for (const [column, ascending] of sorts) { const compare = String(a[column] || '').localeCompare(String(b[column] || '')); if (compare) return ascending ? compare : -compare } return 0 })
        if (call.range) data = data.slice(call.range[0], call.range[1] + 1)
        if (call.limit != null) data = data.slice(0, call.limit)
        return Promise.resolve({ data: failed.has(table) ? null : head ? null : single ? data[0] || null : data,
          error: failed.has(table) ? { message: 'SECRET database connection error' } : null, count: failed.has(table) ? null : count }).then(resolve, reject)
      },
    }
    return query
  } }
  const service = loadTs<{
    searchClientWorkspace: (admin: unknown, workspaceId: string, q: string) => Promise<ClientWorkspaceSearch>
    loadClientWorkspaceCore: (admin: unknown, workspaceId: string, ref: string, booking?: string) => Promise<ClientWorkspaceCore>
    loadClientWorkspaceDetails: (admin: unknown, workspaceId: string, core: ClientWorkspaceCore) => Promise<ClientWorkspaceDetails>
    loadClientWorkspaceAttention: (admin: unknown, workspaceId: string) => Promise<ClientWorkspaceAttention>
    normalizeClientWorkspaceSearch: (q: string) => string
    clientWorkspaceSearchFilter: (columns: string[], q: string) => string
    parseClientWorkspaceReference: (q: string) => unknown
    ClientWorkspaceError: new (message: string, status: number) => Error & { status: number }
  }>('lib/client-workspace.ts', {
    'server-only': {},
    '@/lib/package-workflow': { usesGraduationWorkflow: (category: string) => ['graduation', 'capping-pinning', 'creative'].includes(category), usesOnsiteWorkflow: (category: string) => ['graduation', 'capping-pinning', 'creative', 'self-portrait'].includes(category) },
    '@/lib/portal-expiry': { hasPortalExpired: (at: string | null) => Boolean(at && Date.parse(at) <= Date.now()) },
    '@/lib/database/read-pages': loadTs('lib/database/read-pages.ts', {}),
    '@/lib/workflow-next-action': loadTs('lib/workflow-next-action.ts', {}),
  })
  return { service, admin, calls, tables, failed, rejected }
}

test('workspace core uses customer UUID relations and never joins matching names or email', async () => {
  const f = fixture()
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  assert.equal(core.client.id, clientA)
  assert.deepEqual(core.bookings.map(b => b.id), ['FM-100002', 'FM-100001'])
  assert.equal(core.selectedBookingId, 'FM-100001')
  assert.equal(core.booking.clientPriority, 3)
  assert.deepEqual(core.package.data?.features, ['Five enhanced photos', 'Included prints'])
  assert.equal(core.booking.staffNotes, 'Allow time for a family photo')
  assert.equal(core.booking.note, 'Needs extra preparation')
  assert.equal(core.booking.receiptAvailable, true)
  assert.equal(core.booking.receiptHref, null)
  assert.deepEqual(new Set(f.calls.map(c => c.table)), new Set(['clients', 'bookings', 'packages']))
  for (const request of f.calls.filter(c => c.table !== 'packages')) assert.ok(request.filters.some(([op, col, value]) => op === 'eq' && col === 'workspace_id' && value === workspace))
})

test('unknown client, other customer booking and other workspace cannot leak dependent data', async () => {
  for (const [ref, booking, scope] of [[clientA, 'FM-100003', workspace], [clientA, 'FM-100005', workspace], [clientB, 'FM-100001', workspace], [clientA, 'FM-100001', 'workspace-other']] as const) {
    const f = fixture()
    await assert.rejects(f.service.loadClientWorkspaceCore(f.admin, scope, ref, booking), (error: Error & { status?: number }) => error.status === 404)
    assert.ok(f.calls.every(c => ['bookings', 'clients'].includes(c.table)))
  }
})

test('legacy identity is an explicit booking-only namespace and cannot open a linked booking', async () => {
  const f = fixture()
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, 'booking:FM-100004')
  assert.equal(core.client.id, null)
  assert.equal(core.client.identitySource, 'booking')
  assert.equal(core.client.reference, 'booking:FM-100004')
  assert.deepEqual(core.bookings.map(b => b.id), ['FM-100004'])
  await assert.rejects(f.service.loadClientWorkspaceCore(f.admin, workspace, 'booking:FM-100001'), (e: Error & { status?: number }) => e.status === 404)
  assert.throws(() => f.service.parseClientWorkspaceReference('not-a-customer'), (e: Error & { status?: number }) => e.status === 400)
  assert.throws(() => f.service.parseClientWorkspaceReference('booking:../../secrets'))
})

test('search tolerates case and spaces, preserves distinct same-name customers, and returns safe contacts', async () => {
  const f = fixture()
  const result = await f.service.searchClientWorkspace(f.admin, workspace, '  MARIA   Santos  ')
  assert.equal(result.query, 'MARIA Santos')
  assert.equal(result.results.length, 4)
  assert.ok(result.results.some(r => r.clientId === clientA))
  assert.ok(result.results.some(r => r.clientId === clientB))
  assert.ok(result.results.some(r => r.clientId === null && r.clientReference === 'booking:FM-100004'))
  assert.ok(result.results.every(r => !r.contactHint?.includes('09123456789') && !r.contactHint?.includes('maria@')))
  assert.ok(result.results.every(r => r.bookingId !== 'FM-100005'))
  assert.equal(result.results.find(r => r.bookingId === 'FM-100001')?.productionStatus, 'READY_FOR_EDITING')
  const id = await f.service.searchClientWorkspace(f.admin, workspace, 'fm-100001')
  assert.equal(id.results.length, 1)
  assert.equal(id.results[0].bookingId, 'FM-100001')
})

test('search grammar escapes filters and literal wildcards and bounds results to 25', async () => {
  const f = fixture()
  const filter = f.service.clientWorkspaceSearchFilter(['customer_name'], 'Santos,"),id.neq.null,%_*\\')
  assert.ok(filter.startsWith('customer_name.ilike."%'))
  assert.ok(filter.includes('\\"'))
  assert.ok(filter.includes('\\\\%') && filter.includes('\\\\_') && filter.includes('\\\\*'))
  assert.throws(() => f.service.normalizeClientWorkspaceSearch('x'.repeat(121)))
  const original = f.tables.bookings[0]
  for (let n = 10; n < 50; n++) f.tables.bookings.push({ ...original, id: `FM-${100000 + n}` })
  const result = await f.service.searchClientWorkspace(f.admin, workspace, 'Maria')
  assert.equal(result.results.length, 25)
  assert.equal(result.hasMore, true)
  for (const call of f.calls.filter(c => ['clients', 'bookings'].includes(c.table))) assert.equal(call.limit, 26)
})

test('details connects payment RAW selection prints add-ons editing upload portal files and known activity', async () => {
  const f = fixture()
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  f.calls.length = 0
  const details = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  assert.equal(details.sections.payments.data?.amountPaid, 600)
  assert.equal(details.sections.payments.data?.packageBalance, 900)
  assert.equal(details.sections.payments.data?.source, 'payments')
  assert.equal(details.sections.payments.data?.receiptHref, '/api/receipts/33333333-3333-4333-8333-333333333333')
  assert.equal(details.sections.storage.data?.status, 'ready')
  assert.equal(details.sections.selection.data?.selectedCount, 2)
  assert.equal(details.sections.selection.data?.extraEditCount, 1)
  assert.equal(details.sections.selection.data?.photos?.[0].fileName, 'BNI001.JPG')
  assert.equal(details.sections.prints.data?.[0].fileName, 'BNI001.JPG')
  assert.equal(details.sections.addons.data?.[0].photos[0].fileName, 'BNI002.JPG')
  assert.equal(details.sections.production.data?.batch?.id, 'FM-BATCH-2026-10-01-MAIN')
  assert.equal(details.sections.production.data?.uploads?.[0].failedFiles, 1)
  assert.equal(details.sections.portal.data?.pendingDownloadRequests, 1)
  assert.equal(details.sections.portal.data?.completedOriginalDownloads, 1)
  assert.equal(details.sections.portal.data?.expiresAt, null)
  assert.equal(details.sections.files.data?.rawCount, 2)
  assert.equal(details.sections.files.data?.enhancedCount, 1)
  assert.ok(details.sections.activity.data?.some(e => e.label === 'Final photographs released'))
  assert.ok(!details.sections.activity.data?.some(e => e.label.includes('UNKNOWN_TECHNICAL')))
  assert.equal(details.links.batch, '/editor/batch/FM-BATCH-2026-10-01-MAIN')
  assert.equal(details.links.retryUpload, '/editor/upload?batch=FM-BATCH-2026-10-01-MAIN&retry=1', 'The upload page accepts retry=1 for failed-only mode')
  assert.equal(details.links.files, '/editor/files?date=2026-10-01&booking=FM-100001')
  assert.equal(details.links.portal, '/api/bookings/FM-100001/portal')
  const serialized = JSON.stringify({ core, details })
  for (const secret of ['SECRET', 'storage_key', 'storageKey', 'public_id', 'pin_hash', 'signedUrl', 'download_locked_by', 'PRIVATE-REASON']) assert.ok(!serialized.includes(secret), secret)
  assert.ok(f.calls.every(c => c.columns !== '*'))
  const workspaceTables = new Set(['booking_provisioning', 'photo_selections', 'gallery_files', 'print_allocations', 'client_addon_orders', 'editing_jobs', 'editing_batches', 'client_portals', 'portal_raw_download_requests', 'portal_raw_download_attempts', 'deliverable_files', 'workflow_audit_logs', 'provisioning_audit'])
  for (const call of f.calls.filter(c => workspaceTables.has(c.table))) assert.ok(call.filters.some(([op, key, value]) => op === 'eq' && key === 'workspace_id' && value === workspace), call.table)
  for (const call of f.calls.filter(c => ['payments', 'receipt_fingerprints', 'email_logs', 'batch_upload_items'].includes(c.table))) assert.ok(call.filters.some(([op, key, value]) => op === 'eq' && key === 'booking_id' && value === 'FM-100001'), call.table)
})

test('actual production aggregation renders recorded handoff milestones without borrowing another booking history', async () => {
  const f = fixture()
  Object.assign(f.tables.editing_jobs[0], { editing_started_at: '2026-09-30T02:00:00Z', ready_to_upload_at: null, updated_at: '2026-09-30T03:00:00Z' })
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  const details = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  const production = details.sections.production.data!
  const { default: Milestones } = loadTs<{ default: (props: { production: typeof production }) => ReturnType<typeof createElement> }>('components/production-milestones.tsx', {})
  const html = renderToStaticMarkup(createElement(Milestones, { production }))
  assert.match(html, /Production handoff history/)
  assert.match(html, /Batch status<\/dt><dd[^>]*>READY/)
  assert.match(html, /Originals downloaded for editing<\/dt><dd[^>]*>Sep 30, 2026, 9:00 AM/)
  assert.match(html, /Editing started<\/dt><dd[^>]*>Sep 30, 2026, 10:00 AM/)
  assert.match(html, /Ready to upload<\/dt><dd[^>]*>Not recorded/)
  assert.match(html, /Editing record last updated<\/dt><dd[^>]*>Sep 30, 2026, 11:00 AM/)
  const secondCore = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100002')
  const secondDetails = await f.service.loadClientWorkspaceDetails(f.admin, workspace, secondCore)
  assert.equal(secondDetails.sections.production.status, 'empty')
  assert.equal(secondDetails.sections.production.data, null)
  const missing = renderToStaticMarkup(createElement(Milestones, { production: { ...production, batch: null, downloadedAt: null, editingStartedAt: null, updatedAt: 'invalid' } }))
  assert.match(missing, /Batch status<\/dt><dd[^>]*>Not assigned/)
  assert.match(missing, /Date unavailable/)
  assert.ok(!missing.includes('9:00 AM') && !missing.includes('10:00 AM'))
})

test('payment query failure does not fall through to a historical paid amount and other sections survive', async () => {
  const f = fixture()
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  f.failed.add('payments')
  f.failed.add('gallery_files')
  f.failed.add('workflow_audit_logs')
  const details = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  assert.equal(details.sections.payments.status, 'unavailable')
  assert.equal(details.sections.payments.data, null)
  assert.equal(details.sections.files.status, 'partial')
  assert.equal(details.sections.files.data?.rawCount, null)
  assert.equal(details.sections.files.data?.enhancedCount, 1)
  assert.equal(details.sections.selection.status, 'partial')
  assert.equal(details.sections.selection.data?.selectedCount, 2)
  assert.equal(details.sections.selection.data?.photos?.[0].fileName, null)
  assert.equal(details.sections.storage.status, 'ready')
  assert.equal(details.sections.activity.status, 'partial')
  assert.ok(!JSON.stringify(details).includes('SECRET database'))
})

test('successfully empty payment rows use the existing paid-booking history fallback once', async () => {
  const f = fixture()
  f.tables.payments = []
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  const details = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  assert.equal(details.sections.payments.data?.source, 'booking-history')
  assert.equal(details.sections.payments.data?.amountPaid, 500)
})

test('network rejections and optional receipt or batch failures retain successful primary data', async () => {
  const f = fixture()
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  for (const table of ['receipt_fingerprints', 'editing_batches', 'portal_raw_download_requests', 'gallery_files']) f.rejected.add(table)
  const details = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  assert.equal(details.sections.payments.status, 'partial')
  assert.equal(details.sections.payments.data?.amountPaid, 600)
  assert.equal(details.sections.production.status, 'partial')
  assert.equal(details.sections.production.data?.status, 'READY_FOR_EDITING')
  assert.equal(details.sections.production.data?.batch, null)
  assert.equal(details.sections.portal.status, 'partial')
  assert.equal(details.sections.portal.data?.status, 'active')
  assert.equal(details.sections.portal.data?.pendingDownloadRequests, null)
  assert.equal(details.sections.files.status, 'partial')
  assert.equal(details.sections.files.data?.rawCount, null)
  assert.equal(details.sections.files.data?.enhancedCount, 1)
  assert.ok(!JSON.stringify(details).includes('SECRET'))
  f.rejected.add('editing_jobs')
  const search = await f.service.searchClientWorkspace(f.admin, workspace, 'Maria')
  assert.equal(search.results.length, 4)
  assert.ok(search.results.every(r => r.productionStatus === null))
})

test('missing or failed selection is distinct and never treated as an empty completed selection', async () => {
  const f = fixture()
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  f.tables.photo_selections = []
  const empty = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  for (const section of ['selection', 'prints', 'addons'] as const) {
    assert.equal(empty.sections[section].status, 'empty')
    assert.equal(empty.sections[section].data, null)
  }
  f.failed.add('photo_selections')
  const failed = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  for (const section of ['selection', 'prints', 'addons'] as const) {
    assert.equal(failed.sections[section].status, 'unavailable')
    assert.equal(failed.sections[section].data, null)
  }
  assert.equal(failed.sections.portal.status, 'ready')
  assert.equal(failed.sections.production.status, 'ready')
})

test('exact file counts exceed the default row ceiling while returned file names remain bounded', async () => {
  const f = fixture()
  const file = f.tables.gallery_files[0]
  for (let n = 3; n < 1100; n++) f.tables.gallery_files.push({ ...file, id: `file-${n}`, file_name: `BNI${n}.JPG` })
  // Failed uploads must not obscure the last successfully uploaded original.
  for (let n = 0; n < 25; n++) f.tables.gallery_files.push({ ...file, id: `failed-${n}`, storage_status: 'failed', created_at: '2026-09-30T01:00:00Z' })
  const core = await f.service.loadClientWorkspaceCore(f.admin, workspace, clientA, 'FM-100001')
  const details = await f.service.loadClientWorkspaceDetails(f.admin, workspace, core)
  assert.equal(details.sections.files.data?.rawCount, 1099)
  assert.equal(details.sections.files.data?.rawFailedCount, 25)
  assert.equal(details.sections.files.data?.lastRawUploadAt, '2026-09-28T02:00:00Z')
  assert.equal(details.sections.files.data?.recentFiles.filter(file => file.kind === 'raw').length, 20)
})

function routeHarness(f: Fixture, auth: { user: unknown; access: unknown; error: Response | null }, limited: Response | null = null) {
  let reads = 0
  let limitCalls = 0
  const stubs = {
    '@/lib/auth-api': { requireWorkflowAuth: async (capability: string) => { assert.equal(capability, 'admin'); return auth } },
    '@/lib/auth/admin': { isAdminUser: (user: { app_metadata?: { role?: string } }) => ['admin', 'owner'].includes(user.app_metadata?.role || '') },
    '@/lib/client-workspace': f.service,
    '@/lib/security/api-rate-limit': { enforceApiRateLimit: async (_request: Request, policy: { failClosed: boolean }, dimensions: string[]) => { limitCalls++; assert.equal(policy.failClosed, true); assert.deepEqual(dimensions, ['admin-user', workspace]); return limited } },
    '@/lib/security/request-security': { privateNoStoreHeaders: () => ({ 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' }) },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => { reads++; return f.admin } },
  }
  return {
    detail: loadTs<{ GET: (request: Request, context: { params: Promise<{ clientId: string }> }) => Promise<Response> }>('app/api/admin/client-workspace/[clientId]/route.ts', stubs),
    search: loadTs<{ GET: (request: Request) => Promise<Response> }>('app/api/admin/client-workspace/search/route.ts', stubs),
    attention: loadTs<{ GET: (request: Request) => Promise<Response> }>('app/api/admin/client-workspace/attention/route.ts', stubs),
    reads: () => reads, limits: () => limitCalls,
  }
}
const adminAuth = { user: { id: 'admin-user', app_metadata: { role: 'admin' } }, access: { workspaceId: workspace, role: 'admin' }, error: null }

test('actual API denies anonymous editor onsite and user_metadata-only access before reading', async () => {
  for (const auth of [
    { user: null, access: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) },
    { user: { id: 'editor', app_metadata: { role: 'editor' } }, access: null, error: Response.json({ error: 'Denied' }, { status: 403 }) },
    { user: { id: 'onsite', app_metadata: { role: 'onsite' } }, access: { workspaceId: workspace, role: 'onsite' }, error: null },
    { user: { id: 'admin-user', user_metadata: { role: 'admin' }, app_metadata: {} }, access: { workspaceId: workspace, role: 'admin' }, error: null },
  ]) {
    const h = routeHarness(fixture(), auth)
    const detail = await h.detail.GET(new Request('https://admin.test/api/admin/client-workspace/' + clientA), { params: Promise.resolve({ clientId: clientA }) })
    const search = await h.search.GET(new Request('https://admin.test/api/admin/client-workspace/search?q=Maria'))
    const attention = await h.attention.GET(new Request('https://admin.test/api/admin/client-workspace/attention'))
    assert.ok([401, 403].includes(detail.status))
    assert.ok([401, 403].includes(search.status))
    assert.ok([401, 403].includes(attention.status))
    assert.match(detail.headers.get('cache-control') || '', /private, no-store/)
    assert.match(search.headers.get('cache-control') || '', /private, no-store/)
    assert.equal(h.reads(), 0)
  }
})

test('production attention is scoped bounded and prioritized without loading per-customer workspaces', async () => {
  const f = fixture()
  f.tables.booking_provisioning[0].status = 'FAILED'
  f.tables.editing_jobs.push({ id: 'job-2', workspace_id: workspace, booking_id: 'FM-100002', status: 'UPLOAD_FAILED' },
    { id: 'job-3', workspace_id: workspace, booking_id: 'FM-100003', status: 'READY_TO_UPLOAD' },
    { id: 'foreign-job', workspace_id: 'workspace-other', booking_id: 'FM-100005', status: 'UPLOAD_FAILED' })
  f.tables.photo_selections.push({ id: 'selection-2', workspace_id: workspace, booking_id: 'FM-100004', status: 'SUBMITTED' })
  const result = await f.service.loadClientWorkspaceAttention(f.admin, workspace)
  assert.equal(result.items.length, 4)
  assert.equal(result.items[0].actionId, 'storage-error')
  assert.equal(result.items.find(item => item.bookingId === 'FM-100002')?.actionId, 'upload-error')
  assert.equal(result.items.find(item => item.bookingId === 'FM-100003')?.actionId, 'upload')
  assert.equal(result.items.find(item => item.bookingId === 'FM-100004')?.actionId, 'review')
  assert.equal(result.items.find(item => item.bookingId === 'FM-100004')?.href, '/admin/clients/booking%3AFM-100004?booking=FM-100004')
  assert.ok(!result.items.some(item => item.bookingId === 'FM-100005'))
  assert.deepEqual(result.unavailableSources, [])
  assert.equal(result.truncated, false)
  assert.equal(f.calls.filter(call => call.table === 'bookings').length, 1)
  assert.ok(!f.calls.some(call => call.table === 'clients' || call.table === 'gallery_files' || call.table === 'payments'))
  for (const call of f.calls.filter(call => call.table !== 'packages')) assert.ok(call.filters.some(([op, field, value]) => op === 'eq' && field === 'workspace_id' && value === workspace), call.table)
  const sources = f.calls.filter(call => call.limit === 25)
  assert.equal(sources.length, 4)
  assert.ok(!JSON.stringify(result).includes('SECRET'))
})

test('production attention preserves unavailable source truth and suppresses stale self-portrait jobs', async () => {
  const f = fixture()
  f.tables.packages.push({ id: 'selfie', category: 'self-portrait' })
  f.tables.bookings[2].package_id = 'selfie'
  f.tables.editing_jobs.push({ id: 'selfie-job', workspace_id: workspace, booking_id: 'FM-100003', status: 'READY_FOR_EDITING' })
  f.failed.add('booking_provisioning')
  f.rejected.add('photo_selections')
  const result = await f.service.loadClientWorkspaceAttention(f.admin, workspace)
  assert.ok(result.unavailableSources.includes('Storage setup'))
  assert.ok(result.unavailableSources.includes('Submitted selections'))
  assert.equal(result.items.find(item => item.bookingId === 'FM-100001')?.actionId, 'download-request')
  assert.ok(!result.items.some(item => item.bookingId === 'FM-100003'))
  f.failed.add('bookings')
  const missing = await f.service.loadClientWorkspaceAttention(f.admin, workspace)
  assert.deepEqual(missing.items, [])
  assert.ok(missing.unavailableSources.includes('Client context'))
})

test('attention exact source counts report truncation and final response is capped at25', async () => {
  const f = fixture()
  const prototype = f.tables.bookings[0]
  for (let n = 10; n < 45; n++) {
    const id = `FM-${100000 + n}`
    f.tables.bookings.push({ ...prototype, id, client_id: clientA })
    f.tables.booking_provisioning.push({ workspace_id: workspace, booking_id: id, status: 'FAILED', storage_status: 'error' })
  }
  const result = await f.service.loadClientWorkspaceAttention(f.admin, workspace)
  assert.equal(result.items.length, 25)
  assert.equal(result.truncated, true)
  const h = routeHarness(f, adminAuth)
  const response = await h.attention.GET(new Request('https://admin.test/api/admin/client-workspace/attention'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') || '', /private, no-store/)
  assert.equal((await response.json()).truncated, true)
})

/** Bounded synthetic read check: 100 candidates and 100 concurrent requests must use 7 queries per feed, not one core per booking. */
test('100 concurrent synthetic attention reads retain constant query counts and bounded responses', async t => {
  const f = fixture()
  const prototype = f.tables.bookings[0]
  for (const table of ['bookings', 'booking_provisioning', 'editing_jobs', 'photo_selections', 'portal_raw_download_requests']) f.tables[table] = []
  for (let index = 0; index < 100; index++) {
    const bookingId = `FM-${200000 + index}`
    f.tables.bookings.push({ ...prototype, id: bookingId })
    const marker = { workspace_id: workspace, booking_id: bookingId }
    if (index < 25) f.tables.booking_provisioning.push({ ...marker, status: 'FAILED', storage_status: 'error' })
    else if (index < 50) f.tables.editing_jobs.push({ ...marker, status: 'UPLOAD_FAILED' })
    else if (index < 75) f.tables.photo_selections.push({ ...marker, status: 'SUBMITTED' })
    else f.tables.portal_raw_download_requests.push({ ...marker, status: 'PENDING' })
  }
  const started = performance.now()
  const results = await Promise.all(Array.from({ length: 100 }, () => f.service.loadClientWorkspaceAttention(f.admin, workspace)))
  const elapsed = performance.now() - started
  assert.ok(results.every(result => result.items.length === 25 && result.truncated && result.unavailableSources.length === 0))
  assert.equal(f.calls.length, 700)
  assert.equal(f.calls.filter(call => call.table === 'bookings').length, 100)
  assert.equal(f.calls.filter(call => call.table === 'editing_jobs').length, 200)
  assert.ok(!f.calls.some(call => ['clients', 'payments', 'gallery_files', 'client_portals'].includes(call.table)))
  t.diagnostic(`Synthetic in-memory only: 100 concurrent reads, 100 candidate bookings, 700 metadata queries (7/read), ${elapsed.toFixed(1)}ms. This is not production latency evidence.`)
})

test('actual API enforces rate controls and preserves exact customer/booking ownership in core and details', async () => {
  const f = fixture()
  const h = routeHarness(f, adminAuth)
  const request = new Request(`https://admin.test/api/admin/client-workspace/${clientA}?booking=FM-100001`)
  const coreResponse = await h.detail.GET(request, { params: Promise.resolve({ clientId: clientA }) })
  assert.equal(coreResponse.status, 200)
  assert.equal((await coreResponse.json()).kind, 'core')
  const detail = await h.detail.GET(new Request(request.url + '&section=details'), { params: Promise.resolve({ clientId: clientA }) })
  assert.equal(detail.status, 200)
  assert.equal((await detail.json()).sections.selection.data.selectedCount, 2)
  const foreign = await h.detail.GET(new Request(`https://admin.test/api/admin/client-workspace/${clientA}?booking=FM-100003&section=details`), { params: Promise.resolve({ clientId: clientA }) })
  assert.equal(foreign.status, 404)
  const bad = await h.detail.GET(new Request('https://admin.test/api/admin/client-workspace/anything'), { params: Promise.resolve({ clientId: 'anything' }) })
  assert.equal(bad.status, 400)
  const search = await h.search.GET(new Request('https://admin.test/api/admin/client-workspace/search?q=Maria'))
  assert.equal(search.status, 200)
  assert.equal((await search.json()).results.length, 4)
  assert.equal(h.limits(), 5)
  const limited = routeHarness(fixture(), adminAuth, Response.json({ error: 'Too many requests' }, { status: 429 }))
  const response = await limited.search.GET(new Request('https://admin.test/api/admin/client-workspace/search?q=Maria'))
  assert.equal(response.status, 429)
  assert.equal(limited.reads(), 0)
})
