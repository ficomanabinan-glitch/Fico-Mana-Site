import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { usesGraduationWorkflow, usesOnsiteWorkflow } from '@/lib/package-workflow'
import { hasPortalExpired } from '@/lib/portal-expiry'
import { readDatabasePages } from '@/lib/database/read-pages'
import { deriveWorkflowNextAction } from '@/lib/workflow-next-action'
import type {
  ClientWorkspaceAttention, ClientWorkspaceCore, ClientWorkspaceDetails, ClientWorkspaceLinks, ClientWorkspaceSearch,
  WorkspaceActivity, WorkspaceAddon, WorkspaceBooking, WorkspaceFile, WorkspaceFiles,
  WorkspacePackage, WorkspacePayment, WorkspacePayments, WorkspacePortal, WorkspacePrint,
  WorkspaceProduction, WorkspaceSection, WorkspaceSelectedPhoto, WorkspaceSelection, WorkspaceStorage,
} from '@/lib/client-workspace-types'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null; count?: number | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BOOKING_ID = /^FM-(?:\d{6}|W[A-Z0-9-]{1,40})$/i
const SEARCH_LIMIT = 25
const QUERY_TIMEOUT_MS = 12_000
const OPTIONAL_CORE_TIMEOUT_MS = 3_000
const BOOKING_COLUMNS = [
  'id', 'workspace_id', 'client_id', 'customer_name', 'customer_email', 'customer_phone',
  'customer_fb_name', 'customer_fb_link', 'package_id', 'package_name', 'selection_limit',
  'booking_date', 'booking_time', 'slot_id', 'arrival_time', 'shoot_time', 'client_priority',
  'is_walk_in', 'booking_status', 'payment_status', 'price', 'deposit_amount', 'discount_amount',
  'discount_label', 'payment_history', 'receipt_url', 'transaction_ref', 'rejection_reason',
  'note', 'staff_notes', 'school_name', 'course', 'hood_color', 'toga_color', 'tassel_color',
  'background_color', 'created_at', 'confirmed_at', 'raw_photo_status', 'raw_photo_notes',
  'raw_photo_submitted_at', 'raw_photo_approved_at', 'edited_photo_delivered_at',
].join(',')
const SEARCH_COLUMNS = 'id,workspace_id,client_id,customer_name,customer_email,customer_phone,package_name,booking_date,booking_status,payment_status'

export class ClientWorkspaceError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function number(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0 }
function optionalNumber(value: unknown): number | null { return value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null }
function timestamp(value: unknown): string | null {
  const s = text(value)
  return s && Number.isFinite(Date.parse(s)) ? s : null
}
function rows(value: unknown): Row[] { return Array.isArray(value) ? value.filter((r): r is Row => Boolean(r) && typeof r === 'object') : [] }
function row(value: unknown): Row | null { return value && !Array.isArray(value) && typeof value === 'object' ? value as Row : null }
function checked(result: Result): unknown {
  if (result.error) throw new Error('Client information could not be read.')
  return result.data
}
async function optionalResult(query: PromiseLike<Result>): Promise<Result> {
  try { return await query } catch { return { data: null, error: { message: 'Optional client information could not be read.' } } }
}
function available<T>(data: T): WorkspaceSection<T> { return { status: 'ready', data } }
function empty<T>(): WorkspaceSection<T> { return { status: 'empty', data: null } }
function partial<T>(data: T, message: string): WorkspaceSection<T> { return { status: 'partial', data, message } }
function unavailable<T>(label: string): WorkspaceSection<T> {
  return { status: 'unavailable', data: null, message: `${label} could not be loaded. Retry this section.` }
}
async function settleSection<T>(label: string, query: () => Promise<WorkspaceSection<T>>): Promise<WorkspaceSection<T>> {
  try { return await query() } catch { return unavailable(label) }
}
function scoped(admin: SupabaseClient, table: string, columns: string, workspaceId: string, bookingId: string) {
  return admin.from(table).select(columns).eq('workspace_id', workspaceId).eq('booking_id', bookingId)
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))
}

/** These are identifiers, never client-supplied authorization or fuzzy identity. */
export function parseClientWorkspaceReference(reference: string) {
  if (UUID.test(reference)) return { kind: 'client' as const, id: reference.toLowerCase() }
  if (reference.startsWith('booking:') && BOOKING_ID.test(reference.slice(8))) {
    return { kind: 'booking' as const, id: reference.slice(8).toUpperCase() }
  }
  throw new ClientWorkspaceError('A valid client or booking reference is required.', 400)
}

export function normalizeClientWorkspaceSearch(query: string) {
  const value = query.normalize('NFKC').replace(/\s+/gu, ' ').trim()
  if (value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new ClientWorkspaceError('Search with up to 120 characters.', 400)
  }
  return value
}

/** Quote PostgREST grammar and escape SQL pattern metacharacters separately. */
export function clientWorkspaceSearchFilter(columns: readonly string[], query: string) {
  const pattern = `%${query.split(' ').map(token => token.replace(/[\\%_*]/g, '\\$&')).join('%')}%`
  const quoted = `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return columns.map(column => `${column}.ilike.${quoted}`).join(',')
}

function contactHint(value: unknown): string | null {
  const email = text(value)
  if (!email || !email.includes('@')) return null
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}•••@${domain}`
}

export async function searchClientWorkspace(admin: SupabaseClient, workspaceId: string, rawQuery: string): Promise<ClientWorkspaceSearch> {
  const query = normalizeClientWorkspaceSearch(rawQuery)
  if (query.length < 2) return { query, results: [], hasMore: false }
  const [bookingResult, clientResult] = await Promise.all([
    admin.from('bookings').select(SEARCH_COLUMNS).eq('workspace_id', workspaceId)
      .or(clientWorkspaceSearchFilter(['id', 'customer_name', 'customer_email', 'customer_phone', 'package_name', 'school_name'], query))
      .order('booking_date', { ascending: false }).order('id').limit(SEARCH_LIMIT + 1)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)),
    admin.from('clients').select('id,display_name,email').eq('workspace_id', workspaceId)
      .or(clientWorkspaceSearchFilter(['display_name', 'email', 'phone'], query))
      .order('display_name').order('id').limit(SEARCH_LIMIT + 1)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)),
  ])
  const matchingBookings = rows(checked(bookingResult))
  const matchingClients = rows(checked(clientResult))
  const clientIds = matchingClients.slice(0, SEARCH_LIMIT).map(c => String(c.id)).filter(id => UUID.test(id))
  const otherBookings = clientIds.length ? rows(checked(await admin.from('bookings').select(SEARCH_COLUMNS)
    .eq('workspace_id', workspaceId).in('client_id', clientIds).order('booking_date', { ascending: false })
    .order('id').limit(SEARCH_LIMIT + 1).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)))) : []
  const byId = new Map([...matchingBookings, ...otherBookings].filter(b => String(b.workspace_id) === workspaceId).map(b => [String(b.id), b]))
  const candidates = [...byId.values()].sort((a, b) => String(b.booking_date).localeCompare(String(a.booking_date)) || String(a.id).localeCompare(String(b.id)))
  const selected = candidates.slice(0, SEARCH_LIMIT)
  const bookingIds = selected.map(b => String(b.id))
  const jobsResult = bookingIds.length ? await optionalResult(admin.from('editing_jobs').select('booking_id,status').eq('workspace_id', workspaceId)
    .in('booking_id', bookingIds).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))) : { data: [], error: null }
  // Do not suppress the search because a secondary production lookup is unavailable.
  const jobMap = new Map(rows(jobsResult.error ? [] : jobsResult.data).map(j => [String(j.booking_id), text(j.status)]))
  const clientMap = new Map(matchingClients.map(c => [String(c.id), c]))
  return {
    query,
    hasMore: candidates.length > SEARCH_LIMIT || matchingBookings.length > SEARCH_LIMIT || matchingClients.length > SEARCH_LIMIT || otherBookings.length > SEARCH_LIMIT,
    results: selected.map(b => {
      const clientId = text(b.client_id)
      const clientReference = clientId || `booking:${String(b.id)}`
      const client = clientId ? clientMap.get(clientId) : undefined
      return {
        clientId, clientReference, identitySource: clientId ? 'client' : 'booking', bookingId: String(b.id),
        name: text(client?.display_name) || text(b.customer_name) || String(b.id),
        contactHint: contactHint(client?.email || b.customer_email), packageName: text(b.package_name) || '',
        shootDate: String(b.booking_date || ''), bookingStatus: text(b.booking_status) || '', paymentStatus: text(b.payment_status) || '',
        productionStatus: jobMap.get(String(b.id)) || null,
        href: `/admin/clients/${encodeURIComponent(clientReference)}?booking=${encodeURIComponent(String(b.id))}`,
      }
    }),
  }
}

function paymentRows(value: unknown): WorkspacePayment[] {
  let parsed = value
  if (typeof value === 'string') { try { parsed = JSON.parse(value) } catch { parsed = [] } }
  return rows(parsed).map(p => ({
    id: String(p.id || ''), amount: number(p.amount), method: text(p.method) || '',
    type: text(p.payment_type ?? p.type) || '', transactionRef: text(p.transaction_ref ?? p.transactionRef),
    date: timestamp(p.created_at ?? p.date), verifiedAt: timestamp(p.verified_at), status: text(p.status) || 'confirmed',
  }))
}

function safeReceiptHref(value: unknown): string | null {
  const reference = text(value)
  return reference && /^\/api\/receipts\/[0-9a-f-]{36}$/i.test(reference) ? reference : null
}

function safeFacebookHref(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'https:' && /(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(url.hostname) ? `${url.origin}${url.pathname}` : null
  } catch { return null }
}

function bookingModel(b: Row): WorkspaceBooking {
  // Old core-schema rows may embed a receipt URL in notes. It must not reach the DTO.
  const note = text(b.note)?.split(' · ').filter(part => !/^(Receipt|TxnRef):/i.test(part)).join(' · ') || null
  const receipt = text(b.receipt_url) || text(b.note)?.split(' · ').find(part => part.startsWith('Receipt: '))?.slice(9)
  return {
    id: String(b.id), clientId: text(b.client_id), customerName: text(b.customer_name) || String(b.id),
    customerEmail: text(b.customer_email), customerPhone: text(b.customer_phone), customerFbName: text(b.customer_fb_name),
    customerFbLink: safeFacebookHref(b.customer_fb_link), packageId: String(b.package_id || ''), packageName: text(b.package_name) || '',
    selectionLimit: optionalNumber(b.selection_limit), bookingDate: String(b.booking_date || ''), bookingTime: text(b.booking_time),
    slotId: text(b.slot_id), arrivalTime: text(b.arrival_time), shootTime: text(b.shoot_time), clientPriority: optionalNumber(b.client_priority),
    isWalkIn: Boolean(b.is_walk_in), bookingStatus: text(b.booking_status) || '', paymentStatus: text(b.payment_status) || '',
    price: number(b.price), depositAmount: number(b.deposit_amount), discountAmount: number(b.discount_amount), discountLabel: text(b.discount_label),
    paymentHistory: paymentRows(b.payment_history), receiptAvailable: Boolean(receipt), receiptHref: safeReceiptHref(receipt),
    transactionRef: text(b.transaction_ref), rejectionReason: text(b.rejection_reason), note, staffNotes: text(b.staff_notes),
    schoolName: text(b.school_name), course: text(b.course), hoodColor: text(b.hood_color), togaColor: text(b.toga_color),
    tasselColor: text(b.tassel_color), backgroundColor: text(b.background_color), createdAt: timestamp(b.created_at), confirmedAt: timestamp(b.confirmed_at),
    rawPhotoStatus: text(b.raw_photo_status), rawPhotoNotes: text(b.raw_photo_notes), rawPhotoSubmittedAt: timestamp(b.raw_photo_submitted_at),
    rawPhotoApprovedAt: timestamp(b.raw_photo_approved_at), editedPhotoDeliveredAt: timestamp(b.edited_photo_delivered_at),
  }
}

export function clientWorkspaceLinks(reference: string, booking: WorkspaceBooking, batchId?: string | null): ClientWorkspaceLinks {
  const id = encodeURIComponent(booking.id)
  const batch = batchId ? encodeURIComponent(batchId) : null
  return {
    workspace: `/admin/clients/${encodeURIComponent(reference)}?booking=${id}`,
    booking: `/admin/bookings?search=${id}`,
    payment: booking.bookingStatus === 'Pending Verification' || booking.paymentStatus === 'Pending Verification'
      ? `/admin/verification?search=${id}`
      : `/admin/bookings?search=${id}&details=${id}`,
    selection: `/editor/filtering?search=${id}&tab=queue`, onsite: `/editor/onsite?date=${encodeURIComponent(booking.bookingDate)}&booking=${id}`,
    queue: `/editor/queue?search=${id}`, portalManagement: `/editor/client-portals?search=${id}`,
    portal: `/api/bookings/${id}/portal`, files: `/editor/files?date=${encodeURIComponent(booking.bookingDate)}&booking=${id}`,
    batch: batch ? `/editor/batch/${batch}` : null, upload: batch ? `/editor/upload?batch=${batch}` : null,
    retryUpload: batch ? `/editor/upload?batch=${batch}&retry=1` : null,
  }
}

export async function loadClientWorkspaceCore(admin: SupabaseClient, workspaceId: string, reference: string, requestedBooking?: string | null): Promise<ClientWorkspaceCore> {
  const parsed = parseClientWorkspaceReference(reference)
  if (requestedBooking && !BOOKING_ID.test(requestedBooking)) throw new ClientWorkspaceError('A valid booking reference is required.', 400)
  const [clientResult, bookingRows] = await Promise.all([
    parsed.kind === 'client' ? admin.from('clients').select('id,workspace_id,display_name,email,phone,created_at')
      .eq('workspace_id', workspaceId).eq('id', parsed.id).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)).maybeSingle() : Promise.resolve({ data: null, error: null }),
    readDatabasePages<Row>(() => {
      const query = admin.from('bookings').select(BOOKING_COLUMNS).eq('workspace_id', workspaceId)
        .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))
      return (parsed.kind === 'client' ? query.eq('client_id', parsed.id) : query.eq('id', parsed.id).is('client_id', null)).returns<Row[]>()
    }, { pageSize: 100, maxPages: 50 }),
  ])
  const client = row(checked(clientResult))
  if ((parsed.kind === 'client' && (!client || String(client.workspace_id) !== workspaceId)) || !bookingRows.length) {
    throw new ClientWorkspaceError('Client Workspace not found.', 404)
  }
  const validRows = bookingRows.filter(b => String(b.workspace_id) === workspaceId &&
    (parsed.kind === 'client' ? String(b.client_id) === parsed.id : String(b.id) === parsed.id && b.client_id == null))
  const bookings = validRows.map(bookingModel).sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id))
  const booking = requestedBooking ? bookings.find(b => b.id === requestedBooking.toUpperCase()) : bookings[0]
  if (!booking) throw new ClientWorkspaceError('Client Workspace not found.', 404)
  const packageSection = await settleSection<WorkspacePackage>('Package inclusions', async () => {
    const packageRow = row(checked(await admin.from('packages').select('id,category,title,description,features,duration,selection_limit')
      .eq('id', booking.packageId).abortSignal(AbortSignal.timeout(OPTIONAL_CORE_TIMEOUT_MS)).maybeSingle()))
    if (!packageRow) return empty()
    const category = text(packageRow.category) || ''
    return available({ id: String(packageRow.id), category, title: text(packageRow.title) || booking.packageName,
      description: text(packageRow.description), features: Array.isArray(packageRow.features) ? packageRow.features.filter((f): f is string => typeof f === 'string') : [],
      duration: text(packageRow.duration), selectionLimit: optionalNumber(packageRow.selection_limit),
      usesOnsiteWorkflow: usesOnsiteWorkflow(category), usesSelectionWorkflow: usesGraduationWorkflow(category) })
  })
  return {
    kind: 'core', client: {
      id: parsed.kind === 'client' ? parsed.id : null, reference: parsed.kind === 'client' ? parsed.id : `booking:${booking.id}`,
      identitySource: parsed.kind, name: text(client?.display_name) || booking.customerName,
      email: text(client?.email) || booking.customerEmail, phone: text(client?.phone) || booking.customerPhone,
      createdAt: timestamp(client?.created_at) || booking.createdAt,
    }, bookings, selectedBookingId: booking.id, booking, package: packageSection,
    links: clientWorkspaceLinks(parsed.kind === 'client' ? parsed.id : `booking:${booking.id}`, booking),
  }
}

async function paymentSection(admin: SupabaseClient, booking: WorkspaceBooking): Promise<WorkspaceSection<WorkspacePayments>> {
  const records = paymentRows(checked(await admin.from('payments').select('id,amount,method,payment_type,transaction_ref,status,created_at,verified_at')
    .eq('booking_id', booking.id).order('created_at').abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))))
  const confirmed = records.filter(p => p.status === 'confirmed')
  const fallback = !confirmed.length && ['Paid Deposit', 'Paid Full'].includes(booking.paymentStatus) ? booking.paymentHistory : []
  const amountPaid = (confirmed.length ? confirmed : fallback).reduce((sum, p) => sum + p.amount, 0)
  const receiptResult = await optionalResult(admin.from('receipt_fingerprints').select('id,created_at').eq('booking_id', booking.id)
    .order('created_at', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)))
  const receiptId = text(rows(receiptResult.error ? [] : receiptResult.data)[0]?.id)
  const data: WorkspacePayments = {
    source: confirmed.length ? 'payments' : fallback.length ? 'booking-history' : 'none',
    packageTotal: booking.price, amountPaid, packageBalance: Math.max(0, booking.price - amountPaid),
    paymentStatus: booking.paymentStatus, records: records.length ? records : fallback,
    receiptAvailable: booking.receiptAvailable || Boolean(receiptId),
    receiptHref: receiptId && UUID.test(receiptId) ? `/api/receipts/${encodeURIComponent(receiptId)}` : booking.receiptHref,
    receiptSubmittedAt: receiptResult.error ? null : timestamp(rows(receiptResult.data)[0]?.created_at),
  }
  return receiptResult.error ? partial(data, 'Payment totals loaded; the receipt link could not be checked.') : available(data)
}

async function storageSection(admin: SupabaseClient, workspaceId: string, bookingId: string): Promise<WorkspaceSection<WorkspaceStorage>> {
  const value = row(checked(await scoped(admin, 'booking_provisioning', 'status,storage_provider,storage_status,provisioned_at,last_retry_at,last_error', workspaceId, bookingId).maybeSingle()))
  return value ? available({ provisioningStatus: text(value.status) || '', provider: text(value.storage_provider), status: text(value.storage_status),
    provisionedAt: timestamp(value.provisioned_at), lastRetryAt: timestamp(value.last_retry_at), hasError: Boolean(text(value.last_error)) }) : empty()
}

async function galleryNames(admin: SupabaseClient, workspaceId: string, bookingId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const uniqueIds = [...new Set(ids)]
  const names = new Map<string, string>()
  for (let offset = 0; offset < uniqueIds.length; offset += 200) {
    const data = rows(checked(await scoped(admin, 'gallery_files', 'id,file_name', workspaceId, bookingId).in('id', uniqueIds.slice(offset, offset + 200))))
    for (const file of data) names.set(String(file.id), String(file.file_name || ''))
  }
  return names
}

async function selectionSection(admin: SupabaseClient, workspaceId: string, booking: WorkspaceBooking, value: Row | null): Promise<WorkspaceSection<WorkspaceSelection>> {
  if (!value) return empty()
  const data: WorkspaceSelection = {
    status: text(value.status) || '', clientStatus: text(value.client_status) || '', reviewStatus: booking.rawPhotoStatus,
    requiredCount: number(value.required_count), includedLimit: number(value.included_limit ?? value.required_count),
    selectedCount: null, extraEditCount: null, submittedAt: timestamp(value.submitted_at), reopenedAt: timestamp(value.reopened_at),
    approvedAt: booking.rawPhotoApprovedAt, noRevisionAcknowledged: Boolean(value.no_revision_acknowledged),
    totalAddonAmount: number(value.total_addon_amount), resetInProgress: Boolean(value.raw_reset_id), photos: null,
  }
  const items = rows(checked(await admin.from('photo_selection_items').select('gallery_file_id,enhancement_preference,is_extra_edit')
    .eq('selection_id', String(value.id)).order('gallery_file_id').limit(1000).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))))
  data.selectedCount = items.length
  data.extraEditCount = items.filter(i => Boolean(i.is_extra_edit)).length
  let nameMap: Map<string, string>
  try { nameMap = await galleryNames(admin, workspaceId, booking.id, items.map(i => String(i.gallery_file_id))) }
  catch { data.photos = items.map(i => ({ id: String(i.gallery_file_id), fileName: null, preference: text(i.enhancement_preference) || 'standard', extraEdit: Boolean(i.is_extra_edit) })); return partial(data, 'Selection state loaded; photo names are unavailable.') }
  data.photos = items.map((i): WorkspaceSelectedPhoto => ({ id: String(i.gallery_file_id), fileName: nameMap.get(String(i.gallery_file_id)) || null,
    preference: text(i.enhancement_preference) || 'standard', extraEdit: Boolean(i.is_extra_edit) }))
  return available(data)
}

async function printSection(admin: SupabaseClient, workspaceId: string, bookingId: string, selection: Row | null): Promise<WorkspaceSection<WorkspacePrint[]>> {
  if (!selection) return empty()
  const allocations = rows(checked(await scoped(admin, 'print_allocations', 'category,label_snapshot,quantity,gallery_file_id,storage_status', workspaceId, bookingId)
    .eq('selection_id', String(selection.id)).order('category')))
  if (!allocations.length) return empty()
  let names: Map<string, string>
  try { names = await galleryNames(admin, workspaceId, bookingId, allocations.map(a => String(a.gallery_file_id))) } catch { names = new Map() }
  const data = allocations.map(a => ({ category: String(a.category), label: text(a.label_snapshot) || String(a.category), quantity: number(a.quantity),
    fileId: String(a.gallery_file_id), fileName: names.get(String(a.gallery_file_id)) || null, storageStatus: text(a.storage_status) }))
  return data.some(p => p.fileName == null) ? partial(data, 'Print assignments loaded; some photo names are unavailable.') : available(data)
}

async function addonSection(admin: SupabaseClient, workspaceId: string, bookingId: string, selection: Row | null): Promise<WorkspaceSection<WorkspaceAddon[]>> {
  if (!selection) return empty()
  const orders = rows(checked(await scoped(admin, 'client_addon_orders', 'name_snapshot,description_snapshot,pricing_type_snapshot,unit_price_snapshot,quantity,photo_count,photo_ids,total_amount', workspaceId, bookingId)
    .eq('selection_id', String(selection.id)).order('created_at')))
  if (!orders.length) return empty()
  const ids = orders.flatMap(o => Array.isArray(o.photo_ids) ? o.photo_ids.map(String) : [])
  let names: Map<string, string>
  try { names = await galleryNames(admin, workspaceId, bookingId, ids) } catch { names = new Map() }
  const data = orders.map(o => ({ name: text(o.name_snapshot) || '', description: text(o.description_snapshot), pricingType: text(o.pricing_type_snapshot) || '',
    unitPrice: number(o.unit_price_snapshot), quantity: number(o.quantity), photoCount: number(o.photo_count), total: number(o.total_amount),
    photos: (Array.isArray(o.photo_ids) ? o.photo_ids.map(String) : []).map(id => ({ id, fileName: names.get(id) || null })) }))
  return data.some(o => o.photos.some(p => p.fileName == null)) ? partial(data, 'Add-on orders loaded; some assigned photo names are unavailable.') : available(data)
}

async function productionSection(admin: SupabaseClient, workspaceId: string, bookingId: string): Promise<WorkspaceSection<WorkspaceProduction>> {
  const job = row(checked(await scoped(admin, 'editing_jobs', 'id,batch_id,status,selected_count,expected_output_count,assigned_editor_name,photographer_name,downloaded_at,editing_started_at,ready_to_upload_at,delivered_at,updated_at,last_error', workspaceId, bookingId).maybeSingle()))
  if (!job) return empty()
  const [batchResult, uploadsResult] = await Promise.all([
    optionalResult(admin.from('editing_batches').select('id,display_id,status,shoot_date,location_key,created_at').eq('workspace_id', workspaceId)
      .eq('id', String(job.batch_id)).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)).maybeSingle()),
    optionalResult(admin.from('batch_upload_items').select('id,upload_job_id,status,expected_files,uploaded_files,attempt_count,updated_at,last_error')
      .eq('booking_id', bookingId).eq('editing_job_id', String(job.id)).order('updated_at', { ascending: false }).limit(30)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))),
  ])
  const batch = row(batchResult.error ? null : batchResult.data)
  const uploads = uploadsResult.error ? null : rows(uploadsResult.data)
  // Upload children have no workspace column; both the booking and editing job are already scoped above.
  let failed: Row[] | null = []
  try {
    if (uploads?.length) failed = await readDatabasePages<Row>(() => admin.from('batch_upload_files').select('id,upload_item_id')
      .in('upload_item_id', uploads.map(u => String(u.id))).eq('status', 'FAILED')
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)).returns<Row[]>(), { pageSize: 500, maxPages: 20 })
  } catch { failed = null }
  const data: WorkspaceProduction = {
    jobId: String(job.id), status: text(job.status) || '', selectedCount: number(job.selected_count), expectedOutputCount: number(job.expected_output_count),
    assignedEditorName: text(job.assigned_editor_name), photographerName: text(job.photographer_name), downloadedAt: timestamp(job.downloaded_at),
    editingStartedAt: timestamp(job.editing_started_at), readyToUploadAt: timestamp(job.ready_to_upload_at), deliveredAt: timestamp(job.delivered_at),
    updatedAt: timestamp(job.updated_at), hasError: Boolean(text(job.last_error)),
    batch: batch ? { id: String(batch.display_id), status: String(batch.status), shootDate: String(batch.shoot_date), location: String(batch.location_key), createdAt: timestamp(batch.created_at) } : null,
    uploads: uploads?.map(u => ({ id: String(u.id), status: String(u.status), expectedFiles: number(u.expected_files), uploadedFiles: number(u.uploaded_files),
      attemptCount: number(u.attempt_count), failedFiles: failed ? failed.filter(f => String(f.upload_item_id) === String(u.id)).length : null,
      updatedAt: timestamp(u.updated_at), hasError: Boolean(text(u.last_error)) })) ?? null,
  }
  return batchResult.error || uploadsResult.error || failed === null ? partial(data, 'Editing status loaded; some batch or upload details are unavailable.') : available(data)
}

async function portalSection(admin: SupabaseClient, workspaceId: string, bookingId: string): Promise<WorkspaceSection<WorkspacePortal>> {
  const portal = row(checked(await scoped(admin, 'client_portals', 'status,created_at,last_accessed_at,access_email_sent_at,deliverables_uploaded_at,first_download_at,expires_at,download_expiry_days', workspaceId, bookingId).maybeSingle()))
  if (!portal) return empty()
  const [requestsResult, completedResult, latestResult] = await Promise.all([
    optionalResult(admin.from('portal_raw_download_requests').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('status', 'PENDING').abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))),
    optionalResult(admin.from('portal_raw_download_attempts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('status', 'COMPLETED').abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))),
    optionalResult(scoped(admin, 'portal_raw_download_requests', 'requested_at', workspaceId, bookingId).order('requested_at', { ascending: false }).limit(1)),
  ])
  const expired = hasPortalExpired(text(portal.expires_at))
  const data: WorkspacePortal = {
    status: expired ? 'expired' : text(portal.status) || '', expired, createdAt: timestamp(portal.created_at), lastAccessedAt: timestamp(portal.last_accessed_at),
    accessEmailSentAt: timestamp(portal.access_email_sent_at), deliverablesUploadedAt: timestamp(portal.deliverables_uploaded_at), firstDownloadAt: timestamp(portal.first_download_at),
    expiresAt: timestamp(portal.expires_at), downloadExpiryDays: optionalNumber(portal.download_expiry_days),
    pendingDownloadRequests: requestsResult.error ? null : optionalNumber(requestsResult.count),
    completedOriginalDownloads: completedResult.error ? null : optionalNumber(completedResult.count),
    latestDownloadRequestAt: latestResult.error ? null : timestamp(rows(latestResult.data)[0]?.requested_at),
  }
  return requestsResult.error || completedResult.error || latestResult.error ? partial(data, 'Portal state loaded; download activity is unavailable.') : available(data)
}

async function fileGroup(admin: SupabaseClient, workspaceId: string, bookingId: string, table: 'gallery_files' | 'deliverable_files') {
  const column = table === 'gallery_files' ? 'created_at' : 'published_at'
  const [availableResult, failedResult, uploadingResult, recentResult, latestResult] = await Promise.all([
    optionalResult(admin.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_status', 'available').abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))),
    optionalResult(admin.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_status', 'failed').abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))),
    table === 'gallery_files' ? optionalResult(admin.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_status', 'uploading').abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))) : Promise.resolve({ count: null, error: null }),
    optionalResult(scoped(admin, table, `id,file_name,file_size,storage_status,${column}`, workspaceId, bookingId).neq('storage_status', 'deleted').order(column, { ascending: false }).limit(20)),
    optionalResult(scoped(admin, table, column, workspaceId, bookingId).eq('storage_status', 'available').order(column, { ascending: false }).limit(1)),
  ])
  return { count: availableResult.error ? null : optionalNumber(availableResult.count), failedCount: failedResult.error ? null : optionalNumber(failedResult.count),
    uploadingCount: uploadingResult.error ? null : optionalNumber(uploadingResult.count),
    files: rows(recentResult.error ? [] : recentResult.data).map((f): WorkspaceFile => ({ id: String(f.id), fileName: String(f.file_name || ''),
      size: optionalNumber(f.file_size), status: text(f.storage_status) || '', timestamp: timestamp(f[column]), kind: table === 'gallery_files' ? 'raw' : 'enhanced' })),
    lastUploadAt: latestResult.error ? null : timestamp(rows(latestResult.data)[0]?.[column]),
    hasError: Boolean(availableResult.error || failedResult.error || uploadingResult.error || recentResult.error || latestResult.error) }
}

async function filesSection(admin: SupabaseClient, workspaceId: string, bookingId: string): Promise<WorkspaceSection<WorkspaceFiles>> {
  const [raw, enhanced] = await Promise.allSettled([fileGroup(admin, workspaceId, bookingId, 'gallery_files'), fileGroup(admin, workspaceId, bookingId, 'deliverable_files')])
  const a = raw.status === 'fulfilled' ? raw.value : null
  const b = enhanced.status === 'fulfilled' ? enhanced.value : null
  if (!a && !b) return unavailable('Files')
  const data: WorkspaceFiles = { rawCount: a?.count ?? null, rawFailedCount: a?.failedCount ?? null, rawUploadingCount: a?.uploadingCount ?? null,
    enhancedCount: b?.count ?? null, enhancedFailedCount: b?.failedCount ?? null,
    lastRawUploadAt: a?.lastUploadAt || null,
    lastEnhancedUploadAt: b?.lastUploadAt || null,
    recentFiles: [...(a?.files || []), ...(b?.files || [])].sort((x, y) => (y.timestamp || '').localeCompare(x.timestamp || '')) }
  return !a || !b || a.hasError || b.hasError ? partial(data, 'Some file counts or names are unavailable. Known files are shown.') : available(data)
}

const ACTIVITY_LABELS: Record<string, string> = {
  RAW_FILE_UPLOADED: 'Original photograph uploaded', RAW_FILES_REFRESHED: 'Original gallery refreshed',
  RAW_UPLOADED: 'Original photograph uploaded', RAW_UPLOAD_VERIFIED: 'Original photograph upload verified', GALLERY_INDEXED: 'Original gallery refreshed',
  SELECTION_SUBMITTED: 'Client submitted photo selections', SELECTION_APPROVED: 'Selections approved',
  SELECTION_REJECTED: 'Selections returned to the client', SELECTION_REOPENED: 'Selections reopened',
  EDITING_JOB_STATUS_CHANGED: 'Editing progress updated', EDITING_JOB_ASSIGNED: 'Editor assigned',
  BATCH_DOWNLOADED: 'Editing batch downloaded', BATCH_UPLOAD_STARTED: 'Enhanced upload started',
  UPLOAD_FAILED: 'Enhanced upload needs attention', UPLOAD_CHECKSUM_FAILED: 'Upload verification failed',
  PRINT_PREPARATION_FAILED: 'Print preparation needs attention', DELIVERY_COMPLETED: 'Final photographs released',
  EDITING_STARTED: 'Editing started', JOB_STATUS_DOWNLOADED: 'Selected photographs downloaded for editing',
  JOB_REASSIGNED: 'Editor assignment updated',
  JOB_STATUS_READY_TO_UPLOAD: 'Editing ready for enhanced upload', JOB_STATUS_UPLOAD_FAILED: 'Enhanced upload needs attention',
  SELECTED_FILES_VALIDATED: 'Selected photographs checked for production', SELECTION_VALIDATION_FAILED: 'Submitted selection needs attention',
  booking_confirmed: 'Booking confirmed', provisioning_started: 'Photo storage preparation started', provisioning_retried: 'Photo storage preparation retried',
  storage_namespace_prepared: 'Private photo storage prepared', storage_namespace_reconciled: 'Private photo storage checked',
  storage_initialization_failed: 'Private photo storage needs attention', storage_ready_for_onsite_upload: 'Private photo storage ready for upload',
  payment_confirmed: 'Payment verified', portal_disabled: 'Client Portal disabled', portal_enabled: 'Client Portal enabled',
  portal_expiry_started_by_delivery: 'Portal access period started with final delivery',
}

async function activitySection(admin: SupabaseClient, workspaceId: string, core: ClientWorkspaceCore, context: {
  payments: WorkspaceSection<WorkspacePayments>; selection: WorkspaceSection<WorkspaceSelection>; production: WorkspaceSection<WorkspaceProduction>; portal: WorkspaceSection<WorkspacePortal>; files: WorkspaceSection<WorkspaceFiles>
}): Promise<WorkspaceSection<WorkspaceActivity[]>> {
  const booking = core.booking
  const events: WorkspaceActivity[] = []
  const add = (id: string, at: string | null, label: string, source: WorkspaceActivity['source']) => { if (at) events.push({ id, timestamp: at, label, source }) }
  add('booking-created', booking.createdAt, 'Booking created', 'booking')
  add('booking-confirmed', booking.confirmedAt, 'Booking confirmed', 'booking')
  add('receipt-submitted', context.payments.data?.receiptSubmittedAt || null, 'Payment receipt submitted', 'payment')
  add('raw-uploaded', context.files.data?.lastRawUploadAt || null, 'Original photographs last uploaded', 'production')
  add('enhanced-uploaded', context.files.data?.lastEnhancedUploadAt || null, 'Enhanced photographs last uploaded', 'production')
  add('selection-submitted', booking.rawPhotoSubmittedAt || context.selection.data?.submittedAt || null, 'Client submitted photo selections', 'selection')
  add('selection-approved', booking.rawPhotoApprovedAt, 'Selections approved', 'selection')
  add('selection-reopened', context.selection.data?.reopenedAt || null, 'Selections reopened', 'selection')
  add('delivery-completed', booking.editedPhotoDeliveredAt || context.production.data?.deliveredAt || null, 'Final photographs released', 'production')
  add('editing-downloaded', context.production.data?.downloadedAt || null, 'Selected photographs downloaded for editing', 'production')
  add('batch-created', context.production.data?.batch?.createdAt || null, 'Editing batch created', 'production')
  add('editing-started', context.production.data?.editingStartedAt || null, 'Editing started', 'production')
  add('editing-ready-upload', context.production.data?.readyToUploadAt || null, 'Editing ready for enhanced upload', 'production')
  add('portal-created', context.portal.data?.createdAt || null, 'Client Portal created', 'portal')
  add('portal-email', context.portal.data?.accessEmailSentAt || null, 'Portal-ready email sent', 'portal')
  add('portal-first-download', context.portal.data?.firstDownloadAt || null, 'First original-photo download recorded', 'portal')
  for (const payment of context.payments.data?.records || []) add(`payment-${payment.id}`, payment.verifiedAt || payment.date, payment.status === 'confirmed' ? 'Payment verified' : 'Payment recorded', 'payment')
  const [workflowResult, provisioningResult, emailResult] = await Promise.allSettled([
    scoped(admin, 'workflow_audit_logs', 'id,action,created_at', workspaceId, booking.id).order('created_at', { ascending: false }).limit(60),
    scoped(admin, 'provisioning_audit', 'id,action,created_at', workspaceId, booking.id).order('created_at', { ascending: false }).limit(40),
    admin.from('email_logs').select('id,status,sent_at').eq('booking_id', booking.id).order('sent_at', { ascending: false }).limit(20).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)),
  ])
  let failed = false
  for (const [result, source] of [[workflowResult, 'workflow'], [provisioningResult, 'workflow'], [emailResult, 'email']] as const) {
    if (result.status === 'rejected' || result.value.error) { failed = true; continue }
    for (const event of rows(result.value.data)) {
      const label = source === 'email' ? String(event.status).toUpperCase() === 'SENT' ? 'Client email sent' : 'Client email needs attention' : ACTIVITY_LABELS[String(event.action)]
      if (label) add(`${source}-${String(event.id)}-${String(event.action || '')}`, timestamp(event.created_at || event.sent_at), label, source)
    }
  }
  const unique = [...new Map(events.map(e => [`${e.timestamp}:${e.label}`, e])).values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100)
  return failed ? partial(unique, 'Known lifecycle events are shown; some activity history is unavailable.') : unique.length ? available(unique) : empty()
}

/** Reads only scoped database metadata; never synchronizes, provisions, or opens photos. */
export async function loadClientWorkspaceDetails(admin: SupabaseClient, workspaceId: string, core: ClientWorkspaceCore): Promise<ClientWorkspaceDetails> {
  const bookingId = core.booking.id
  const selectionRead = scoped(admin, 'photo_selections', 'id,status,client_status,required_count,included_limit,submitted_at,reopened_at,no_revision_acknowledged,total_addon_amount,raw_reset_id', workspaceId, bookingId)
    .maybeSingle().then(result => row(checked(result)))
  // Attach rejection handlers immediately; optional sources cannot produce an unhandled rejection.
  const selection = settleSection('Selections', async () => selectionSection(admin, workspaceId, core.booking, await selectionRead))
  const prints = settleSection('Print assignments', async () => printSection(admin, workspaceId, bookingId, await selectionRead))
  const addons = settleSection('Add-ons', async () => addonSection(admin, workspaceId, bookingId, await selectionRead))
  const [payments, storage, selectionData, printData, addonData, production, portal, files] = await Promise.all([
    settleSection('Payments', () => paymentSection(admin, core.booking)),
    settleSection('Storage', () => storageSection(admin, workspaceId, bookingId)), selection, prints, addons,
    settleSection('Production', () => productionSection(admin, workspaceId, bookingId)),
    settleSection('Client Portal', () => portalSection(admin, workspaceId, bookingId)),
    settleSection('Files', () => filesSection(admin, workspaceId, bookingId)),
  ])
  const activity = await settleSection('Activity', () => activitySection(admin, workspaceId, core, { payments, selection: selectionData, production, portal, files }))
  return { kind: 'details', bookingId, links: clientWorkspaceLinks(core.client.reference, core.booking, production.data?.batch?.id),
    sections: { payments, storage, selection: selectionData, prints: printData, addons: addonData, production, portal, files, activity } }
}

/** A bounded operations feed. It reads existing markers and never loads whole workspaces or per-client cores. */
export async function loadClientWorkspaceAttention(admin: SupabaseClient, workspaceId: string): Promise<ClientWorkspaceAttention> {
  const perSourceLimit = 25
  const queries = [
    { label: 'Storage setup', query: admin.from('booking_provisioning').select('booking_id,status,storage_status', { count: 'exact' })
      .eq('workspace_id', workspaceId).or('status.in.(FAILED,PARTIAL_FAILURE),storage_status.eq.error')
      .order('updated_at', { ascending: false }).limit(perSourceLimit).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)) },
    { label: 'Production', query: admin.from('editing_jobs').select('booking_id,status', { count: 'exact' })
      .eq('workspace_id', workspaceId).in('status', ['UPLOAD_FAILED', 'READY_FOR_EDITING', 'READY_TO_UPLOAD'])
      .order('updated_at', { ascending: false }).limit(perSourceLimit).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)) },
    { label: 'Submitted selections', query: admin.from('photo_selections').select('booking_id,status', { count: 'exact' })
      .eq('workspace_id', workspaceId).in('status', ['SUBMITTED', 'COPY_FAILED'])
      .order('updated_at', { ascending: false }).limit(perSourceLimit).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)) },
    { label: 'Download requests', query: admin.from('portal_raw_download_requests').select('booking_id,status', { count: 'exact' })
      .eq('workspace_id', workspaceId).eq('status', 'PENDING').order('requested_at', { ascending: false })
      .limit(perSourceLimit).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)) },
  ]
  const results = await Promise.all(queries.map(async source => ({ label: source.label, result: await optionalResult(source.query) })))
  const unavailableSources = results.filter(source => source.result.error).map(source => source.label)
  const sourceRows = results.map(source => rows(source.result.error ? [] : source.result.data))
  const bookingIds = [...new Set(sourceRows.flat().map(value => String(value.booking_id)).filter(id => BOOKING_ID.test(id)))]
  let truncated = results.some(source => source.result.count != null && source.result.count > perSourceLimit)
  if (!bookingIds.length) return { items: [], truncated, unavailableSources }
  const bookingsResult = await optionalResult(admin.from('bookings')
    .select('id,client_id,customer_name,booking_date,booking_status,payment_status,raw_photo_status,edited_photo_delivered_at,package_id')
    .eq('workspace_id', workspaceId).in('id', bookingIds).limit(100).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)))
  if (bookingsResult.error) return { items: [], truncated, unavailableSources: [...unavailableSources, 'Client context'] }
  const bookings = rows(bookingsResult.data)
  const authorizedIds = bookings.map(booking => String(booking.id))
  if (!authorizedIds.length) return { items: [], truncated, unavailableSources }
  // Supplemental markers are bounded by the already-authorized candidate set.
  const [jobsResult, packagesResult] = await Promise.all([
    optionalResult(admin.from('editing_jobs').select('booking_id,status').eq('workspace_id', workspaceId)
      .in('booking_id', authorizedIds).limit(100).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))),
    optionalResult(admin.from('packages').select('id,category').in('id', [...new Set(bookings.map(booking => String(booking.package_id)))])
      .limit(100).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))),
  ])
  if (jobsResult.error) unavailableSources.push('Current editing status')
  if (packagesResult.error) unavailableSources.push('Package workflow')
  const jobs = new Map([...sourceRows[1], ...rows(jobsResult.error ? [] : jobsResult.data)].map(value => [String(value.booking_id), String(value.status)]))
  const selections = new Map(sourceRows[2].map(value => [String(value.booking_id), String(value.status)]))
  const storageFailures = new Set(sourceRows[0].map(value => String(value.booking_id)))
  const pendingDownloads = new Set(sourceRows[3].map(value => String(value.booking_id)))
  const packages = new Map(rows(packagesResult.error ? [] : packagesResult.data).map(value => [String(value.id), String(value.category)]))
  const items: ClientWorkspaceAttention['items'] = []
  for (const booking of bookings) {
    const bookingId = String(booking.id)
    if (['Cancelled', 'Rejected', 'No Show', 'Archived'].includes(String(booking.booking_status))) continue
    const category = packages.get(String(booking.package_id))
    const action = deriveWorkflowNextAction({
      bookingStatus: String(booking.booking_status), paymentStatus: String(booking.payment_status),
      rawStatus: text(booking.raw_photo_status), reviewStatus: text(booking.raw_photo_status),
      selectionStatus: selections.get(bookingId), productionStatus: jobs.get(bookingId),
      storageFailed: storageFailures.has(bookingId), uploadFailed: jobs.get(bookingId) === 'UPLOAD_FAILED',
      pendingDownloadRequests: pendingDownloads.has(bookingId) ? 1 : undefined,
      delivered: Boolean(timestamp(booking.edited_photo_delivered_at)) || jobs.get(bookingId) === 'DELIVERED',
      usesSelectionWorkflow: category ? usesGraduationWorkflow(category) : null,
      detailsUnavailable: jobsResult.error != null,
    })
    if (action.owner === 'none' || action.owner === 'client' || action.priority > 2) continue
    const clientId = text(booking.client_id)
    const reference = clientId || `booking:${bookingId}`
    items.push({ bookingId, clientId, name: text(booking.customer_name) || bookingId, shootDate: String(booking.booking_date || ''),
      actionId: action.id, label: action.label, explanation: action.explanation,
      href: `/admin/clients/${encodeURIComponent(reference)}?booking=${encodeURIComponent(bookingId)}`, priority: action.priority })
  }
  items.sort((a, b) => a.priority - b.priority || a.shootDate.localeCompare(b.shootDate) || a.name.localeCompare(b.name))
  truncated ||= items.length > 25
  return { items: items.slice(0, 25), truncated, unavailableSources: [...new Set(unavailableSources)] }
}
