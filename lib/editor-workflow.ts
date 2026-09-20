import { createHash, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { portalUrl } from '@/lib/client-portal'
import { hasPortalExpired } from '@/lib/portal-expiry'
import { sendEditedPhotosEmail } from '@/lib/email'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { validateEditedPhotoMetadata } from '@/lib/security/file-validation'
import { safeMetadata } from '@/lib/security/audit-metadata'
import { assertGraduationBooking, graduationBookingIds, graduationPackageIds } from '@/lib/package-workflow-server'
import { GraduationWorkflowOnlyError } from '@/lib/package-workflow'
import { buildPrintManifest, type PrintManifest } from '@/lib/print-manifest'
import { fulfillBookingPrints } from '@/lib/print-workflow'
import { PortalSelectionError, resolvePortalSelectionSources } from '@/lib/portal-selection-source'
export { PortalSelectionError } from '@/lib/portal-selection-source'
import { rawUploadGeneration } from '@/lib/raw-upload-generation'
import { addonPhotoError } from '@/lib/addon-photo-rules'
import { enhancedUploadName } from '@/lib/enhanced-upload-naming'
import { prepareBookingStorage } from '@/lib/storage/booking-storage'
import {
  getObjectMetadata,
  hashObjectSha256,
  objectExists,
  readObject,
  uploadObject,
} from '@/lib/storage/storage-service'
import {
  assertStorageKeyOwnership,
  createDerivativeKey,
  createStorageKey,
  createStorageObjectId,
} from '@/lib/storage/storage-keys'
import { createDownloadUrl, createUploadUrl } from '@/lib/storage/presigned-urls'
import { hasSameFolderFilePath } from '@/lib/storage/file-name-policy'
import { getPortalRawDownloadAccess } from '@/lib/portal-raw-downloads'
import {
  MULTIPART_PART_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  completeMultipartUpload,
  createMultipartPartUrl,
  createMultipartUpload,
} from '@/lib/storage/multipart-upload'

export type EditingJobStatus =
  | 'WAITING_FOR_SELECTION'
  | 'READY_FOR_EDITING'
  | 'DOWNLOADED'
  | 'EDITING'
  | 'READY_TO_UPLOAD'
  | 'UPLOADING'
  | 'DELIVERED'
  | 'UPLOAD_FAILED'

export type DownloadScope = 'day' | 'week' | 'month'

type Actor = { type: 'client' | 'staff' | 'system'; id?: string | null }
type UploadFileInput = {
  bookingId: string
  relativePath: string
  fileName: string
  mimeType: string
  fileSize: number
  checksum: string
}

export type PortalSelectionInput = {
  pin: string
  fileIds: string[]
  includedFileIds?: string[]
  extraEditFileIds?: string[]
  preferences?: Array<{ fileId: string; preference: 'standard' | 'less' | 'raw' }>
  printAllocations?: Array<{ category: 'TOGA_PICTURE_4R' | 'ALAMPAY_BARONG_4R' | 'FRAME_8R' | 'WALLET_SIZE'; fileId: string; quantity: number }>
  addons?: Array<{ addonId: string; quantity: number; photoCount: number; photoIds?: string[] }>
  acknowledgeNoRevision?: boolean
}

const ACTIVE_BOOKING_EXCLUSIONS = new Set(['Cancelled', 'Rejected', 'Archived'])
const MAX_PORTAL_PAGE_SIZE = 80
const PRINT_CATEGORY_LIMITS = {
  TOGA_PICTURE_4R: 1,
  ALAMPAY_BARONG_4R: 1,
  FRAME_8R: 1,
  WALLET_SIZE: 4,
} as const
const PRINT_CATEGORY_LABELS = {
  TOGA_PICTURE_4R: 'TOGA PICTURE - 4R',
  ALAMPAY_BARONG_4R: 'ALAMPAY BARONG - 4R',
  FRAME_8R: 'FRAME - 8R',
  WALLET_SIZE: 'WALLET SIZE',
} as const

function adminClient() {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable. Try: refresh the page, or contact your administrator.')
  return admin
}

function nowIso() {
  return new Date().toISOString()
}

function sha256(data: Buffer) {
  return createHash('sha256').update(data).digest('hex')
}

function safeSegment(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function safeRelativePath(value: string) {
  const raw = value.normalize('NFKC')
  if (!raw || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(raw)) {
    throw new Error('The relative file path contains unsafe characters.')
  }
  if (/^(?:[a-z]:[\\/]|[\\/]{1,2})/i.test(raw) || /%(?:00|2e|2f|5c)/i.test(raw)) {
    throw new Error('Absolute or encoded traversal paths are not allowed.')
  }
  const parts = raw.replace(/\\/g, '/').split('/')
  if (!parts.length || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('A valid relative file path is required.')
  }
  const sanitized = parts.map(safeSegment)
  if (sanitized.some((part) => !part)) throw new Error('The relative file path contains an invalid segment.')
  const result = sanitized.join('/')
  if (result.length > 500) throw new Error('The relative file path is too long.')
  return result
}

function batchCounts(jobs: Array<{ status: EditingJobStatus }>) {
  return {
    waitingForSelection: jobs.filter((job) => job.status === 'WAITING_FOR_SELECTION').length,
    readyForEditing: jobs.filter((job) => job.status === 'READY_FOR_EDITING').length,
    downloaded: jobs.filter((job) => job.status === 'DOWNLOADED').length,
    editing: jobs.filter((job) => job.status === 'EDITING').length,
    readyToUpload: jobs.filter((job) => job.status === 'READY_TO_UPLOAD').length,
    uploading: jobs.filter((job) => job.status === 'UPLOADING').length,
    delivered: jobs.filter((job) => job.status === 'DELIVERED').length,
    failed: jobs.filter((job) => job.status === 'UPLOAD_FAILED').length,
  }
}

function deriveBatchStatus(jobs: Array<{ status: EditingJobStatus }>) {
  if (jobs.length > 0 && jobs.every((job) => job.status === 'DELIVERED')) return 'COMPLETED'
  const delivered = jobs.some((job) => job.status === 'DELIVERED')
  const failed = jobs.some((job) => job.status === 'UPLOAD_FAILED')
  if (delivered || failed) return 'PARTIALLY_COMPLETED'
  if (jobs.some((job) => !['WAITING_FOR_SELECTION', 'READY_FOR_EDITING'].includes(job.status))) return 'IN_PROGRESS'
  if (jobs.some((job) => job.status === 'READY_FOR_EDITING')) return 'READY'
  return 'WAITING'
}

async function audit(
  admin: SupabaseClient,
  workspaceId: string,
  actor: Actor,
  action: string,
  input: { bookingId?: string | null; batchId?: string | null; metadata?: Record<string, unknown> } = {},
) {
  const { error } = await admin.from('workflow_audit_logs').insert({
    workspace_id: workspaceId,
    actor_type: actor.type,
    actor_id: actor.id || null,
    action,
    booking_id: input.bookingId || null,
    batch_id: input.batchId || null,
    metadata: safeMetadata(input.metadata),
  })
  if (error) console.error('Workflow audit write failed:', error.message)
}

async function loadActiveBookings(admin: SupabaseClient, workspaceId: string) {
  const eligiblePackageIds = await graduationPackageIds(admin)
  if (!eligiblePackageIds.length) return []
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin
      .from('bookings')
      .select(
        'id,workspace_id,client_id,customer_name,customer_email,package_id,package_name,booking_date,booking_time,booking_status,payment_status,price,deposit_amount,selection_limit,raw_photo_status,raw_photo_submitted_at,raw_photo_approved_at,edited_photo_delivered_at',
      )
      .eq('workspace_id', workspaceId)
      .in('package_id', eligiblePackageIds)
      .order('booking_date', { ascending: false })
      .range(offset, offset + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data || []) as Record<string, unknown>[]))
    if (!data || data.length < 1000) break
  }
  return rows.filter((booking) => !ACTIVE_BOOKING_EXCLUSIONS.has(String(booking.booking_status || '')))
}

export async function syncEditorWorkflow(workspaceId: string) {
  const admin = adminClient()
  const bookings = await loadActiveBookings(admin, workspaceId)
  const { data: existingBatches, error: batchReadError } = await admin
    .from('editing_batches')
    .select('id,shoot_date,location_key,batch_sequence,display_id')
    .eq('workspace_id', workspaceId)
  if (batchReadError) throw new Error(batchReadError.message)
  const batchByDate = new Map((existingBatches || []).map((batch) => [String(batch.shoot_date), batch]))
  const missingDates = [...new Set(bookings.map((booking) => String(booking.booking_date)))].filter(
    (date) => date && !batchByDate.has(date),
  )
  if (missingDates.length) {
    const { error } = await admin.from('editing_batches').insert(
      missingDates.map((shootDate) => ({
        workspace_id: workspaceId,
        display_id: `FM-BATCH-${shootDate}-MAIN`,
        shoot_date: shootDate,
        location_key: 'MAIN',
        batch_sequence: 1,
      })),
    )
    if (error) throw new Error(error.message)
  }

  const { data: batches, error: batchesError } = await admin
    .from('editing_batches')
    .select('id,shoot_date')
    .eq('workspace_id', workspaceId)
  if (batchesError) throw new Error(batchesError.message)
  const liveBatchByDate = new Map((batches || []).map((batch) => [String(batch.shoot_date), String(batch.id)]))
  const [{ data: selections }, { data: jobs }, { data: uploadedFiles, error: uploadedFilesError }] = await Promise.all([
    admin.from('photo_selections').select('booking_id').eq('workspace_id', workspaceId),
    admin.from('editing_jobs').select('booking_id').eq('workspace_id', workspaceId),
    admin.from('gallery_files').select('booking_id').eq('workspace_id', workspaceId).eq('storage_status', 'available'),
  ])
  if (uploadedFilesError) throw new Error(uploadedFilesError.message)
  const selectionBookings = new Set((selections || []).map((row) => String(row.booking_id)))
  const jobBookings = new Set((jobs || []).map((row) => String(row.booking_id)))
  const uploadedBookingIds = new Set((uploadedFiles || []).map((row) => String(row.booking_id)))

  const missingSelections = bookings.filter((booking) =>
    uploadedBookingIds.has(String(booking.id)) && !selectionBookings.has(String(booking.id)),
  )
  if (missingSelections.length) {
    const { error } = await admin.from('photo_selections').insert(
      missingSelections.map((booking) => ({
        workspace_id: workspaceId,
        booking_id: booking.id,
        status: booking.raw_photo_status === 'Approved' ? 'SUBMITTED' : 'OPEN',
        required_count: Math.max(0, Number(booking.selection_limit || 5)),
        included_limit: Math.min(5, Math.max(0, Number(booking.selection_limit || 5))),
        submitted_at:
          booking.raw_photo_status === 'Approved'
            ? booking.raw_photo_approved_at || booking.raw_photo_submitted_at || nowIso()
            : null,
      })),
    )
    if (error) throw new Error(error.message)
  }

  const missingJobs = bookings.filter((booking) => !jobBookings.has(String(booking.id)))
  if (missingJobs.length) {
    const { error } = await admin.from('editing_jobs').insert(
      missingJobs.map((booking) => ({
        workspace_id: workspaceId,
        batch_id: liveBatchByDate.get(String(booking.booking_date)),
        booking_id: booking.id,
        client_id: booking.client_id,
        status: booking.edited_photo_delivered_at
          ? 'DELIVERED'
          : booking.raw_photo_status === 'Approved'
            ? 'READY_FOR_EDITING'
            : 'WAITING_FOR_SELECTION',
        selected_count: 0,
        expected_output_count: Math.max(0, Number(booking.selection_limit || 5)),
        delivered_at: booking.edited_photo_delivered_at || null,
      })),
    )
    if (error) throw new Error(error.message)
  }
  return bookings
}

export async function getBatchList(
  workspaceId: string,
  { synchronize = true }: { synchronize?: boolean } = {},
) {
  const admin = adminClient()
  const [bookings, { data: batches, error: batchError }, { data: jobs, error: jobsError }, { data: uploadedFiles, error: uploadedFilesError }] = await Promise.all([
    synchronize ? syncEditorWorkflow(workspaceId) : loadActiveBookings(admin, workspaceId),
    admin
      .from('editing_batches')
      .select('id,display_id,shoot_date,location_key,storage_prefix')
      .eq('workspace_id', workspaceId)
      .order('shoot_date', { ascending: false }),
    admin
      .from('editing_jobs')
      .select('batch_id,booking_id,client_id,status,selected_count,assigned_editor_id,assigned_editor_name,photographer_name')
      .eq('workspace_id', workspaceId),
    admin.from('gallery_files').select('booking_id').eq('workspace_id', workspaceId).eq('storage_status', 'available'),
  ])
  if (batchError) throw new Error(batchError.message)
  if (jobsError) throw new Error(jobsError.message)
  if (uploadedFilesError) throw new Error(uploadedFilesError.message)
  const bookingMap = new Map(bookings.map((booking) => [String(booking.id), booking]))
  const uploadedBookingIds = new Set((uploadedFiles || []).map((file) => String(file.booking_id)))

  return (batches || []).map((batch) => {
    const batchJobs = (jobs || []).filter((job) =>
      job.batch_id === batch.id && bookingMap.has(String(job.booking_id)) && uploadedBookingIds.has(String(job.booking_id)),
    ) as Array<Record<string, unknown> & { status: EditingJobStatus }>
    const counts = batchCounts(batchJobs)
    return {
      id: String(batch.display_id),
      internalId: String(batch.id),
      workspaceId,
      shootDate: String(batch.shoot_date),
      locationKey: String(batch.location_key),
      status: deriveBatchStatus(batchJobs),
      totalClients: batchJobs.length,
      totalSelectedPhotos: batchJobs.reduce((sum, job) => sum + Number(job.selected_count || 0), 0),
      counts,
      clients: batchJobs.map((job) => {
        const booking = bookingMap.get(String(job.booking_id))
        return {
          bookingId: String(job.booking_id),
          clientId: String(job.client_id),
          clientName: String(booking?.customer_name || job.booking_id),
          packageName: String(booking?.package_name || ''),
          status: String(job.status),
          selectedCount: Number(job.selected_count || 0),
          assignedEditorId: job.assigned_editor_id ? String(job.assigned_editor_id) : null,
          assignedEditorName: job.assigned_editor_name ? String(job.assigned_editor_name) : null,
          photographerName: job.photographer_name ? String(job.photographer_name) : null,
        }
      }),
      storageReady: Boolean(batch.storage_prefix),
    }
  }).filter(batch => batch.totalClients > 0)
}

/**
 * Load only the fields needed by the onsite upload views.
 *
 * The full batch detail includes editing reports, selections, add-ons, print
 * allocations, and audit history. None of those optional dependencies should
 * prevent onsite staff from seeing today's clients or uploading RAW photos.
 */
export async function getOnsiteBatchSummary(
  workspaceId: string,
  shootDate: string,
  { synchronize = true }: { synchronize?: boolean } = {},
) {
  const admin = adminClient()
  if (synchronize) await syncEditorWorkflow(workspaceId)
  const eligiblePackageIds = await graduationPackageIds(admin)
  if (!eligiblePackageIds.length) return null

  const { data: batches, error: batchesError } = await admin
    .from('editing_batches')
    .select('id,display_id,shoot_date,batch_sequence')
    .eq('workspace_id', workspaceId)
    .eq('shoot_date', shootDate)
    .order('batch_sequence', { ascending: true })
  if (batchesError) throw new Error(batchesError.message)
  if (!batches?.length) return null

  const batchIds = batches.map((batch) => String(batch.id))
  const { data: jobs, error: jobsError } = await admin
    .from('editing_jobs')
    .select('booking_id,last_error')
    .eq('workspace_id', workspaceId)
    .in('batch_id', batchIds)
  if (jobsError) throw new Error(jobsError.message)

  const bookingIds = [...new Set((jobs || []).map((job) => String(job.booking_id)))]
  if (!bookingIds.length) {
    return { id: String(batches[0].display_id), shootDate, jobs: [] }
  }

  const [bookingsResult, galleryResult, storageResult, resetResult, emailResult, portalResult] = await Promise.all([
    admin
      .from('bookings')
      .select('id,customer_name,customer_email,package_name,booking_time,booking_status')
      .eq('workspace_id', workspaceId)
      .in('package_id', eligiblePackageIds)
      .in('id', bookingIds),
    admin
      .from('gallery_files')
      .select('booking_id,created_at')
      .in('booking_id', bookingIds),
    admin
      .from('booking_provisioning')
      .select('booking_id,storage_status')
      .in('booking_id', bookingIds),
    admin.from('photo_selections').select('booking_id,raw_reset_id,status')
      .eq('workspace_id', workspaceId).in('booking_id', bookingIds),
    admin.from('email_logs').select('booking_id,recipient_email,subject,status')
      .in('booking_id', bookingIds).like('subject', 'Your photos are ready to select — FICO MANA %'),
    admin.from('client_portals').select('booking_id,public_id,status,expires_at')
      .eq('workspace_id', workspaceId).in('booking_id', bookingIds),
  ])
  if (bookingsResult.error) throw new Error(bookingsResult.error.message)
  if (galleryResult.error) {
    console.error('Onsite summary gallery read failed:', galleryResult.error.message)
  }
  if (storageResult.error) {
    console.error('Onsite summary storage state read failed:', storageResult.error.message)
  }

  const bookingMap = new Map(
    (bookingsResult.data || []).map((booking) => [String(booking.id), booking]),
  )
  const galleryByBooking = new Map<string, { count: number; lastUploadAt: string | null }>()
  for (const file of galleryResult.error ? [] : galleryResult.data || []) {
    const bookingId = String(file.booking_id)
    const current = galleryByBooking.get(bookingId) || { count: 0, lastUploadAt: null }
    const createdAt = String(file.created_at || '')
    current.count += 1
    if (createdAt && (!current.lastUploadAt || createdAt > current.lastUploadAt)) {
      current.lastUploadAt = createdAt
    }
    galleryByBooking.set(bookingId, current)
  }
  const storageByBooking = new Map(
    (storageResult.error ? [] : storageResult.data || []).map((state) => [
      String(state.booking_id),
      String(state.storage_status),
    ]),
  )
  const portalByBooking = new Map(
    (portalResult.error ? [] : portalResult.data || []).map((portal) => [String(portal.booking_id), portal]),
  )

  const onsiteJobs = (jobs || [])
    .map((job) => {
      const bookingId = String(job.booking_id)
      const booking = bookingMap.get(bookingId)
      if (!booking || ACTIVE_BOOKING_EXCLUSIONS.has(String(booking.booking_status || ''))) return null
      const gallery = galleryByBooking.get(bookingId)
      const portal = portalByBooking.get(bookingId)
      const portalReady = portal?.status === 'active' && !hasPortalExpired(portal.expires_at)
      const emailAttempts = (emailResult.data || []).filter(row => row.booking_id === bookingId &&
        row.recipient_email === String(booking.customer_email || '').trim() &&
        row.subject === `Your photos are ready to select — FICO MANA ${bookingId}`)
      return {
        bookingId,
        customerName: String(booking.customer_name || bookingId),
        packageName: String(booking.package_name || ''),
        bookingTime: String(booking.booking_time || ''),
        galleryCount: gallery?.count || 0,
        lastUploadAt: gallery?.lastUploadAt || null,
        portalEmailStatus: emailAttempts.some(row => row.status === 'SENT') ? 'SENT' : emailAttempts.some(row => row.status === 'FAILED') ? 'FAILED' : null,
        portalUrl: portalReady && portal?.public_id ? portalUrl(String(portal.public_id)) : null,
        storageReady: storageByBooking.get(bookingId) === 'ready',
        lastError: job.last_error ? String(job.last_error) : null,
        resetId: resetResult.data?.find(row => row.booking_id === bookingId)?.raw_reset_id || null,
      }
    })
    .filter((job): job is NonNullable<typeof job> => Boolean(job))
    .sort((left, right) =>
      left.bookingTime.localeCompare(right.bookingTime) || left.customerName.localeCompare(right.customerName),
    )

  return {
    id: String(batches[0].display_id),
    shootDate,
    jobs: onsiteJobs,
  }
}

async function findBatch(admin: SupabaseClient, workspaceId: string, displayId: string) {
  const { data, error } = await admin
    .from('editing_batches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('display_id', displayId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Editing batch not found.')
  return data
}

export async function getBatchDetail(
  workspaceId: string,
  displayId: string,
  {
    batchListEntry,
    synchronize = true,
  }: {
    batchListEntry?: Awaited<ReturnType<typeof getBatchList>>[number]
    synchronize?: boolean
  } = {},
) {
  const admin = adminClient()
  const listEntry =
    batchListEntry ??
    (await getBatchList(workspaceId, { synchronize })).find((batch) => batch.id === displayId)
  if (!listEntry) return null
  const batch = await findBatch(admin, workspaceId, displayId)
  const { data: jobs, error: jobsError } = await admin
    .from('editing_jobs')
    .select('*')
    .eq('batch_id', batch.id)
    .order('updated_at', { ascending: false })
  if (jobsError) throw new Error(jobsError.message)
  const eligibleBookingIds = new Set(listEntry.clients.map(client => client.bookingId))
  const eligibleJobs = (jobs || []).filter(job => eligibleBookingIds.has(String(job.booking_id)))
  const bookingIds = eligibleJobs.map((job) => String(job.booking_id))
  if (!bookingIds.length) return { ...listEntry, jobs: [], auditLogs: [] }

  const [bookingsResult, selectionsResult, galleryResult, deliveryResult, storageResult, auditsResult, reviewsResult] = await Promise.all([
    admin.from('bookings').select('*').in('id', bookingIds),
    admin.from('photo_selections').select('*').in('booking_id', bookingIds),
    admin.from('gallery_files').select('id,booking_id,file_name,created_at').in('booking_id', bookingIds),
    admin.from('deliverable_files').select('booking_id').in('booking_id', bookingIds),
    admin.from('booking_provisioning').select('booking_id,storage_prefix,storage_status').in('booking_id', bookingIds),
    admin
      .from('workflow_audit_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('workflow_match_reviews')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  if (bookingsResult.error) throw new Error(bookingsResult.error.message)
  for (const [name, result] of [
    ['photo selections', selectionsResult],
    ['gallery files', galleryResult],
    ['deliverables', deliveryResult],
    ['storage state', storageResult],
    ['audit history', auditsResult],
    ['match reviews', reviewsResult],
  ] as const) {
    if (result.error) console.error(`Batch detail ${name} read failed:`, result.error.message)
  }
  const selectionIds = (selectionsResult.data || []).map((selection) => String(selection.id))
  const [selectionItemsResult, printAllocationsResult, addonOrdersResult] = selectionIds.length
    ? await Promise.all([
        admin.from('photo_selection_items').select('selection_id,gallery_file_id,enhancement_preference,is_extra_edit').in('selection_id', selectionIds),
        admin.from('print_allocations').select('selection_id,category,gallery_file_id,quantity,label_snapshot').in('selection_id', selectionIds),
        admin.from('client_addon_orders').select('selection_id,name_snapshot,pricing_type_snapshot,unit_price_snapshot,quantity,photo_count,photo_ids,total_amount').in('selection_id', selectionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
  for (const [name, result] of [
    ['selection items', selectionItemsResult],
    ['print allocations', printAllocationsResult],
    ['add-on orders', addonOrdersResult],
  ] as const) {
    if (result.error) console.error(`Batch detail ${name} read failed:`, result.error.message)
  }
  const bookingMap = new Map((bookingsResult.data || []).map((booking) => [String(booking.id), booking]))
  const selectionMap = new Map((selectionsResult.data || []).map((selection) => [String(selection.booking_id), selection]))
  const galleryNameMap = new Map((galleryResult.data || []).map((file) => [String(file.id), String(file.file_name)]))
  const storageMap = new Map((storageResult.data || []).map((state) => [String(state.booking_id), state]))

  return {
    ...listEntry,
    jobs: eligibleJobs.map((job) => {
      const bookingId = String(job.booking_id)
      const booking = bookingMap.get(bookingId)
      const selection = selectionMap.get(bookingId)
      const selectionId = String(selection?.id || '')
      const storage = storageMap.get(bookingId)
      return {
        id: String(job.id),
        bookingId,
        clientId: String(job.client_id),
        customerName: String(booking?.customer_name || bookingId),
        customerEmail: String(booking?.customer_email || ''),
        packageName: String(booking?.package_name || ''),
        bookingTime: String(booking?.booking_time || ''),
        bookingStatus: String(booking?.booking_status || ''),
        paymentStatus: String(booking?.payment_status || ''),
        status: job.status as EditingJobStatus,
        selectedCount: Number(job.selected_count || 0),
        expectedOutputCount: Number(job.expected_output_count || 0),
        galleryCount: (galleryResult.data || []).filter((row) => row.booking_id === bookingId).length,
        selectionStatus: String(selection?.status || 'OPEN'),
        selectionClientStatus: String(selection?.client_status || 'Not Started'),
        selectionRequiredCount: Number(selection?.required_count || job.expected_output_count || 0),
        selectionSubmittedAt: selection?.submitted_at || null,
        enhancementPreferences: (selectionItemsResult.data || []).filter((row) => String(row.selection_id) === selectionId).map((row) => ({
          fileId: String(row.gallery_file_id),
          fileName: galleryNameMap.get(String(row.gallery_file_id)) || String(row.gallery_file_id),
          preference: String(row.enhancement_preference || 'standard'),
          extraEdit: Boolean(row.is_extra_edit),
        })),
        printAllocations: (printAllocationsResult.data || []).filter((row) => String(row.selection_id) === selectionId).map((row) => ({
          category: String(row.category),
          label: String(row.label_snapshot || row.category),
          fileId: String(row.gallery_file_id),
          fileName: galleryNameMap.get(String(row.gallery_file_id)) || String(row.gallery_file_id),
          quantity: Number(row.quantity || 1),
        })),
        addonOrders: (addonOrdersResult.data || []).filter((row) => String(row.selection_id) === selectionId).map((row) => ({
          name: String(row.name_snapshot),
          pricingType: String(row.pricing_type_snapshot),
          unitPrice: Number(row.unit_price_snapshot || 0),
          quantity: Number(row.quantity || 0),
          photoCount: Number(row.photo_count || 0),
          photoIds: (row.photo_ids || []) as string[],
          photoNames: ((row.photo_ids || []) as string[]).map(id => galleryNameMap.get(id) || id),
          total: Number(row.total_amount || 0),
        })),
        totalAddonAmount: Number(selection?.total_addon_amount || 0),
        storageReady: storage?.storage_status === 'ready',
        storagePrefix: storage?.storage_prefix || null,
        deliverableCount: (deliveryResult.data || []).filter((row) => row.booking_id === bookingId).length,
        lastUploadAt:
          (galleryResult.data || [])
            .filter((row) => row.booking_id === bookingId)
            .map((row) => String(row.created_at || ''))
            .sort()
            .at(-1) || null,
        assignedEditorId: job.assigned_editor_id ? String(job.assigned_editor_id) : null,
        assignedEditorName: job.assigned_editor_name ? String(job.assigned_editor_name) : null,
        photographerName: job.photographer_name ? String(job.photographer_name) : null,
        downloadedBy: job.downloaded_by ? String(job.downloaded_by) : null,
        downloadedAt: job.downloaded_at || null,
        downloadLockExpiresAt: job.download_lock_expires_at || null,
        lastError: job.last_error || null,
      }
    }),
    auditLogs: (auditsResult.data || []).map((row) => ({
      id: String(row.id),
      actor: String(row.actor_type),
      action: String(row.action),
      bookingId: row.booking_id || null,
      timestamp: String(row.created_at),
      metadata: row.metadata || {},
    })),
    needsReview: (reviewsResult.data || []).map((row) => ({
      id: String(row.id),
      sourceFolderName: String(row.source_folder_name),
      suggestedBookingId: row.suggested_booking_id ? String(row.suggested_booking_id) : null,
      resolvedBookingId: row.resolved_booking_id ? String(row.resolved_booking_id) : null,
      status: String(row.status),
      reason: String(row.reason),
      createdAt: String(row.created_at),
    })),
  }
}

export async function getUploadReport(workspaceId: string, requestedLimit = 30) {
  const admin = adminClient()
  const limit = Math.min(100, Math.max(1, Math.trunc(requestedLimit) || 30))
  const retainedSince = new Date()
  retainedSince.setUTCMonth(retainedSince.getUTCMonth() - 2)
  const { data: runs, error: runsError } = await admin
    .from('batch_upload_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .gte('created_at', retainedSince.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit)
  if (runsError) throw new Error(runsError.message)
  if (!runs?.length) return []

  const runIds = runs.map((run) => String(run.id))
  const batchIds = [...new Set(runs.map((run) => String(run.batch_id)))]
  const [{ data: batches, error: batchesError }, { data: items, error: itemsError }] = await Promise.all([
    admin.from('editing_batches').select('id,display_id,shoot_date').in('id', batchIds),
    admin.from('batch_upload_items').select('*').in('upload_job_id', runIds),
  ])
  if (batchesError) throw new Error(batchesError.message)
  if (itemsError) throw new Error(itemsError.message)

  const bookingIds = [...new Set((items || []).map((item) => String(item.booking_id)))]
  const bookingsResult = bookingIds.length
    ? await admin.from('bookings').select('id,customer_name,package_name').in('id', bookingIds)
    : { data: [], error: null }
  const storageResult = bookingIds.length
    ? await admin
        .from('booking_provisioning')
        .select('booking_id,storage_status')
        .in('booking_id', bookingIds)
    : { data: [], error: null }
  if (bookingsResult.error) throw new Error(bookingsResult.error.message)
  if (storageResult.error) throw new Error(storageResult.error.message)

  const batchMap = new Map((batches || []).map((batch) => [String(batch.id), batch]))
  const bookingMap = new Map((bookingsResult.data || []).map((booking) => [String(booking.id), booking]))
  const storageMap = new Map((storageResult.data || []).map((state) => [String(state.booking_id), state]))

  return runs.map((run) => {
    const batch = batchMap.get(String(run.batch_id))
    return {
      id: String(run.id),
      batchId: String(batch?.display_id || run.batch_id),
      shootDate: String(batch?.shoot_date || ''),
      status: String(run.status),
      totalClients: Number(run.total_clients || 0),
      completedClients: Number(run.completed_clients || 0),
      failedClients: Number(run.failed_clients || 0),
      photosUploaded: Number(run.photos_uploaded || 0),
      createdAt: String(run.created_at),
      completedAt: run.completed_at ? String(run.completed_at) : null,
      clients: (items || [])
        .filter((item) => String(item.upload_job_id) === String(run.id))
        .map((item) => {
          const bookingId = String(item.booking_id)
          const booking = bookingMap.get(bookingId)
          const storage = storageMap.get(bookingId)
          return {
            bookingId,
            customerName: String(booking?.customer_name || bookingId),
            packageName: String(booking?.package_name || ''),
            status: String(item.status),
            expectedFiles: Number(item.expected_files || 0),
            uploadedFiles: Number(item.uploaded_files || 0),
            lastError: item.last_error ? String(item.last_error) : null,
            updatedAt: String(item.updated_at),
            storageReady: storage?.storage_status === 'ready',
          }
        }),
    }
  })
}

export async function recordMatchReviews(
  workspaceId: string,
  displayId: string,
  folders: Array<{ name: string; reason?: string }>,
  actorId: string,
) {
  const admin = adminClient()
  const batch = await findBatch(admin, workspaceId, displayId)
  const clean = folders
    .map((folder) => ({ name: safeSegment(folder.name), reason: String(folder.reason || 'This folder could not be matched to a client.') }))
    .filter((folder) => folder.name)
    .slice(0, 100)
  if (!clean.length) throw new Error('No unmatched client folders were provided.')
  const { data: existing } = await admin
    .from('workflow_match_reviews')
    .select('source_folder_name,status')
    .eq('workspace_id', workspaceId)
    .eq('batch_id', batch.id)
  const active = new Set((existing || []).filter((row) => row.status !== 'DISMISSED').map((row) => String(row.source_folder_name).toLowerCase()))
  const rows = clean.filter((folder) => !active.has(folder.name.toLowerCase())).map((folder) => ({
    workspace_id: workspaceId,
    batch_id: batch.id,
    source_folder_name: folder.name,
    status: 'NEEDS_REVIEW',
    reason: folder.reason.slice(0, 500),
  }))
  if (rows.length) {
    const { error } = await admin.from('workflow_match_reviews').insert(rows)
    if (error) throw new Error(error.message)
  }
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'UPLOAD_MATCH_NEEDS_REVIEW', {
    batchId: batch.id,
    metadata: { folders: clean.map((folder) => folder.name), newReviewCount: rows.length },
  })
  return { recorded: rows.length }
}

export async function resolveMatchReview(
  workspaceId: string,
  reviewId: string,
  bookingId: string,
  actorId: string,
) {
  const admin = adminClient()
  const { data: review, error } = await admin
    .from('workflow_match_reviews')
    .select('*,editing_batches!inner(workspace_id)')
    .eq('id', reviewId)
    .eq('editing_batches.workspace_id', workspaceId)
    .maybeSingle()
  if (error || !review) throw new Error(error?.message || 'Matching review item not found.')
  const { data: job } = await admin
    .from('editing_jobs')
    .select('id,batch_id')
    .eq('workspace_id', workspaceId)
    .eq('batch_id', review.batch_id)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (!job) throw new Error('The selected client is not part of this batch.')
  const timestamp = nowIso()
  const { error: updateError } = await admin
    .from('workflow_match_reviews')
    .update({ status: 'RESOLVED', resolved_booking_id: bookingId, resolved_by: actorId, resolved_at: timestamp, updated_at: timestamp })
    .eq('id', reviewId)
  if (updateError) throw new Error(updateError.message)
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'UPLOAD_MATCH_RESOLVED', {
    bookingId,
    batchId: review.batch_id,
    metadata: { reviewId, sourceFolderName: review.source_folder_name },
  })
  return { success: true, reviewId, bookingId }
}

async function ensurePortal(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  await assertGraduationBooking(admin, bookingId, workspaceId)
  const { data: existing, error } = await admin
    .from('client_portals')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (existing) return existing
  const { data, error: insertError } = await admin
    .from('client_portals')
    .insert({ booking_id: bookingId, workspace_id: workspaceId, status: 'active' })
    .select('*')
    .single()
  if (insertError || !data) throw new Error(insertError?.message || 'Client portal creation failed.')
  return data
}

export async function ensureBookingStorage(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  await assertGraduationBooking(admin, bookingId, workspaceId)
  try {
    return await prepareBookingStorage(admin, workspaceId, bookingId)
  } catch (error) {
    if (!/workflow must be synchronized/i.test(error instanceof Error ? error.message : '')) throw error
    await syncEditorWorkflow(workspaceId)
    return prepareBookingStorage(admin, workspaceId, bookingId)
  }
}

export async function activateClientPortalAfterOnsiteUpload(
  admin: SupabaseClient,
  workspaceId: string,
  bookingId: string,
) {
  await assertGraduationBooking(admin, bookingId, workspaceId)
  const { data: uploaded, error: uploadedError } = await admin.from('gallery_files').select('id')
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId)
    .eq('storage_status', 'available').limit(1)
  if (uploadedError) throw new Error(uploadedError.message)
  if (!uploaded?.length) throw new Error('A verified onsite photo is required before the client portal can be created.')

  const { data: booking, error: bookingError } = await admin.from('bookings')
    .select('selection_limit').eq('workspace_id', workspaceId).eq('id', bookingId).single()
  if (bookingError || !booking) throw new Error(bookingError?.message || 'Booking not found.')

  const portal = await ensurePortal(admin, workspaceId, bookingId)
  const { data: selection, error: selectionError } = await admin.from('photo_selections').select('id')
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId).maybeSingle()
  if (selectionError) throw new Error(selectionError.message)
  if (!selection) {
    const requiredCount = Math.max(0, Number(booking.selection_limit || 5))
    const { error: createSelectionError } = await admin.from('photo_selections').insert({
      workspace_id: workspaceId,
      booking_id: bookingId,
      status: 'OPEN',
      client_status: 'Not Started',
      required_count: requiredCount,
      included_limit: Math.min(5, requiredCount),
    })
    if (createSelectionError && createSelectionError.code !== '23505') throw new Error(createSelectionError.message)
  }

  const timestamp = nowIso()
  const { error: provisioningError } = await admin.from('booking_provisioning').upsert({
    booking_id: bookingId,
    workspace_id: workspaceId,
    status: 'ACTIVE',
    storage_provider: 'r2',
    storage_status: 'ready',
    client_portal_id: portal.id,
    provisioned_at: timestamp,
    last_error: null,
    updated_at: timestamp,
  })
  if (provisioningError) throw new Error(provisioningError.message)
  return portal
}

export async function reconcileBookingStorage(
  workspaceId: string,
  bookingId: string,
  actorId: string,
  repair = false,
) {
  const admin = adminClient()
  await assertGraduationBooking(admin, bookingId, workspaceId)
  if (repair) {
    const provisioningReset = await admin
      .from('booking_provisioning')
      .update({ storage_status: 'ready', last_error: null, updated_at: nowIso() })
      .eq('workspace_id', workspaceId)
      .eq('booking_id', bookingId)
    if (provisioningReset.error) throw new Error(provisioningReset.error.message)
  }
  const prepared = await ensureBookingStorage(admin, workspaceId, bookingId)
  await audit(
    admin,
    workspaceId,
    { type: 'staff', id: actorId },
    repair ? 'STORAGE_REPAIRED' : 'STORAGE_REFRESHED',
    {
      bookingId,
      batchId: prepared.batch.id,
      metadata: { storageProvider: 'r2', storagePrefix: prepared.namespace.prefix },
    },
  )
  return {
    status: 'READY',
    bookingId,
    storageProvider: 'r2',
    storagePrefix: prepared.namespace.prefix,
  }
}

export async function saveRawFile(input: {
  workspaceId: string
  bookingId: string
  actorId: string
  fileName: string
  mimeType: string
  data: Buffer
  thumbnail?: Buffer | null
}) {
  const admin = adminClient()
  const { namespace, batch, booking } = await ensureBookingStorage(admin, input.workspaceId, input.bookingId)
  const generation = await rawUploadGeneration(admin, input.workspaceId, input.bookingId)
  const checksum = sha256(input.data)
  const safeName = safeSegment(input.fileName) || `photo-${checksum.slice(0, 8)}`
  const { data: duplicate } = await admin.from('gallery_files').select('*')
    .eq('workspace_id', input.workspaceId).eq('booking_id', input.bookingId)
    .eq('checksum', checksum).eq('file_size', input.data.length).eq('storage_status', 'available').maybeSingle()
  if (duplicate && await objectExists(String(duplicate.storage_key))) return duplicate

  const objectId = createStorageObjectId()
  const storageKey = createStorageKey({
    workspaceId: input.workspaceId,
    bookingId: input.bookingId,
    shootDate: String(booking.booking_date),
    category: 'raw',
    objectId,
    fileName: safeName,
  })
  await uploadObject({
    key: storageKey,
    body: input.data,
    contentType: input.mimeType,
    contentLength: input.data.length,
    checksum,
    metadata: { bookingid: input.bookingId, generation: String(generation), filename: safeName },
  })

  let thumbnailReference: string | null = null
  let previewReference: string | null = null
  if (/^image\/(?:jpeg|png|webp|tiff)$/i.test(input.mimeType)) {
    try {
      const source = sharp(input.data, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate()
      const [preview, thumbnail] = await Promise.all([
        source.clone().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer(),
        input.thumbnail?.length
          ? Promise.resolve(input.thumbnail)
          : source.clone().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
      ])
      previewReference = createDerivativeKey(storageKey, 'preview')
      thumbnailReference = createDerivativeKey(storageKey, 'thumbnail')
      await Promise.all([
        uploadObject({ key: previewReference, body: preview, contentType: 'image/webp', contentLength: preview.length,
          checksum: sha256(preview), cacheControl: 'private, max-age=31536000, immutable' }),
        uploadObject({ key: thumbnailReference, body: thumbnail, contentType: input.thumbnail?.length ? 'image/jpeg' : 'image/webp',
          contentLength: thumbnail.length, checksum: sha256(thumbnail), cacheControl: 'private, max-age=31536000, immutable' }),
      ])
    } catch (error) {
      console.error('Photo derivative generation failed:', error)
    }
  }
  const { data: gallery, error } = await admin
    .from('gallery_files')
    .upsert(
      {
        workspace_id: input.workspaceId,
        booking_id: input.bookingId,
        client_id: booking.client_id,
        storage_provider: 'r2',
        storage_key: storageKey,
        storage_status: 'available',
        upload_generation: generation,
        file_name: safeName,
        mime_type: input.mimeType,
        file_size: input.data.length,
        checksum,
        thumbnail_reference: thumbnailReference,
        preview_reference: previewReference,
      },
      { onConflict: 'workspace_id,storage_key' },
    )
    .select('*')
    .single()
  if (error || !gallery) throw new Error(error?.message || 'Could not index the RAW photo.')
  await activateClientPortalAfterOnsiteUpload(admin, input.workspaceId, input.bookingId)
  await audit(admin, input.workspaceId, { type: 'staff', id: input.actorId }, 'RAW_UPLOADED', {
    bookingId: input.bookingId,
    batchId: batch.id,
    metadata: { galleryFileId: gallery.id, storageKey, duplicate: false, storagePrefix: namespace.prefix },
  })
  return gallery
}

export async function refreshRawFiles(workspaceId: string, bookingId: string, actorId: string) {
  const admin = adminClient()
  const prepared = await ensureBookingStorage(admin, workspaceId, bookingId)
  const generation = await rawUploadGeneration(admin, workspaceId, bookingId)
  const { data: files, error } = await admin.from('gallery_files').select('id,storage_key')
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId)
    .eq('upload_generation', generation).eq('storage_status', 'available').limit(5001)
  if (error || (files?.length || 0) > 5000) {
    throw new PortalSelectionError('The photo index could not be checked. Try: finish active uploads, then refresh the files.', 'PHOTO_SYNC_UNAVAILABLE', 503)
  }
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'GALLERY_INDEXED', {
    bookingId,
    batchId: prepared.batch.id,
    metadata: { storagePrefix: prepared.namespace.rawPrefix, indexedFiles: files?.length || 0, generation },
  })
  return { indexed: files?.length || 0, removed: 0, recovered: false, warning: null }
}

async function portalRecord(publicId: string, allowReset = false) {
  const admin = adminClient()
  const { data, error } = await admin
    .from('client_portals')
    .select('*,bookings!inner(workspace_id),workspaces!inner(slug,status)')
    .eq('public_id', publicId)
    .eq('workspaces.slug', 'fico-mana')
    .eq('workspaces.status', 'active')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Portal not found.')
  const booking = Array.isArray(data.bookings) ? data.bookings[0] : data.bookings
  if (!data.workspace_id || booking?.workspace_id !== data.workspace_id) throw new Error('Portal not found.')
  if (hasPortalExpired(data.expires_at)) throw new Error('Portal expired.')
  if (data.status === 'expired') throw new Error('Portal expired.')
  if (data.status !== 'active') throw new Error('Portal disabled.')
  const available = await admin.from('gallery_files').select('id')
    .eq('workspace_id', data.workspace_id).eq('booking_id', data.booking_id)
    .eq('storage_status', 'available').limit(1)
  if (available.error) throw new Error('Photo availability could not be checked.')
  if (!available.data?.length) throw new Error('Portal not found.')
  const state = await admin.from('photo_selections').select('raw_reset_id,raw_upload_generation,reopened_at')
    .eq('workspace_id', data.workspace_id).eq('booking_id', data.booking_id).maybeSingle()
  if (state.error) throw new Error('Photo status could not be checked.')
  if (state.data?.raw_reset_id && !allowReset) throw new PortalSelectionError('The studio is replacing your uploaded photos. Try: check this portal again after the upload finishes.', 'PHOTOS_RESETTING')
  return { admin, portal: data, photoState: state.data }
}

export async function getPortalPhotoRevision(publicId: string) {
  const { admin, portal, photoState } = await portalRecord(publicId, true)
  const gallery = await admin.from('gallery_files').select('created_at', { count: 'exact' })
    .eq('workspace_id', portal.workspace_id).eq('booking_id', portal.booking_id).order('created_at', { ascending: false }).limit(1)
  if (gallery.error) throw gallery.error
  return { generation: Number(photoState?.raw_upload_generation || 0), resetting: Boolean(photoState?.raw_reset_id), reopenedAt: photoState?.reopened_at || null,
    galleryCount: gallery.count || 0, lastUploadAt: gallery.data?.[0]?.created_at || null,
    expiresAt: portal.expires_at || null, portalReadyEmailSentAt: portal.access_email_sent_at || null, deliverablesUploadedAt: portal.deliverables_uploaded_at || null }
}

export async function recordPortalFirstDownload(publicId: string) {
  const { admin, portal } = await portalRecord(publicId)
  const { error } = await admin.rpc('record_portal_first_download', {
    p_workspace: portal.workspace_id, p_public_id: portal.public_id,
  })
  if (error) throw new PortalSelectionError('The completed download could not be recorded. Try: download again. If it continues, ask the studio to check the portal activity log.', 'PORTAL_DOWNLOAD_UPDATE_FAILED', 503)
}

export async function getPortalData(publicId: string, offset = 0, limit = 48) {
  const { admin, portal } = await portalRecord(publicId)
  const bookingId = String(portal.booking_id)
  const workspaceId = String(portal.workspace_id)
  const pageSize = Math.min(MAX_PORTAL_PAGE_SIZE, Math.max(1, limit))
  const [bookingResult, selectionResult, galleryResult, deliverablesResult, jobResult, paymentsResult, resourcesResult, catalogResult, expirySettings, rawDownloadAccessResult] =
    await Promise.all([
      admin.from('bookings').select('*').eq('workspace_id', workspaceId).eq('id', bookingId).single(),
      admin.from('photo_selections').select('*').eq('workspace_id', workspaceId).eq('booking_id', bookingId).maybeSingle(),
      admin
        .from('gallery_files')
        .select('id,file_name,mime_type,storage_key,created_at', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .eq('booking_id', bookingId)
        .eq('storage_status', 'available')
        .order('created_at', { ascending: true })
        .range(Math.max(0, offset), Math.max(0, offset) + pageSize - 1),
      admin.from('deliverable_files').select('*').eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('storage_status', 'available').order('published_at', { ascending: false }),
      admin.from('editing_jobs').select('status').eq('workspace_id', workspaceId).eq('booking_id', bookingId).maybeSingle(),
      admin.from('payments').select('amount').eq('booking_id', bookingId).eq('status', 'confirmed'),
      admin
        .from('client_portal_resources')
        .select('id,resource_type,title,url,content,created_at')
        .eq('booking_id', bookingId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false }),
      admin
        .from('addon_catalog')
        .select('id,name,description,price_amount,pricing_type,display_order,max_quantity,photo_limit')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true }),
      admin.from('storage_settings').select('portal_expiry_days').eq('workspace_id', workspaceId).eq('id', 1).maybeSingle(),
      getPortalRawDownloadAccess(publicId)
        .then((data) => ({ data, error: null }))
        .catch((error: unknown) => ({ data: null, error: error instanceof Error ? error : new Error('Download access could not be checked.') })),
    ])
  if (bookingResult.error || !bookingResult.data) throw new Error('Booking not found.')
  const warnings: string[] = []
  for (const [label, result] of [
    ['photo selection', selectionResult],
    ['gallery photos', galleryResult],
    ['deliverables', deliverablesResult],
    ['editing status', jobResult],
    ['payments', paymentsResult],
    ['project resources', resourcesResult],
    ['add-ons', catalogResult],
    ['portal expiry', expirySettings],
    ['original download access', rawDownloadAccessResult],
  ] as const) {
    if (result.error) {
      warnings.push(label)
      console.error(`Client portal ${label} read failed:`, result.error.message)
    }
  }
  const selectionId = String(selectionResult.data?.id || '00000000-0000-0000-0000-000000000000')
  const [itemsResult, allocationsResult, ordersResult] = await Promise.all([
    admin
      .from('photo_selection_items')
      .select('gallery_file_id,enhancement_preference,is_extra_edit')
      .eq('selection_id', selectionId),
    admin
      .from('print_allocations')
      .select('category,gallery_file_id,quantity,label_snapshot')
      .eq('selection_id', selectionId),
    admin
      .from('client_addon_orders')
      .select('addon_catalog_id,name_snapshot,description_snapshot,pricing_type_snapshot,unit_price_snapshot,quantity,photo_count,photo_ids,total_amount')
      .eq('selection_id', selectionId)
      .order('created_at', { ascending: true }),
  ])
  for (const [label, result] of [
    ['selected-photo details', itemsResult],
    ['print allocations', allocationsResult],
    ['add-on orders', ordersResult],
  ] as const) {
    if (result.error) {
      warnings.push(label)
      console.error(`Client portal ${label} read failed:`, result.error.message)
    }
  }
  const selectedItems = (itemsResult.data || []).map((row) => ({
    fileId: String(row.gallery_file_id),
    preference: String(row.enhancement_preference || 'standard'),
    extraEdit: Boolean(row.is_extra_edit),
  }))
  await admin.from('client_portals').update({ last_accessed_at: nowIso() }).eq('id', portal.id)
  const booking = bookingResult.data
  return {
    booking: {
      id: String(booking.id),
      customerName: String(booking.customer_name),
      packageName: String(booking.package_name || ''),
      bookingDate: String(booking.booking_date),
      bookingTime: String(booking.booking_time || ''),
      bookingStatus: String(booking.booking_status || ''),
      paymentStatus: String(booking.payment_status || ''),
      price: Number(booking.price || 0),
      depositAmount: Number(booking.deposit_amount || 0),
      amountPaid: (paymentsResult.data || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    },
    portalId: String(portal.public_id),
    shareUrl: portalUrl(publicId),
    expiry: expirySettings.error && !portal.download_expiry_days ? null : {
      days: Number(portal.download_expiry_days || expirySettings.data?.portal_expiry_days || 30),
      portalReadyEmailSentAt: portal.access_email_sent_at || null,
      deliverablesUploadedAt: portal.deliverables_uploaded_at || null,
      expiresAt: portal.expires_at || null,
    },
    warnings: [...new Set(warnings)],
    selection: selectionResult.data
      ? {
          id: String(selectionResult.data.id),
          status: String(selectionResult.data.status),
          requiredCount: Number(selectionResult.data.required_count),
          includedLimit: Number(selectionResult.data.included_limit ?? Math.min(5, Number(selectionResult.data.required_count || 5))),
          clientStatus: String(selectionResult.data.client_status || 'Not Started'),
          noRevisionAcknowledged: Boolean(selectionResult.data.no_revision_acknowledged),
          submittedAt: selectionResult.data.submitted_at || null,
          reopenedAt: selectionResult.data.reopened_at || null,
          rawUploadGeneration: Number(selectionResult.data.raw_upload_generation || 0),
          selectedIds: selectedItems.map((item) => item.fileId),
          selectedItems,
          printAllocations: (allocationsResult.data || []).map((row) => ({
            category: String(row.category),
            fileId: String(row.gallery_file_id),
            quantity: Number(row.quantity || 1),
            label: String(row.label_snapshot || PRINT_CATEGORY_LABELS[String(row.category) as keyof typeof PRINT_CATEGORY_LABELS] || row.category),
          })),
          addonOrders: (ordersResult.data || []).map((row) => ({
            addonId: row.addon_catalog_id ? String(row.addon_catalog_id) : null,
            name: String(row.name_snapshot),
            description: String(row.description_snapshot || ''),
            pricingType: String(row.pricing_type_snapshot),
            unitPrice: Number(row.unit_price_snapshot || 0),
            quantity: Number(row.quantity || 0),
            photoCount: Number(row.photo_count || 0),
            photoIds: (row.photo_ids || []) as string[],
            total: Number(row.total_amount || 0),
          })),
          totalAddonAmount: Number(selectionResult.data.total_addon_amount || 0),
        }
      : null,
    gallery: (galleryResult.data || []).map((file) => ({
      id: String(file.id),
      fileName: String(file.file_name),
      mimeType: String(file.mime_type),
    })),
    galleryTotal: galleryResult.count || 0,
    galleryOffset: Math.max(0, offset),
    galleryLimit: pageSize,
    editingStatus: String(jobResult.data?.status || 'WAITING_FOR_SELECTION'),
    addonCatalog: (catalogResult.data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description || ''),
      price: Number(row.price_amount || 0),
      pricingType: String(row.pricing_type),
      maxQuantity: Number(row.max_quantity || 1),
      photoLimit: typeof row.photo_limit === 'number' ? row.photo_limit : undefined,
    })),
    deliverables: (deliverablesResult.data || []).map((file) => ({
      id: String(file.id),
      fileName: String(file.file_name),
      mimeType: String(file.mime_type),
      fileSize: Number(file.file_size || 0),
      publishedAt: String(file.published_at),
    })),
    resources: resourcesResult.data || [],
    rawDownloadAccess: rawDownloadAccessResult.data,
  }
}

export async function getPortalFile(
  publicId: string,
  fileId: string,
  kind: 'gallery' | 'deliverable',
  ifNoneMatch?: string | null,
  variant: 'thumbnail' | 'preview' = 'preview',
) {
  const { admin, portal } = await portalRecord(publicId)
  const table = kind === 'deliverable' ? 'deliverable_files' : 'gallery_files'
  const { data, error } = await admin
    .from(table)
    .select('*')
    .eq('id', fileId)
    .eq('workspace_id', portal.workspace_id)
    .eq('booking_id', portal.booking_id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Photo not found.')
  if (data.storage_status !== 'available' || data.storage_provider !== 'r2') {
    throw new PortalSelectionError('This file is currently unavailable. Try: ask the studio to finish migrating or re-uploading it.', 'FILE_UNAVAILABLE', 404)
  }
  // Authorize the live portal and the exact workspace/booking file BEFORE accepting a validator.
  // Weak validators describe the managed preview version; no private provider IDs leave this endpoint.
  const etag = `W/"${createHash('sha256').update(JSON.stringify([
    'portal-photo-v1', publicId, portal.workspace_id, portal.booking_id, kind, data.id,
    data.storage_key, data.checksum, data.updated_at, data.created_at, data.published_at,
    data.file_size, data.mime_type, data.file_name, data.thumbnail_reference, data.preview_reference,
  ])).digest('hex')}"`
  const cached = { etag, mimeType: kind === 'gallery' ? 'image/webp' : String(data.mime_type || 'application/octet-stream'), fileName: String(data.file_name || 'photo') }
  if (ifNoneMatch?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) {
    return { ...cached, notModified: true, data: null }
  }
  const storageKey = kind === 'gallery'
    ? String(variant === 'thumbnail' ? data.thumbnail_reference || data.preview_reference || '' : data.preview_reference || data.thumbnail_reference || '')
    : String(data.storage_key || '')
  if (!storageKey) throw new PortalSelectionError('This photo preview is still processing. Try: refresh the gallery in a moment.', 'FILE_PROCESSING', 409)
  assertStorageKeyOwnership(storageKey, String(portal.workspace_id), String(portal.booking_id))
  return {
    ...cached,
    notModified: false,
    data: null,
    storageKey,
  }
}

export async function getStaffSelectionFiles(workspaceId: string, bookingId: string) {
  const admin = adminClient()
  await assertGraduationBooking(admin, bookingId, workspaceId)
  const { data: selection, error: selectionError } = await admin
    .from('photo_selections')
    .select('id,status,submitted_at')
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (selectionError) throw new Error(selectionError.message)
  if (!selection) throw new Error('Photo selection not found.')
  const { data: items, error: itemsError } = await admin
    .from('photo_selection_items')
    .select('gallery_file_id,enhancement_preference,is_extra_edit')
    .eq('selection_id', selection.id)
  if (itemsError) throw new Error(itemsError.message)
  const fileIds = (items || []).map((item) => String(item.gallery_file_id))
  if (!fileIds.length) {
    return { status: String(selection.status), submittedAt: selection.submitted_at, files: [] }
  }
  const { data: files, error: filesError } = await admin
    .from('gallery_files')
    .select('id,file_name,mime_type,file_size,storage_provider,storage_status')
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .in('id', fileIds)
  if (filesError) throw new Error(filesError.message)
  const fileMap = new Map((files || []).map((file) => [String(file.id), file]))
  return {
    status: String(selection.status),
    submittedAt: selection.submitted_at,
    files: (items || []).flatMap((item) => {
      const file = fileMap.get(String(item.gallery_file_id))
      if (!file) return []
      return [{
        id: String(file.id),
        fileName: String(file.file_name || 'Photo'),
        mimeType: String(file.mime_type || 'application/octet-stream'),
        fileSize: Number(file.file_size || 0),
        available: file.storage_provider === 'r2' && file.storage_status === 'available',
        preference: String(item.enhancement_preference || 'standard'),
        extraEdit: Boolean(item.is_extra_edit),
      }]
    }),
  }
}

export async function getStaffGalleryFile(
  workspaceId: string,
  fileId: string,
  variant: 'thumbnail' | 'preview' = 'preview',
) {
  const admin = adminClient()
  const { data, error } = await admin
    .from('gallery_files')
    .select('id,workspace_id,booking_id,file_name,storage_provider,storage_status,thumbnail_reference,preview_reference')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Photo not found in this workspace.')
  if (data.storage_provider !== 'r2' || data.storage_status !== 'available') {
    throw new Error('This photo is currently unavailable. Try: finish migrating or re-uploading it.')
  }
  const storageKey = String(
    variant === 'thumbnail'
      ? data.thumbnail_reference || data.preview_reference || ''
      : data.preview_reference || data.thumbnail_reference || '',
  )
  if (!storageKey) throw new Error('This photo preview is still processing. Try: refresh in a moment.')
  assertStorageKeyOwnership(storageKey, workspaceId, String(data.booking_id))
  return createDownloadUrl({
    key: storageKey,
    expiresIn: 10 * 60,
    inline: true,
    downloadName: String(data.file_name || 'photo'),
  })
}

async function verifiedPortalPin(publicId: string, input: { pin: string }) {
  const { admin, portal } = await portalRecord(publicId)
  const bookingId = String(portal.booking_id)
  const workspaceId = String(portal.workspace_id)
  // Verify against the saved booking, never a client-supplied phone number.
  // This must precede the selection lock, billing, manifest and storage writes.
  const { data: contact, error: contactError } = await admin.from('bookings')
    .select('customer_phone').eq('workspace_id', workspaceId).eq('id', bookingId).single()
  if (contactError || !contact) throw new PortalSelectionError('Your booking could not be checked. Try: wait a moment and submit again.', 'SELECTION_PIN_UNAVAILABLE', 503)
  const phoneDigits = String(contact.customer_phone || '').replace(/\D/g, '')
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    throw new PortalSelectionError('A valid phone number is needed for this booking. Try: ask FICO MANA to update the booking phone number, then submit again.', 'SELECTION_PHONE_REQUIRED', 409)
  }
  if (typeof input.pin !== 'string' || !/^[0-9]{4}$/.test(input.pin) || !timingSafeEqual(Buffer.from(input.pin), Buffer.from(phoneDigits.slice(-4)))) {
    throw new PortalSelectionError('Incorrect PIN. Try: enter the last 4 digits of the phone number used for this booking.', 'SELECTION_PIN_INVALID', 403)
  }
  return { admin, portal, bookingId, workspaceId }
}

export async function submitPhotoSelection(publicId: string, input: PortalSelectionInput) {
  const { admin, bookingId, workspaceId } = await verifiedPortalPin(publicId, input)
  if (!input.acknowledgeNoRevision) throw new PortalSelectionError('Please acknowledge the no-revision policy before submitting.', 'SELECTION_INVALID', 400)
  const { data: selection, error } = await admin
    .from('photo_selections')
    .update({ status: 'SUBMITTING', client_status: 'Selection In Progress', updated_at: nowIso() })
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .is('raw_reset_id', null)
    .in('status', ['OPEN', 'COPY_FAILED'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!selection) throw new PortalSelectionError('This selection is already submitted and locked. Try: refresh the portal to see its latest status.', 'SELECTION_LOCKED')
  let submitted = false
  try {
    const includedLimit = Math.min(5, Math.max(0, Number(selection.included_limit ?? selection.required_count ?? 5)))
    const included = [...new Set(input.includedFileIds?.length ? input.includedFileIds : input.fileIds.slice(0, includedLimit))]
    const extras = [...new Set(input.extraEditFileIds?.length ? input.extraEditFileIds : input.fileIds.filter((id) => !included.includes(id)))]
    if (included.length !== includedLimit || included.some((id) => extras.includes(id))) {
      throw new PortalSelectionError(`Select exactly ${includedLimit} included photo${includedLimit === 1 ? '' : 's'} before submitting.`, 'SELECTION_INVALID', 400)
    }
    const unique = [...new Set([...included, ...extras])]
    if (unique.length > 205) {
      throw new PortalSelectionError('A selection can contain at most 205 photos.', 'SELECTION_INVALID', 400)
    }
    const preferenceMap = new Map((input.preferences || []).map((item) => [item.fileId, item.preference]))
    const printAllocations = input.printAllocations || []
    const standardCategories = ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R'] as const
    const walletAllocations = printAllocations.filter(allocation => allocation.category === 'WALLET_SIZE')
    if (printAllocations.length < Object.keys(PRINT_CATEGORY_LIMITS).length || printAllocations.length > 7 || walletAllocations.length < 1 || walletAllocations.length > 4) {
      throw new PortalSelectionError('Choose a photo for every free print category.', 'SELECTION_INVALID', 400)
    }
    for (const category of standardCategories) {
      if (printAllocations.filter(allocation => allocation.category === category).length !== 1) {
        throw new PortalSelectionError('Each standard free print category requires one photo.', 'SELECTION_INVALID', 400)
      }
    }
    const allocationKeys = new Set<string>()
    for (const allocation of printAllocations) {
      const allocationKey = `${allocation.category}:${allocation.fileId}`
      if (allocationKeys.has(allocationKey)) {
        throw new PortalSelectionError('The same photo cannot be assigned twice in one print category.', 'SELECTION_INVALID', 400)
      }
      if (!included.includes(allocation.fileId)) {
        throw new PortalSelectionError('Free print allocations must use an included enhanced photo.', 'SELECTION_INVALID', 400)
      }
      const validWalletQuantity = allocation.category === 'WALLET_SIZE' && (allocation.quantity === 1 || (walletAllocations.length === 1 && allocation.quantity === 4))
      if ((allocation.category !== 'WALLET_SIZE' && allocation.quantity !== PRINT_CATEGORY_LIMITS[allocation.category]) || (allocation.category === 'WALLET_SIZE' && !validWalletQuantity)) {
        throw new PortalSelectionError(`${PRINT_CATEGORY_LABELS[allocation.category]} allows at most ${PRINT_CATEGORY_LIMITS[allocation.category]}.`, 'SELECTION_INVALID', 400)
      }
      allocationKeys.add(allocationKey)
    }
    const walletCopyCount = walletAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
    if (walletCopyCount < 1 || walletCopyCount > PRINT_CATEGORY_LIMITS.WALLET_SIZE) {
      throw new PortalSelectionError('Wallet Size allows one to four photos.', 'SELECTION_INVALID', 400)
    }
    const { data: gallery, error: galleryError } = await admin
      .from('gallery_files')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('booking_id', bookingId)
      .in('id', unique)
    if (galleryError || !gallery || gallery.length !== unique.length) {
      throw new PortalSelectionError('One or more selected photos do not belong to this portal.', 'SELECTION_INVALID', 400)
    }
    const addonRequests = input.addons || []
    if (addonRequests.length > 4) throw new PortalSelectionError('Choose up to four add-on types.', 'SELECTION_INVALID', 400)
    const addonIds = [...new Set(addonRequests.map((addon) => addon.addonId))]
    if (addonRequests.length !== addonIds.length) {
      throw new PortalSelectionError('Each add-on type may appear only once.', 'SELECTION_INVALID', 400)
    }
    const { data: addonRows, error: addonError } = addonIds.length
      ? await admin
          .from('addon_catalog')
          .select('id,name,description,price_amount,pricing_type,max_quantity,photo_limit')
          .eq('workspace_id', workspaceId)
          .eq('status', 'active')
          .in('id', addonIds)
      : { data: [], error: null }
    if (addonError || (addonRows || []).length !== addonIds.length) {
      throw new PortalSelectionError('One or more selected add-ons are no longer available.', 'SELECTION_INVALID', 400)
    }
    const addonMap = new Map((addonRows || []).map((row) => [String(row.id), row]))
    const extraAddon = [...addonMap.values()].find((row) => String(row.name).toLowerCase() === 'extra edit')
    const requestedExtraAddon = addonRequests.find((addon) => String(addon.addonId) === String(extraAddon?.id))
    if (extras.length && (!extraAddon || !requestedExtraAddon || Number(requestedExtraAddon.photoCount || requestedExtraAddon.quantity) !== extras.length)) {
      throw new PortalSelectionError('Add Extra Edit for every photo selected beyond the included allocation.', 'SELECTION_INVALID', 400)
    }
    if (!extras.length && requestedExtraAddon) {
      throw new PortalSelectionError('Extra Edit can only be added when photos exceed the included allocation.', 'SELECTION_INVALID', 400)
    }
    for (const request of addonRequests) {
      const row = addonMap.get(request.addonId)
      if (!row || request.quantity > Number(row.max_quantity || 1)) {
        throw new PortalSelectionError(row ? `${row.name} exceeds its maximum quantity.` : 'Selected add-on not found.', 'SELECTION_INVALID', 400)
      }
    }
    const addonOrders = addonRequests.map((request) => {
      const row = addonMap.get(request.addonId)
      if (!row) throw new PortalSelectionError('Selected add-on not found.', 'SELECTION_INVALID', 400)
      const quantity = Number(request.quantity)
      const photoIds = request.photoIds || []
      const assignmentError = addonPhotoError({ name: String(row.name), photoLimit: row.photo_limit }, photoIds, unique)
      if (assignmentError) throw new PortalSelectionError(assignmentError, 'SELECTION_INVALID', 400)
      const photoCount = Number(request.photoCount || 0)
      const pricingType = String(row.pricing_type) as 'fixed' | 'per_photo' | 'per_piece'
      const billableUnits = pricingType === 'fixed' ? 1 : pricingType === 'per_photo' ? Math.max(photoCount, quantity) : quantity
      return {
        workspace_id: workspaceId,
        booking_id: bookingId,
        selection_id: selection.id,
        addon_catalog_id: row.id,
        name_snapshot: String(row.name),
        description_snapshot: String(row.description || ''),
        pricing_type_snapshot: pricingType,
        unit_price_snapshot: Number(row.price_amount || 0),
        quantity,
        photo_count: photoCount,
        photo_ids: photoIds,
        total_amount: Number(row.price_amount || 0) * billableUnits,
      }
    })
    const totalAddonAmount = addonOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
    const { namespace, batch } = await ensureBookingStorage(admin, workspaceId, bookingId)
    // Selection is relational. Verify every original, but never duplicate photo bytes.
    await resolvePortalSelectionSources(admin, workspaceId, bookingId, gallery)
    const items: Record<string, unknown>[] = gallery.map((file) => ({
      selection_id: selection.id,
      gallery_file_id: file.id,
      enhancement_preference: preferenceMap.get(String(file.id)) || 'standard',
      is_extra_edit: extras.includes(String(file.id)),
    }))
    const allocationRows: Record<string, unknown>[] = []
    for (const allocation of printAllocations) {
      const file = gallery.find((item) => String(item.id) === allocation.fileId)
      if (!file) throw new Error('A print allocation references an unknown photo.')
      allocationRows.push({
        workspace_id: workspaceId,
        booking_id: bookingId,
        selection_id: selection.id,
        gallery_file_id: file.id,
        category: allocation.category,
        quantity: allocation.quantity,
        label_snapshot: PRINT_CATEGORY_LABELS[allocation.category],
        storage_provider: 'r2',
        storage_status: 'unavailable',
      })
    }
    for (const table of ['photo_selection_items', 'print_allocations', 'client_addon_orders']) {
      const { error: deleteError } = await admin.from(table).delete().eq('selection_id', selection.id)
      if (deleteError) throw new Error(deleteError.message)
    }
    const { error: itemError } = await admin.from('photo_selection_items').insert(items)
    if (itemError) throw new Error(itemError.message)
    if (allocationRows.length) {
      const { error: allocationError } = await admin.from('print_allocations').insert(allocationRows)
      if (allocationError) throw new Error(allocationError.message)
    }
    if (addonOrders.length) {
      const { error: addonOrderError } = await admin.from('client_addon_orders').insert(addonOrders)
      if (addonOrderError) throw new Error(addonOrderError.message)
    }
    const submittedAt = nowIso()
    const updates = await Promise.all([
      admin
        .from('editing_jobs')
        .update({ status: 'WAITING_FOR_SELECTION', selected_count: unique.length, expected_output_count: unique.length, last_error: null, updated_at: submittedAt })
        .eq('booking_id', bookingId),
      admin
        .from('bookings')
        .update({
          raw_photo_status: 'Pending Review',
          raw_photo_submitted_at: submittedAt,
          raw_photo_approved_at: null,
          raw_photo_notes: null,
        })
        .eq('id', bookingId),
    ])
    for (const result of updates) if (result.error) throw new Error(result.error.message)
    // Only lock the selection once validation, print instructions and associated saves succeeded.
    const { data: finalized, error: finalizeError } = await admin.from('photo_selections').update({
      status: 'SUBMITTED',
      client_status: 'Submitted',
      included_limit: includedLimit,
      no_revision_acknowledged: true,
      no_revision_acknowledged_at: submittedAt,
      total_addon_amount: totalAddonAmount,
      submitted_at: submittedAt,
      updated_at: submittedAt,
    }).eq('id', selection.id).eq('status', 'SUBMITTING').select('id').maybeSingle()
    if (finalizeError || !finalized) throw new Error(finalizeError?.message || 'Selection could not be finalized.')
    submitted = true
    await audit(admin, workspaceId, { type: 'client', id: publicId }, 'SELECTION_SUBMITTED', {
      bookingId,
      batchId: batch.id,
      metadata: { galleryFileIds: unique, includedFileIds: included, extraEditFileIds: extras, printAllocations, totalAddonAmount },
    })
    await audit(admin, workspaceId, { type: 'system' }, 'SELECTED_FILES_VALIDATED', {
      bookingId,
      batchId: batch.id,
      metadata: { storagePrefix: namespace.rawPrefix, selectedFiles: items.length, printsAwaitingEnhancedUpload: true, destructive: false },
    })
    return await getPortalData(publicId)
  } catch (selectionError) {
    if (submitted) {
      console.error('Submitted selection refresh failed:', selectionError)
      throw new PortalSelectionError('Your selection was submitted, but the updated portal could not be loaded. Try: refresh the portal to see your submitted selection.', 'SELECTION_SUBMITTED_REFRESH_FAILED')
    }
    const message = selectionError instanceof Error ? selectionError.message : 'Selected photo validation failed.'
    const { error: resetError } = await admin.from('photo_selections').update({
      status: selectionError instanceof PortalSelectionError && selectionError.code === 'SELECTION_INVALID' ? 'OPEN' : 'COPY_FAILED',
      updated_at: nowIso(),
    }).eq('id', selection.id).eq('status', 'SUBMITTING')
    if (resetError) console.error('Selection retry state could not be saved:', resetError.message)
    await admin.from('editing_jobs').update({ last_error: message, updated_at: nowIso() }).eq('booking_id', bookingId)
    await audit(admin, workspaceId, { type: 'system' }, 'SELECTION_VALIDATION_FAILED', {
      bookingId,
      metadata: { error: message },
    })
    if (selectionError instanceof PortalSelectionError) throw selectionError
    console.error('Portal selection submission failed:', selectionError)
    throw new PortalSelectionError('Your selection could not be completed. Try: submit again in a moment. If it still fails, ask the studio to check your photos in Client Portals.', 'SELECTION_SUBMISSION_FAILED', 503)
  }
}

const ALLOWED_JOB_TRANSITIONS: Record<EditingJobStatus, EditingJobStatus[]> = {
  WAITING_FOR_SELECTION: [],
  READY_FOR_EDITING: ['DOWNLOADED', 'EDITING'],
  DOWNLOADED: ['EDITING', 'READY_TO_UPLOAD'],
  EDITING: ['READY_TO_UPLOAD'],
  READY_TO_UPLOAD: ['EDITING', 'UPLOADING'],
  UPLOADING: ['DELIVERED', 'UPLOAD_FAILED'],
  DELIVERED: [],
  UPLOAD_FAILED: ['READY_TO_UPLOAD', 'UPLOADING'],
}

export async function setEditingJobStatus(
  workspaceId: string,
  bookingId: string,
  next: EditingJobStatus,
  actorId: string,
) {
  const admin = adminClient()
  const { data: job, error } = await admin
    .from('editing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (error || !job) throw new Error(error?.message || 'Editing job not found.')
  const current = job.status as EditingJobStatus
  if (current !== next && !ALLOWED_JOB_TRANSITIONS[current]?.includes(next)) {
    throw new Error(`Invalid editor transition: ${current} to ${next}.`)
  }
  const timestamp = nowIso()
  const patch: Record<string, unknown> = { status: next, last_error: null, updated_at: timestamp }
  if (next === 'EDITING' && !job.editing_started_at) patch.editing_started_at = timestamp
  if (next === 'READY_TO_UPLOAD') patch.ready_to_upload_at = timestamp
  const { error: updateError } = await admin.from('editing_jobs').update(patch).eq('id', job.id)
  if (updateError) throw new Error(updateError.message)
  const clientStatus = next === 'READY_FOR_EDITING'
    ? 'Submitted'
    : next === 'DOWNLOADED' || next === 'EDITING'
      ? 'Editing'
      : next === 'READY_TO_UPLOAD'
        ? 'Ready for Printing'
        : next === 'UPLOADING' || next === 'DELIVERED'
          ? 'Ready for Release'
          : null
  if (clientStatus) {
    const { error: selectionError } = await admin
      .from('photo_selections')
      .update({ client_status: clientStatus, updated_at: timestamp })
      .eq('workspace_id', workspaceId)
      .eq('booking_id', bookingId)
    if (selectionError) throw new Error(selectionError.message)
  }
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, next === 'EDITING' ? 'EDITING_STARTED' : `JOB_STATUS_${next}`, {
    bookingId,
    batchId: job.batch_id,
    metadata: { from: current, to: next },
  })
  return { success: true }
}

export async function setClientSelectionStatus(
  workspaceId: string,
  bookingId: string,
  status: 'Not Started' | 'Selection In Progress' | 'Submitted' | 'Editing' | 'Ready for Printing' | 'Ready for Release' | 'Released',
  actorId: string,
) {
  const admin = adminClient()
  const timestamp = nowIso()
  const { data, error } = await admin
    .from('photo_selections')
    .update({ client_status: status, updated_at: timestamp })
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .select('id,client_status')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Photo selection not found.')
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'CLIENT_SELECTION_STATUS_UPDATED', {
    bookingId,
    metadata: { status },
  })
  return { success: true, status: String(data.client_status) }
}

export async function getWorkflowMembers(workspaceId: string) {
  const admin = adminClient()
  const { data: members, error } = await admin
    .from('workspace_members')
    .select('user_id,role,display_name,created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const userIds = new Set((members || []).map((member) => String(member.user_id)))
  const users = new Map<string, { email?: string | null }>()
  let page = 1
  while (userIds.size && page <= 10) {
    const { data, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (usersError) throw new Error(usersError.message)
    for (const user of data.users) {
      if (userIds.has(user.id)) users.set(user.id, { email: user.email })
    }
    if (data.users.length < 100 || users.size >= userIds.size) break
    page += 1
  }
  return (members || []).map((member) => {
    const user = users.get(String(member.user_id))
    const email = String(user?.email || '')
    return {
      id: String(member.user_id),
      role: String(member.role),
      displayName: String(member.display_name || email.split('@')[0] || member.role),
      email,
    }
  })
}

export async function assignEditingJob(
  workspaceId: string,
  bookingId: string,
  actorId: string,
  assigneeId: string | null,
  allowReassign: boolean,
) {
  const admin = adminClient()
  const { data: job, error } = await admin
    .from('editing_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (error || !job) throw new Error(error?.message || 'Editing job not found.')
  if (job.assigned_editor_id && job.assigned_editor_id !== actorId && !allowReassign) {
    throw new Error('This job is already assigned to another editor.')
  }
  if (job.assigned_editor_id === assigneeId) {
    return {
      success: true,
      assignedEditorId: assigneeId,
      assignedEditorName: job.assigned_editor_name ? String(job.assigned_editor_name) : null,
    }
  }

  let assigneeName: string | null = null
  if (assigneeId) {
    const { data: member, error: memberError } = await admin
      .from('workspace_members')
      .select('user_id,role,display_name')
      .eq('workspace_id', workspaceId)
      .eq('user_id', assigneeId)
      .in('role', ['owner', 'admin', 'editor'])
      .maybeSingle()
    if (memberError || !member) throw new Error(memberError?.message || 'The assignee is not an editor in this workspace.')
    const { data: userData } = await admin.auth.admin.getUserById(assigneeId)
    assigneeName = String(member.display_name || userData.user?.email?.split('@')[0] || 'Editor')
  }

  const timestamp = nowIso()
  const { error: updateError } = await admin
    .from('editing_jobs')
    .update({
      assigned_editor_id: assigneeId,
      assigned_editor_name: assigneeName,
      claimed_at: assigneeId ? timestamp : null,
      updated_at: timestamp,
    })
    .eq('id', job.id)
  if (updateError) throw new Error(updateError.message)
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'JOB_REASSIGNED', {
    bookingId,
    batchId: job.batch_id,
    metadata: { from: job.assigned_editor_id || null, to: assigneeId, assigneeName },
  })
  return { success: true, assignedEditorId: assigneeId, assignedEditorName: assigneeName }
}

function uniqueClientFolderNames(bookings: Array<{ id: string; name: string }>) {
  const counts = new Map<string, number>()
  for (const booking of bookings) {
    const base = safeSegment(booking.name).toUpperCase() || booking.id
    counts.set(base, (counts.get(base) || 0) + 1)
  }
  return new Map(
    bookings.map((booking) => {
      const base = safeSegment(booking.name).toUpperCase() || booking.id
      return [booking.id, (counts.get(base) || 0) > 1 ? `${base} - ${booking.id}` : base]
    }),
  )
}

export async function prepareBatchDownload(
  workspaceId: string,
  displayId: string,
  actorId: string,
  allowOverride = false,
) {
  const admin = adminClient()
  const batch = await findBatch(admin, workspaceId, displayId)
  const { data: readyJobs, error } = await admin
    .from('editing_jobs')
    .select('*')
    .eq('batch_id', batch.id)
    .in('status', ['READY_FOR_EDITING', 'DOWNLOADED', 'EDITING', 'READY_TO_UPLOAD', 'UPLOAD_FAILED'])
  if (error) throw new Error(error.message)
  const allowedBookingIds = await graduationBookingIds(admin, workspaceId, (readyJobs || []).map(job => String(job.booking_id)))
  const now = Date.now()
  const jobs = (readyJobs || []).filter((job) => {
    if (!allowedBookingIds.has(String(job.booking_id))) return false
    if (allowOverride) return true
    const lockedElsewhere =
      job.download_locked_by !== actorId &&
      job.download_lock_expires_at &&
      new Date(job.download_lock_expires_at).getTime() > now
    return !lockedElsewhere
  })
  if (!jobs.length) throw new Error('No downloadable selected clients are available in this batch.')
  const lockExpiresAt = new Date(now + 2 * 60 * 60 * 1000).toISOString()
  const { error: lockError } = await admin
    .from('editing_jobs')
    .update({ download_locked_by: actorId, download_lock_expires_at: lockExpiresAt, updated_at: nowIso() })
    .in('id', jobs.map((job) => job.id))
    .eq('status', 'READY_FOR_EDITING')
  if (lockError) throw new Error(lockError.message)
  const bookingIds = jobs.map((job) => String(job.booking_id))
  const [{ data: bookings }, { data: portals }, { data: selections }] = await Promise.all([
    admin.from('bookings').select('id,customer_name').in('id', bookingIds),
    admin.from('client_portals').select('booking_id,public_id').in('booking_id', bookingIds),
    admin.from('photo_selections').select('id,booking_id').in('booking_id', bookingIds),
  ])
  const names = uniqueClientFolderNames(
    (bookings || []).map((booking) => ({ id: String(booking.id), name: String(booking.customer_name) })),
  )
  const selectionIds = (selections || []).map((selection) => selection.id)
  const { data: items, error: itemsError } = await admin
    .from('photo_selection_items')
    .select('selection_id,gallery_file_id')
    .in('selection_id', selectionIds)
  if (itemsError) throw new Error(itemsError.message)
  const galleryIds = (items || []).map((item) => item.gallery_file_id)
  const { data: gallery, error: galleryError } = galleryIds.length
    ? await admin.from('gallery_files').select('id,file_name,storage_key').in('id', galleryIds).eq('storage_status', 'available')
    : { data: [], error: null }
  if (galleryError) throw new Error(galleryError.message)
  const galleryMap = new Map((gallery || []).map((file) => [String(file.id), file]))
  const selectionMap = new Map((selections || []).map((selection) => [String(selection.booking_id), String(selection.id)]))
  const portalMap = new Map((portals || []).map((portal) => [String(portal.booking_id), String(portal.public_id)]))
  const { data: storageRows, error: storageError } = await admin.from('booking_provisioning')
    .select('booking_id,storage_prefix,storage_status').in('booking_id', bookingIds)
  if (storageError) throw new Error('The booking storage state could not be loaded.')
  const storageMap = new Map((storageRows || []).map((state) => [String(state.booking_id), state]))
  // One scoped query for the batch, including week/month collections; no per-client read loop.
  const { data: savedPrints, error: printsError } = await admin.from('print_allocations')
    .select('selection_id,category,gallery_file_id,quantity').eq('workspace_id', workspaceId)
    .in('selection_id', selectionIds).order('category')
  if (printsError) throw new Error('The print instructions could not be loaded. Try: download this batch again.')
  const printManifests = new Map<string, PrintManifest>()
  for (const bookingId of bookingIds) {
    const selectionId = selectionMap.get(bookingId)
    if (!selectionId) throw new Error('A client selection is missing. Try: refresh the editing queue, then download again.')
    printManifests.set(bookingId, buildPrintManifest({
      bookingId, selectionId, allocations: (savedPrints || []).filter(row => String(row.selection_id) === selectionId),
      gallery: (gallery || []).filter(file => (items || []).some(item => item.selection_id === selectionId && item.gallery_file_id === file.id)),
    }))
  }
  const manifest = {
    schema_version: 1,
    workspace_id: workspaceId,
    batch_id: displayId,
    shoot_date: String(batch.shoot_date),
    location_key: String(batch.location_key),
    generated_at: nowIso(),
    clients: jobs.map((job) => {
      const booking = (bookings || []).find((row) => row.id === job.booking_id)
      return {
        booking_id: String(job.booking_id),
        client_id: String(job.client_id),
        folder_name: names.get(String(job.booking_id)) || String(job.booking_id),
        selected_count: Number(job.selected_count),
        expected_output_count: Number(job.expected_output_count),
        storage_prefix: storageMap.get(String(job.booking_id))?.storage_prefix || null,
        portal_id: portalMap.get(String(job.booking_id)) || null,
        customer_name: String(booking?.customer_name || job.booking_id),
        print_manifest: printManifests.get(String(job.booking_id)),
      }
    }),
  }
  const entries: Array<{ name: string; data?: Buffer; storageKey?: string }> = [
    { name: `${batch.shoot_date}/manifest.json`, data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
  ]
  for (const job of jobs) {
    const folderName = names.get(String(job.booking_id)) || String(job.booking_id)
    const clientMeta = manifest.clients.find((client) => client.booking_id === job.booking_id)
    entries.push({
      name: `${batch.shoot_date}/${folderName}/.fico-client.json`,
      data: Buffer.from(JSON.stringify(clientMeta, null, 2), 'utf8'),
    })
    entries.push({ name: `${batch.shoot_date}/${folderName}/EDITED/`, data: Buffer.alloc(0) })
    const selectionId = selectionMap.get(String(job.booking_id))
    entries.push({
      name: `${batch.shoot_date}/${folderName}/SELECTED/manifest.json`,
      data: Buffer.from(JSON.stringify(printManifests.get(String(job.booking_id)), null, 2), 'utf8'),
    })
    entries.push({ name: `${batch.shoot_date}/${folderName}/SELECTED/PRINTS/`, data: Buffer.alloc(0) })
    for (const item of (items || []).filter((row) => String(row.selection_id) === selectionId)) {
      const file = galleryMap.get(String(item.gallery_file_id))
      if (!file) continue
      entries.push({
        name: `${batch.shoot_date}/${folderName}/SELECTED/${safeSegment(String(file.file_name)) || file.id}`,
        storageKey: String(file.storage_key),
      })
    }
  }
  return { fileName: `${displayId}.zip`, batch, jobs, manifest, entries }
}

export async function markBatchDownloaded(workspaceId: string, batchId: string, jobs: Array<Record<string, unknown>>, actorId: string) {
  const admin = adminClient()
  const timestamp = nowIso()
  await admin
    .from('editing_jobs')
    .update({
      status: 'DOWNLOADED',
      downloaded_at: timestamp,
      downloaded_by: actorId,
      download_locked_by: null,
      download_lock_expires_at: null,
      updated_at: timestamp,
    })
    .in('id', jobs.map((job) => job.id))
    .eq('status', 'READY_FOR_EDITING')
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'BATCH_DOWNLOADED', {
    batchId,
    metadata: {
      clientCount: jobs.length,
      bookingIds: jobs.map((job) => job.booking_id),
      selectedPhotos: jobs.reduce((sum, job) => sum + Number(job.selected_count || 0), 0),
    },
  })
}

function dateInDownloadScope(date: string, scope: DownloadScope, key: string) {
  if (scope === 'day') return date === key
  if (scope === 'month') return date.startsWith(`${key}-`) || date.startsWith(key)
  const start = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return false
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  const current = new Date(`${date}T00:00:00Z`)
  return current >= start && current < end
}

export async function prepareBatchCollectionDownload(
  workspaceId: string,
  scope: DownloadScope,
  key: string,
  actorId: string,
  allowOverride = false,
) {
  const batches = (await getBatchList(workspaceId)).filter((batch) =>
    dateInDownloadScope(batch.shootDate, scope, key),
  )
  const prepared: Awaited<ReturnType<typeof prepareBatchDownload>>[] = []
  for (const batch of batches) {
    const downloadable = batch.counts.readyForEditing + batch.counts.downloaded + batch.counts.editing + batch.counts.readyToUpload + batch.counts.failed
    if (downloadable === 0) continue
    try {
      prepared.push(await prepareBatchDownload(workspaceId, batch.id, actorId, allowOverride))
    } catch (error) {
      if (!/No downloadable selected clients/.test(error instanceof Error ? error.message : '')) throw error
    }
  }
  if (!prepared.length) throw new Error(`No downloadable jobs are available for this ${scope}.`)
  const manifest = {
    schema_version: 1,
    scope,
    key,
    workspace_id: workspaceId,
    generated_at: nowIso(),
    batches: prepared.map((item) => item.manifest),
  }
  return {
    fileName: `FICO-MANA-${scope.toUpperCase()}-${key}.zip`,
    entries: [
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
      ...prepared.flatMap((item) => item.entries),
    ],
    prepared,
  }
}

export async function createBatchUploadRun(
  workspaceId: string,
  displayId: string,
  clients: Array<{ bookingId: string; expectedFiles: number }>,
  actorId: string,
) {
  const admin = adminClient()
  const batch = await findBatch(admin, workspaceId, displayId)
  const uniqueIds = [...new Set(clients.map((client) => client.bookingId))]
  if (!uniqueIds.length) throw new Error('Choose at least one client folder to upload.')
  if (uniqueIds.length !== clients.length) throw new Error('Each client folder may appear only once per upload run.')
  if (uniqueIds.length > 500) throw new Error('One upload run is limited to 500 client folders.')
  const eligibleIds = await graduationBookingIds(admin, workspaceId, uniqueIds)
  if (eligibleIds.size !== uniqueIds.length) throw new GraduationWorkflowOnlyError()
  const expectedByBooking = new Map(clients.map((client) => [client.bookingId, client.expectedFiles]))
  const { data: jobs, error } = await admin
    .from('editing_jobs')
    .select('*')
    .eq('batch_id', batch.id)
    .in('booking_id', uniqueIds)
  if (error) throw new Error(error.message)
  if (!jobs?.length || jobs.length !== uniqueIds.length) throw new Error('Some clients are not part of this batch. Try: select the correct batch folder.')
  const invalid = jobs.find((job) => !['DOWNLOADED', 'EDITING', 'READY_TO_UPLOAD', 'UPLOAD_FAILED'].includes(job.status))
  if (invalid) throw new Error(`${invalid.booking_id} is not ready for deliverable upload.`)
  const { data: run, error: runError } = await admin
    .from('batch_upload_jobs')
    .insert({ workspace_id: workspaceId, batch_id: batch.id, status: 'RUNNING', total_clients: jobs.length })
    .select('*')
    .single()
  if (runError || !run) throw new Error(runError?.message || 'Could not start the batch upload.')
  const { error: itemError } = await admin.from('batch_upload_items').insert(
    jobs.map((job) => ({
      upload_job_id: run.id,
      editing_job_id: job.id,
      booking_id: job.booking_id,
      status: 'PENDING',
      expected_files: expectedByBooking.get(String(job.booking_id)),
    })),
  )
  if (itemError) throw new Error(itemError.message)
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'BATCH_UPLOAD_STARTED', {
    batchId: batch.id,
    metadata: { uploadJobId: run.id, clients },
  })
  return { uploadJobId: String(run.id) }
}

async function reserveEnhancedUpload(admin: SupabaseClient, workspaceId: string, item: { id: string; editing_job_id: string }, input: UploadFileInput) {
  // Reuse the existing per-booking editor lock to serialize names across upload runs.
  const lockUntil = new Date(Date.now() + 120_000).toISOString()
  const { data: lock, error: lockError } = await admin.from('editing_jobs')
    .update({ download_lock_expires_at: lockUntil })
    .eq('id', item.editing_job_id).eq('workspace_id', workspaceId).eq('booking_id', input.bookingId)
    .or(`download_lock_expires_at.is.null,download_lock_expires_at.lte.${nowIso()}`)
    .select('id').maybeSingle()
  if (lockError || !lock) throw new Error('This client is already being processed. Try: wait for the current upload or download, then retry.')
  try {
    // Supabase caps each result page. Older upload runs must still reserve their numbers.
    async function readPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
      const data: T[] = []
      for (let offset = 0; ; offset += 500) {
        if (Date.now() >= Date.parse(lockUntil)) throw new Error('Filename verification took too long. Try: retry this client upload.')
        const page = await query(offset, offset + 499)
        if (page.error) return { data, error: page.error }
        data.push(...(page.data || []))
        if (!page.data || page.data.length < 500) return { data, error: null }
      }
    }
    const [booking, deliveries, reservations] = await Promise.all([
      admin.from('bookings').select('customer_name').eq('workspace_id', workspaceId).eq('id', input.bookingId).single(),
      readPages((from, to) => admin.from('deliverable_files').select('*').eq('workspace_id', workspaceId).eq('booking_id', input.bookingId).eq('storage_status', 'available').order('id').range(from, to)),
      readPages((from, to) => admin.from('batch_upload_files').select('upload_item_id,relative_path,file_name,checksum,status,batch_upload_items!inner(booking_id,editing_job_id)')
        .eq('batch_upload_items.booking_id', input.bookingId).eq('batch_upload_items.editing_job_id', item.editing_job_id).order('id').range(from, to)),
    ])
    if (booking.error || !booking.data || deliveries.error || reservations.error) {
      throw new Error('Could not verify the enhanced-photo filenames. Try: retry this client upload.')
    }
    const activeReservation = (reservations.data || []).find(file =>
      String(file.upload_item_id || '') !== item.id && String(file.status || '') !== 'FAILED' &&
      hasSameFolderFilePath(String(file.relative_path || ''), input.relativePath),
    )
    if (activeReservation) {
      throw new Error(`A file named ${input.fileName} is already uploaded or uploading in this client folder. Rename the new file before uploading.`)
    }
    const prior = (deliveries.data || []).find(file => hasSameFolderFilePath(String(file.relative_path || ''), input.relativePath))
    if (prior && prior.checksum !== input.checksum) {
      throw new Error(`A file named ${input.fileName} already exists in this client folder. Rename the new file before uploading.`)
    }
    const duplicate = prior?.checksum === input.checksum
    const fileName = duplicate ? String(prior.file_name) : enhancedUploadName(
      String(booking.data.customer_name || ''), input.fileName, input.relativePath,
      [...(deliveries.data || []), ...(reservations.data || [])],
    )
    if (Date.now() >= Date.parse(lockUntil)) throw new Error('Filename verification took too long. Try: retry this client upload.')
    const { data: uploadFile, error } = await admin.from('batch_upload_files').upsert({
      upload_item_id: item.id, relative_path: input.relativePath, file_name: fileName,
      file_size: input.fileSize, checksum: input.checksum, storage_key: prior?.storage_key || null,
      storage_provider: 'r2',
      status: duplicate ? 'SKIPPED_DUPLICATE' : 'UPLOADING', attempt_count: 1,
      last_error: null, updated_at: nowIso(),
    }, { onConflict: 'upload_item_id,relative_path' }).select('*').single()
    if (error || !uploadFile) throw new Error(error?.message || 'Could not reserve the enhanced-photo filename.')
    return { prior, uploadFile, fileName, duplicate }
  } finally {
    await admin.from('editing_jobs').update({ download_lock_expires_at: null })
      .eq('id', item.editing_job_id).eq('workspace_id', workspaceId).eq('download_lock_expires_at', lockUntil)
  }
}

export async function createDeliverableUploadSession(
  workspaceId: string,
  displayId: string,
  uploadJobId: string,
  input: UploadFileInput,
) {
  const admin = adminClient()
  const batch = await findBatch(admin, workspaceId, displayId)
  const { data: item, error } = await admin
    .from('batch_upload_items')
    .select('*,editing_jobs!inner(id,batch_id,workspace_id,status,expected_output_count)')
    .eq('upload_job_id', uploadJobId)
    .eq('booking_id', input.bookingId)
    .eq('editing_jobs.batch_id', batch.id)
    .eq('editing_jobs.workspace_id', workspaceId)
    .maybeSingle()
  if (error || !item) throw new Error(error?.message || 'Upload client is not part of this batch run.')
  const relativePath = safeRelativePath(input.relativePath)
  const checksum = input.checksum.toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('A SHA-256 file checksum is required.')
  if (input.fileSize <= 0) throw new Error('Empty files cannot be uploaded.')
  if (input.fileSize > 500 * 1024 * 1024) throw new Error('Edited photo files are limited to 500 MB each.')
  validateEditedPhotoMetadata(input.fileName, input.mimeType)
  const expectedFileName = relativePath.split('/').at(-1)
  if (safeSegment(input.fileName) !== expectedFileName) {
    throw new Error('The edited photo filename must match its relative upload path.')
  }
  const { data: runFiles, error: quotaError } = await admin
    .from('batch_upload_files')
    .select('relative_path,file_size,batch_upload_items!inner(upload_job_id,booking_id)')
    .eq('batch_upload_items.upload_job_id', uploadJobId)
  if (quotaError) throw new Error('Could not verify the upload quota.')
  const currentFiles = runFiles || []
  const priorPath = currentFiles.find((file) => {
    const relation = Array.isArray(file.batch_upload_items) ? file.batch_upload_items[0] : file.batch_upload_items
    return String(relation?.booking_id || '') === input.bookingId && String(file.relative_path) === relativePath
  })
  const projectedCount = currentFiles.length + (priorPath ? 0 : 1)
  const projectedBytes = currentFiles.reduce((sum, file) => sum + Number(file.file_size || 0), 0)
    - Number(priorPath?.file_size || 0)
    + input.fileSize
  const bookingFiles = currentFiles.filter((file) => {
    const relation = Array.isArray(file.batch_upload_items) ? file.batch_upload_items[0] : file.batch_upload_items
    return String(relation?.booking_id || '') === input.bookingId
  })
  if (projectedCount > 10_000 || projectedBytes > 250 * 1024 * 1024 * 1024) {
    throw new Error('This batch upload exceeds the safe file-count or total-size quota.')
  }
  if (bookingFiles.length + (priorPath ? 0 : 1) > 1_000) {
    throw new Error('This client folder exceeds the safe per-booking file quota.')
  }
  const { prior, uploadFile, fileName, duplicate } = await reserveEnhancedUpload(admin, workspaceId, item, { ...input, relativePath, checksum })
  await admin
    .from('batch_upload_items')
    .update({ status: 'UPLOADING', attempt_count: Number(item.attempt_count || 0) + 1, updated_at: nowIso() })
    .eq('id', item.id)
  await admin.from('editing_jobs').update({ status: 'UPLOADING', last_error: null, updated_at: nowIso() }).eq('id', item.editing_job_id)
  if (duplicate) {
    return { uploadFileId: String(uploadFile.id), fileName, duplicate: true, storageKey: String(prior!.storage_key) }
  }
  try {
    const { booking } = await ensureBookingStorage(admin, workspaceId, input.bookingId)
    const storageKey = createStorageKey({
      workspaceId,
      bookingId: input.bookingId,
      shootDate: String(booking.booking_date),
      category: 'enhanced',
      objectId: String(uploadFile.id),
      fileName,
    })
    const metadata = {
      bookingid: input.bookingId,
      relativepath: relativePath,
      filename: fileName,
      sha256: checksum,
    }
    const { error: keyError } = await admin.from('batch_upload_files')
      .update({ storage_key: storageKey, storage_provider: 'r2', updated_at: nowIso() })
      .eq('id', uploadFile.id).eq('upload_item_id', item.id)
    if (keyError) throw new Error(keyError.message)

    if (input.fileSize >= MULTIPART_THRESHOLD_BYTES) {
      const multipart = await createMultipartUpload({
        key: storageKey,
        contentType: input.mimeType || 'application/octet-stream',
        checksum,
        metadata,
      })
      const partCount = Math.ceil(input.fileSize / MULTIPART_PART_BYTES)
      const parts = await Promise.all(Array.from({ length: partCount }, async (_, index) => ({
        partNumber: index + 1,
        url: await createMultipartPartUrl({ key: storageKey, uploadId: multipart.uploadId, partNumber: index + 1 }),
      })))
      const { error: sessionError } = await admin.from('storage_multipart_uploads').insert({
        workspace_id: workspaceId,
        booking_id: input.bookingId,
        storage_key: storageKey,
        upload_id: multipart.uploadId,
        category: 'enhanced',
        expected_size: input.fileSize,
        expected_checksum: checksum,
        mime_type: input.mimeType || 'application/octet-stream',
        original_filename: fileName,
        status: 'uploading',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      if (sessionError) throw new Error(sessionError.message)
      return { uploadFileId: String(uploadFile.id), fileName, storageKey, duplicate: false,
        upload: { mode: 'multipart' as const, uploadId: multipart.uploadId, partSize: MULTIPART_PART_BYTES, parts } }
    }

    const upload = await createUploadUrl({
      key: storageKey,
      contentType: input.mimeType || 'application/octet-stream',
      checksum,
      metadata,
    })
    return { uploadFileId: String(uploadFile.id), fileName, storageKey, duplicate: false,
      upload: { mode: 'single' as const, url: upload.url, headers: upload.headers } }
  } catch (uploadError) {
    const message = uploadError instanceof Error ? uploadError.message : 'Could not initialize the private file upload.'
    await Promise.all([
      admin.from('batch_upload_files').update({ status: 'FAILED', last_error: message.slice(0, 1000), updated_at: nowIso() }).eq('id', uploadFile.id),
      admin.from('batch_upload_items').update({ status: 'FAILED', last_error: message.slice(0, 1000), updated_at: nowIso() }).eq('id', item.id),
      admin.from('editing_jobs').update({ status: 'UPLOAD_FAILED', last_error: message.slice(0, 1000), updated_at: nowIso() }).eq('id', item.editing_job_id),
    ])
    throw uploadError
  }
}

export async function completeDeliverableUpload(
  workspaceId: string,
  uploadJobId: string,
  uploadFileId: string,
  completion: {
    storageKey: string
    mimeType: string
    uploadId?: string
    parts?: Array<{ partNumber: number; etag: string }>
  },
) {
  const admin = adminClient()
  const { data: uploadFile, error } = await admin
    .from('batch_upload_files')
    .select('*,batch_upload_items!inner(id,upload_job_id,booking_id,editing_job_id)')
    .eq('id', uploadFileId)
    .eq('batch_upload_items.upload_job_id', uploadJobId)
    .single()
  if (error || !uploadFile) throw new Error(error?.message || 'Upload file state not found.')
  // Authorize before any lookup of a caller-supplied storage key.
  const { data: job } = await admin
    .from('editing_jobs')
    .select('id,workspace_id')
    .eq('id', uploadFile.batch_upload_items.editing_job_id)
    .eq('workspace_id', workspaceId)
    .eq('booking_id', uploadFile.batch_upload_items.booking_id)
    .single()
  if (!job) throw new Error('Upload job is outside this workspace.')
  const bookingId = String(uploadFile.batch_upload_items.booking_id)
  if (completion.storageKey !== uploadFile.storage_key) {
    throw new Error('The uploaded file does not match the selected batch.')
  }
  const parsedKey = assertStorageKeyOwnership(completion.storageKey, workspaceId, bookingId)
  if (parsedKey.category !== 'enhanced') throw new Error('The upload destination is invalid.')

  if (completion.uploadId) {
    const { data: session, error: sessionError } = await admin.from('storage_multipart_uploads')
      .select('*').eq('workspace_id', workspaceId).eq('booking_id', bookingId)
      .eq('storage_key', completion.storageKey).eq('upload_id', completion.uploadId)
      .eq('status', 'uploading').gt('expires_at', nowIso()).maybeSingle()
    if (sessionError || !session) throw new Error('The multipart upload session expired. Try: upload this file again.')
    await completeMultipartUpload({
      key: completion.storageKey,
      uploadId: completion.uploadId,
      parts: completion.parts || [],
    })
    await admin.from('storage_multipart_uploads').update({ status: 'completed', completed_at: nowIso() }).eq('id', session.id)
  }

  const object = await getObjectMetadata(completion.storageKey)
  if (object.metadata.bookingid !== bookingId || object.metadata.relativepath !== uploadFile.relative_path ||
      object.metadata.sha256 !== uploadFile.checksum || object.metadata.filename !== uploadFile.file_name) {
    throw new Error('The uploaded file metadata does not match the selected batch.')
  }
  validateEditedPhotoMetadata(uploadFile.file_name, object.contentType || completion.mimeType)
  const expectedBytes = Number(uploadFile.file_size || 0)
  if (!expectedBytes || !Number.isSafeInteger(object.contentLength) || object.contentLength !== expectedBytes) {
    await audit(admin, workspaceId, { type: 'system' }, 'UPLOAD_CHECKSUM_FAILED', {
      bookingId,
      metadata: { uploadFileId: uploadFile.id, reason: 'size_mismatch' },
    })
    throw new Error('The uploaded file size is incorrect. Try: upload the original edited file again.')
  }
  const verified = object.checksum === uploadFile.checksum
    ? { size: object.contentLength, sha256: object.checksum }
    : await hashObjectSha256(completion.storageKey, 500 * 1024 * 1024)
  if (verified.size !== expectedBytes || verified.sha256 !== uploadFile.checksum) {
    await audit(admin, workspaceId, { type: 'system' }, 'UPLOAD_CHECKSUM_FAILED', {
      bookingId,
      metadata: { uploadFileId: uploadFile.id, reason: 'sha256_mismatch' },
    })
    throw new Error('The uploaded file could not be verified. Try: upload the original edited file again.')
  }
  const { error: deliveryError } = await admin.from('deliverable_files').upsert(
    {
      workspace_id: workspaceId,
      booking_id: bookingId,
      editing_job_id: job.id,
      storage_provider: 'r2',
      storage_key: completion.storageKey,
      storage_status: 'available',
      etag: object.etag,
      relative_path: uploadFile.relative_path,
      file_name: uploadFile.file_name,
      mime_type: object.contentType || completion.mimeType || 'application/octet-stream',
      file_size: object.contentLength,
      checksum: uploadFile.checksum,
      published_at: nowIso(),
    },
    { onConflict: 'booking_id,relative_path' },
  )
  if (deliveryError) throw new Error(deliveryError.message)
  await admin
    .from('batch_upload_files')
    .update({ storage_key: completion.storageKey, storage_provider: 'r2', status: 'UPLOADED', last_error: null, updated_at: nowIso() })
    .eq('id', uploadFileId)
  return { success: true }
}

export async function failDeliverableUpload(workspaceId: string, uploadJobId: string, uploadFileId: string, message: string) {
  const admin = adminClient()
  const { data: file } = await admin
    .from('batch_upload_files')
    .select('*,batch_upload_items!inner(id,upload_job_id,booking_id,editing_job_id,editing_jobs!inner(workspace_id))')
    .eq('id', uploadFileId)
    .eq('batch_upload_items.upload_job_id', uploadJobId)
    .eq('batch_upload_items.editing_jobs.workspace_id', workspaceId)
    .maybeSingle()
  if (!file) return
  await admin
    .from('batch_upload_files')
    .update({ status: 'FAILED', last_error: message.slice(0, 1000), updated_at: nowIso() })
    .eq('id', uploadFileId)
  await admin
    .from('batch_upload_items')
    .update({ status: 'FAILED', last_error: message.slice(0, 1000), updated_at: nowIso() })
    .eq('id', file.batch_upload_items.id)
  await admin
    .from('editing_jobs')
    .update({ status: 'UPLOAD_FAILED', last_error: message.slice(0, 1000), updated_at: nowIso() })
    .eq('id', file.batch_upload_items.editing_job_id)
}

export async function finalizeClientUpload(
  workspaceId: string,
  displayId: string,
  uploadJobId: string,
  bookingId: string,
  actorId: string,
) {
  const admin = adminClient()
  const batch = await findBatch(admin, workspaceId, displayId)
  const { data: item, error } = await admin
    .from('batch_upload_items')
    .select('*,editing_jobs!inner(*)')
    .eq('upload_job_id', uploadJobId)
    .eq('booking_id', bookingId)
    .eq('editing_jobs.batch_id', batch.id)
    .maybeSingle()
  if (error || !item) throw new Error(error?.message || 'Upload client state not found.')
  const { count: uploadedCount, error: countError } = await admin
    .from('batch_upload_files')
    .select('id', { count: 'exact', head: true })
    .eq('upload_item_id', item.id)
    .in('status', ['UPLOADED', 'SKIPPED_DUPLICATE'])
  if (countError) throw new Error(countError.message)
  const expected = Number(item.expected_files || item.editing_jobs.expected_output_count || 0)
  const uploaded = uploadedCount || 0
  const complete = uploaded >= expected && expected > 0
  const timestamp = nowIso()
  if (!complete) {
    const message = `The selected folder contained ${expected} edited files, but only ${uploaded} were registered. Retry the failed files.`
    await admin
      .from('batch_upload_items')
      .update({ status: 'FAILED', uploaded_files: uploaded, last_error: message, updated_at: timestamp })
      .eq('id', item.id)
    await admin
      .from('editing_jobs')
      .update({ status: 'UPLOAD_FAILED', last_error: message, updated_at: timestamp })
      .eq('id', item.editing_job_id)
    await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'UPLOAD_FAILED', {
      bookingId,
      batchId: batch.id,
      metadata: { expected, uploaded, missing: Math.max(0, expected - uploaded), uploadJobId },
    })
    return { bookingId, status: 'UPLOAD_FAILED', expected, uploaded, error: message }
  }
  // Reuse the existing exclusive editor-work lock, so concurrent finalization cannot duplicate prints.
  const printLockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { data: printLock, error: printLockError } = await admin.from('editing_jobs')
    .update({ download_locked_by: actorId, download_lock_expires_at: printLockUntil })
    .eq('id', item.editing_job_id).eq('workspace_id', workspaceId).eq('booking_id', bookingId)
    .or(`download_lock_expires_at.is.null,download_lock_expires_at.lte.${nowIso()}`)
    .select('id').maybeSingle()
  if (printLockError || !printLock) {
    throw new Error('This client is already being processed. Try: wait for the current upload or download to finish, then retry. An interrupted print run unlocks after 10 minutes.')
  }
  try {
    await fulfillBookingPrints({
      admin, workspaceId, bookingId, editingJobId: String(item.editing_job_id), uploadItemId: String(item.id),
    })
  } catch (printError) {
    const detail = printError instanceof Error ? printError.message : 'The print copies could not be prepared.'
    const message = `Enhanced photos uploaded, but prints are not ready. ${detail}${/Try:/i.test(detail) ? '' : ' Try: check private storage, then retry this client upload.'}`
    await Promise.all([
      admin.from('batch_upload_items').update({ status: 'FAILED', uploaded_files: uploaded, last_error: message, updated_at: timestamp }).eq('id', item.id),
      admin.from('editing_jobs').update({ status: 'UPLOAD_FAILED', last_error: message, updated_at: timestamp }).eq('id', item.editing_job_id),
    ])
    await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'PRINT_PREPARATION_FAILED', {
      bookingId, batchId: batch.id, metadata: { uploadJobId, error: message },
    })
    return { bookingId, status: 'UPLOAD_FAILED', expected, uploaded, error: message }
  } finally {
    await admin.from('editing_jobs').update({ download_locked_by: null, download_lock_expires_at: null })
      .eq('id', item.editing_job_id).eq('workspace_id', workspaceId).eq('download_lock_expires_at', printLockUntil)
  }
  const portal = await ensurePortal(admin, workspaceId, bookingId)
  const clientPortalUrl = portalUrl(String(portal.public_id))
  await Promise.all([
    admin
      .from('batch_upload_items')
      .update({ status: 'DELIVERED', uploaded_files: uploaded, last_error: null, updated_at: timestamp })
      .eq('id', item.id),
    admin
      .from('editing_jobs')
      .update({ status: 'DELIVERED', delivered_at: timestamp, last_error: null, updated_at: timestamp })
      .eq('id', item.editing_job_id),
    admin
      .from('photo_selections')
      .update({ client_status: 'Ready for Release', updated_at: timestamp })
      .eq('workspace_id', workspaceId)
      .eq('booking_id', bookingId),
    admin
      .from('bookings')
      .update({ edited_photo_delivered_at: timestamp })
      .eq('id', bookingId),
  ])
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'DELIVERY_COMPLETED', {
    bookingId,
    batchId: batch.id,
    metadata: { expected, uploaded, uploadJobId, portalId: portal.public_id },
  })
  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).single()
  if (booking && !item.editing_jobs.delivered_at) {
    const emailBooking = {
      id: booking.id,
      customerName: booking.customer_name,
      customerEmail: booking.customer_email,
      packageName: booking.package_name,
      bookingDate: booking.booking_date,
    }
    try {
      await sendEditedPhotosEmail(emailBooking, clientPortalUrl)
    } catch (emailError) {
      console.error('Delivery notification email failed:', emailError)
    }
  }
  return { bookingId, customerName: String(booking?.customer_name || bookingId), status: 'DELIVERED', expected, uploaded }
}

export async function finalizeBatchUpload(workspaceId: string, displayId: string, uploadJobId: string) {
  const admin = adminClient()
  const batch = await findBatch(admin, workspaceId, displayId)
  const { data: run } = await admin
    .from('batch_upload_jobs')
    .select('id')
    .eq('id', uploadJobId)
    .eq('workspace_id', workspaceId)
    .eq('batch_id', batch.id)
    .maybeSingle()
  if (!run) throw new Error('Batch upload run not found in this workspace.')
  const { data: items, error } = await admin
    .from('batch_upload_items')
    .select('*')
    .eq('upload_job_id', uploadJobId)
  if (error) throw new Error(error.message)
  const completed = (items || []).filter((item) => item.status === 'DELIVERED').length
  const failed = (items || []).filter((item) => item.status === 'FAILED').length
  const photosUploaded = (items || []).reduce((sum, item) => sum + Number(item.uploaded_files || 0), 0)
  const status = failed > 0 ? 'PARTIALLY_COMPLETED' : completed === (items || []).length ? 'COMPLETED' : 'RUNNING'
  const completedAt = nowIso()
  await admin
    .from('batch_upload_jobs')
    .update({
      status,
      completed_clients: completed,
      failed_clients: failed,
      photos_uploaded: photosUploaded,
      completed_at: completedAt,
    })
    .eq('id', uploadJobId)
    .eq('workspace_id', workspaceId)
  const { data: allJobs } = await admin.from('editing_jobs').select('status').eq('batch_id', batch.id)
  const batchStatus = deriveBatchStatus((allJobs || []) as Array<{ status: EditingJobStatus }>)
  await admin.from('editing_batches').update({ status: batchStatus, updated_at: completedAt }).eq('id', batch.id)
  return {
    id: uploadJobId,
    status,
    totalClients: (items || []).length,
    completedClients: completed,
    failedClients: failed,
    photosUploaded,
    batchStatus,
    failedBookingIds: (items || []).filter((item) => item.status === 'FAILED').map((item) => String(item.booking_id)),
  }
}

export async function getBatchFailedBookingIds(workspaceId: string, displayId: string) {
  const admin = adminClient()
  const batch = await findBatch(admin, workspaceId, displayId)
  const { data, error } = await admin
    .from('editing_jobs')
    .select('booking_id')
    .eq('batch_id', batch.id)
    .eq('status', 'UPLOAD_FAILED')
  if (error) throw new Error(error.message)
  return (data || []).map((row) => String(row.booking_id))
}

export async function preparePortalDeliverables(publicId: string) {
  const { admin, portal } = await portalRecord(publicId)
  const { data, error } = await admin
    .from('deliverable_files')
    .select('storage_key,file_name')
    .eq('workspace_id', portal.workspace_id)
    .eq('booking_id', portal.booking_id)
    .eq('storage_status', 'available')
    .order('published_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []).map((file) => ({
    name: safeSegment(String(file.file_name)) || String(file.storage_key),
    storageKey: String(file.storage_key),
  }))
}

export async function preparePortalRawPhotos(publicId: string) {
  const { admin, portal } = await portalRecord(publicId)
  const selection = await admin.from('photo_selections').select('status')
    .eq('workspace_id', portal.workspace_id).eq('booking_id', portal.booking_id).maybeSingle()
  if (selection.error) throw new Error(selection.error.message)
  if (!selection.data || selection.data.status !== 'SUBMITTED') {
    throw new PortalSelectionError('Submit your photo selection before downloading all original photos.', 'SELECTION_REQUIRED', 409)
  }
  const { data, error } = await admin.from('gallery_files').select('storage_key,file_name')
    .eq('workspace_id', portal.workspace_id).eq('booking_id', portal.booking_id)
    .eq('storage_provider', 'r2').eq('storage_status', 'available').order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const usedNames = new Map<string, number>()
  return (data || []).map((file) => {
    const baseName = safeSegment(String(file.file_name)) || String(file.storage_key)
    const count = (usedNames.get(baseName.toLowerCase()) || 0) + 1
    usedNames.set(baseName.toLowerCase(), count)
    const duplicateSafeName = count === 1 ? baseName : baseName.replace(/(\.[^.]+)?$/, `-${count}$1`)
    return { name: duplicateSafeName, storageKey: String(file.storage_key) }
  })
}

export function storageDownloadBuffer(storageKey: string) {
  return readObject(storageKey)
}
