import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  copyDriveFile,
  createDriveResumableUpload,
  downloadDriveFile,
  downloadDriveThumbnail,
  ensureShootHierarchy,
  findOrCreateFolder,
  getDriveFile,
  hashDriveFileSha256,
  listDriveFiles,
  upsertDriveFile,
} from '@/lib/google-drive'
import { hasRequiredGoogleDriveScopes } from '@/lib/google-drive-scopes'
import { portalUrl } from '@/lib/client-portal'
import { setPortalExpiryFromDelivery } from '@/lib/booking-provisioning'
import { sendEditedPhotosEmail } from '@/lib/email'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { validateEditedPhotoMetadata } from '@/lib/security/file-validation'

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
  fileIds: string[]
  includedFileIds?: string[]
  extraEditFileIds?: string[]
  preferences?: Array<{ fileId: string; preference: 'standard' | 'less' | 'raw' }>
  printAllocations?: Array<{ category: 'TOGA_PICTURE_4R' | 'ALAMPAY_BARONG_4R' | 'FRAME_8R' | 'WALLET_SIZE'; fileId: string; quantity: number }>
  addons?: Array<{ addonId: string; quantity: number; photoCount: number }>
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
  if (!admin) throw new Error('Database admin client unavailable.')
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

function driveFolderUrl(id: string | null | undefined) {
  return id ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}` : ''
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
    metadata: input.metadata || {},
  })
  if (error) console.error('Workflow audit write failed:', error.message)
}

async function loadActiveBookings(admin: SupabaseClient, workspaceId: string) {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin
      .from('bookings')
      .select(
        'id,workspace_id,client_id,customer_name,customer_email,package_id,package_name,booking_date,booking_time,booking_status,payment_status,price,deposit_amount,selection_limit,raw_photo_status,raw_photo_link,raw_photo_submitted_at,raw_photo_approved_at,edited_photo_link,edited_photo_delivered_at',
      )
      .eq('workspace_id', workspaceId)
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
  const [{ data: selections }, { data: jobs }] = await Promise.all([
    admin.from('photo_selections').select('booking_id').eq('workspace_id', workspaceId),
    admin.from('editing_jobs').select('booking_id').eq('workspace_id', workspaceId),
  ])
  const selectionBookings = new Set((selections || []).map((row) => String(row.booking_id)))
  const jobBookings = new Set((jobs || []).map((row) => String(row.booking_id)))

  const missingSelections = bookings.filter((booking) => !selectionBookings.has(String(booking.id)))
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
  const [bookings, { data: batches, error: batchError }, { data: jobs, error: jobsError }] = await Promise.all([
    synchronize ? syncEditorWorkflow(workspaceId) : loadActiveBookings(admin, workspaceId),
    admin
      .from('editing_batches')
      .select('id,display_id,shoot_date,location_key,drive_day_folder_id,drive_day_folder_url')
      .eq('workspace_id', workspaceId)
      .order('shoot_date', { ascending: false }),
    admin
      .from('editing_jobs')
      .select('batch_id,booking_id,client_id,status,selected_count,assigned_editor_id,assigned_editor_name,photographer_name')
      .eq('workspace_id', workspaceId),
  ])
  if (batchError) throw new Error(batchError.message)
  if (jobsError) throw new Error(jobsError.message)
  const bookingMap = new Map(bookings.map((booking) => [String(booking.id), booking]))

  return (batches || []).map((batch) => {
    const batchJobs = (jobs || []).filter((job) => job.batch_id === batch.id) as Array<Record<string, unknown> & { status: EditingJobStatus }>
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
      driveDayFolderUrl: String(batch.drive_day_folder_url || driveFolderUrl(batch.drive_day_folder_id)),
    }
  })
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

  const [bookingsResult, galleryResult, foldersResult] = await Promise.all([
    admin
      .from('bookings')
      .select('id,customer_name,package_name,booking_time,booking_status')
      .in('id', bookingIds),
    admin
      .from('gallery_files')
      .select('booking_id,created_at')
      .in('booking_id', bookingIds),
    admin
      .from('drive_folders')
      .select('booking_id,drive_folder_id')
      .in('booking_id', bookingIds)
      .eq('folder_type', 'RAW'),
  ])
  if (bookingsResult.error) throw new Error(bookingsResult.error.message)
  if (galleryResult.error) {
    console.error('Onsite summary gallery read failed:', galleryResult.error.message)
  }
  if (foldersResult.error) {
    console.error('Onsite summary Drive folder read failed:', foldersResult.error.message)
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
  const rawFolderByBooking = new Map(
    (foldersResult.error ? [] : foldersResult.data || []).map((folder) => [
      String(folder.booking_id),
      String(folder.drive_folder_id),
    ]),
  )

  const onsiteJobs = (jobs || [])
    .map((job) => {
      const bookingId = String(job.booking_id)
      const booking = bookingMap.get(bookingId)
      if (!booking || ACTIVE_BOOKING_EXCLUSIONS.has(String(booking.booking_status || ''))) return null
      const gallery = galleryByBooking.get(bookingId)
      return {
        bookingId,
        customerName: String(booking.customer_name || bookingId),
        packageName: String(booking.package_name || ''),
        bookingTime: String(booking.booking_time || ''),
        galleryCount: gallery?.count || 0,
        lastUploadAt: gallery?.lastUploadAt || null,
        rawFolderDriveId: rawFolderByBooking.get(bookingId) || null,
        lastError: job.last_error ? String(job.last_error) : null,
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
  const bookingIds = (jobs || []).map((job) => String(job.booking_id))
  if (!bookingIds.length) return { ...listEntry, jobs: [], auditLogs: [] }

  const [bookingsResult, selectionsResult, galleryResult, deliveryResult, foldersResult, auditsResult, reviewsResult] = await Promise.all([
    admin.from('bookings').select('*').in('id', bookingIds),
    admin.from('photo_selections').select('*').in('booking_id', bookingIds),
    admin.from('gallery_files').select('id,booking_id,file_name,created_at').in('booking_id', bookingIds),
    admin.from('deliverable_files').select('booking_id').in('booking_id', bookingIds),
    admin.from('drive_folders').select('*').in('booking_id', bookingIds),
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
    ['Drive folders', foldersResult],
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
        admin.from('client_addon_orders').select('selection_id,name_snapshot,pricing_type_snapshot,unit_price_snapshot,quantity,photo_count,total_amount').in('selection_id', selectionIds),
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
  const folderMap = new Map<string, Record<string, unknown>>()
  for (const folder of foldersResult.data || []) folderMap.set(`${folder.booking_id}:${folder.folder_type}`, folder)

  return {
    ...listEntry,
    jobs: (jobs || []).map((job) => {
      const bookingId = String(job.booking_id)
      const booking = bookingMap.get(bookingId)
      const selection = selectionMap.get(bookingId)
      const selectionId = String(selection?.id || '')
      const folder = (type: string) => folderMap.get(`${bookingId}:${type}`)?.drive_folder_id || null
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
          total: Number(row.total_amount || 0),
        })),
        totalAddonAmount: Number(selection?.total_addon_amount || 0),
        rawFolderDriveId: folder('RAW'),
        selectedFolderDriveId: folder('SELECTED'),
        editedFolderDriveId: folder('EDITED'),
        deliverablesFolderDriveId: folder('DELIVERABLES'),
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
  const { data: runs, error: runsError } = await admin
    .from('batch_upload_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
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
  const foldersResult = bookingIds.length
    ? await admin
        .from('drive_folders')
        .select('booking_id,folder_type,drive_folder_id,web_view_url')
        .in('booking_id', bookingIds)
        .in('folder_type', ['EDITED', 'DELIVERABLES'])
    : { data: [], error: null }
  if (bookingsResult.error) throw new Error(bookingsResult.error.message)
  if (foldersResult.error) throw new Error(foldersResult.error.message)

  const batchMap = new Map((batches || []).map((batch) => [String(batch.id), batch]))
  const bookingMap = new Map((bookingsResult.data || []).map((booking) => [String(booking.id), booking]))
  const folderMap = new Map(
    (foldersResult.data || []).map((folder) => [`${folder.booking_id}:${folder.folder_type}`, folder]),
  )

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
          const edited = folderMap.get(`${bookingId}:EDITED`)
          const deliverables = folderMap.get(`${bookingId}:DELIVERABLES`)
          return {
            bookingId,
            customerName: String(booking?.customer_name || bookingId),
            packageName: String(booking?.package_name || ''),
            status: String(item.status),
            expectedFiles: Number(item.expected_files || 0),
            uploadedFiles: Number(item.uploaded_files || 0),
            lastError: item.last_error ? String(item.last_error) : null,
            updatedAt: String(item.updated_at),
            editedFolderUrl: String(
              edited?.web_view_url || driveFolderUrl(edited?.drive_folder_id),
            ),
            deliverablesFolderUrl: String(
              deliverables?.web_view_url || driveFolderUrl(deliverables?.drive_folder_id),
            ),
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
    .map((folder) => ({ name: safeSegment(folder.name), reason: String(folder.reason || 'No trusted manifest or internal ID matched this folder.') }))
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

async function ensureBookingFolders(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  let { data: booking, error } = await admin
    .from('bookings')
    .select('id,workspace_id,client_id,customer_name,booking_date,selection_limit')
    .eq('id', bookingId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!booking) throw new Error('Booking not found in this workspace.')
  let batchResult = await admin
    .from('editing_batches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('display_id', `FM-BATCH-${booking.booking_date}-MAIN`)
    .maybeSingle()
  if (batchResult.error) throw new Error(batchResult.error.message)
  if (!booking.client_id || !batchResult.data) {
    await syncEditorWorkflow(workspaceId)
    const bookingResult = await admin
      .from('bookings')
      .select('id,workspace_id,client_id,customer_name,booking_date,selection_limit')
      .eq('id', bookingId)
      .eq('workspace_id', workspaceId)
      .single()
    if (bookingResult.error) throw new Error(bookingResult.error.message)
    booking = bookingResult.data
    batchResult = await admin
      .from('editing_batches')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('display_id', `FM-BATCH-${booking.booking_date}-MAIN`)
      .single()
    if (batchResult.error) throw new Error(batchResult.error.message)
  }
  const batch = batchResult.data
  if (!batch) throw new Error('Editing batch could not be prepared for this booking.')
  const { data: provisioning } = await admin
    .from('booking_provisioning')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()
  const hierarchy = await ensureShootHierarchy({
    admin,
    bookingId,
    shootDate: String(booking.booking_date),
    clientName: String(booking.customer_name),
    selectionLimit: Number(booking.selection_limit || 5),
    existingClientFolderId: provisioning?.drive_client_folder_id || null,
  })
  const portal = await ensurePortal(admin, workspaceId, bookingId)
  const { error: provisioningError } = await admin.from('booking_provisioning').upsert({
    booking_id: bookingId,
    workspace_id: workspaceId,
    status: provisioning?.status || 'ACTIVE',
    drive_root_folder_id: hierarchy.root.id,
    drive_month_folder_id: hierarchy.month.id,
    drive_day_folder_id: hierarchy.day.id,
    drive_client_folder_id: hierarchy.client.id,
    drive_client_folder_url: hierarchy.clientUrl,
    client_portal_id: portal.id,
    provisioned_at: provisioning?.provisioned_at || nowIso(),
    last_error: null,
    updated_at: nowIso(),
  })
  if (provisioningError) throw new Error(provisioningError.message)
  await admin
    .from('editing_batches')
    .update({
      drive_day_folder_id: hierarchy.day.id,
      drive_day_folder_url: driveFolderUrl(hierarchy.day.id),
      updated_at: nowIso(),
    })
    .eq('id', batch.id)

  const records = [
    { folder_type: 'ROOT', folder: hierarchy.root, booking_id: null, batch_id: null },
    { folder_type: 'MONTH', folder: hierarchy.month, booking_id: null, batch_id: null },
    { folder_type: 'DAY', folder: hierarchy.day, booking_id: null, batch_id: batch.id },
    { folder_type: 'CLIENT', folder: hierarchy.client, booking_id: bookingId, batch_id: batch.id },
    { folder_type: 'RAW', folder: hierarchy.raw, booking_id: bookingId, batch_id: batch.id },
    { folder_type: 'SELECTED', folder: hierarchy.selected, booking_id: bookingId, batch_id: batch.id },
    { folder_type: 'EDITED', folder: hierarchy.edited, booking_id: bookingId, batch_id: batch.id },
    { folder_type: 'DELIVERABLES', folder: hierarchy.deliverables, booking_id: bookingId, batch_id: batch.id },
  ]
  const { error: foldersError } = await admin.from('drive_folders').upsert(
    records.map((record) => ({
      workspace_id: workspaceId,
      booking_id: record.booking_id,
      batch_id: record.batch_id,
      folder_type: record.folder_type,
      drive_folder_id: record.folder.id,
      name: record.folder.name,
      parent_drive_folder_id: record.folder.parents?.[0] || null,
      web_view_url: driveFolderUrl(record.folder.id),
      updated_at: nowIso(),
    })),
    { onConflict: 'workspace_id,drive_folder_id' },
  )
  if (foldersError) throw new Error(foldersError.message)
  return { hierarchy, batch, portal, booking }
}

export async function reconcileBookingFolders(
  workspaceId: string,
  bookingId: string,
  actorId: string,
  repair = false,
) {
  const admin = adminClient()
  if (repair) {
    const [provisioningReset, folderReset] = await Promise.all([
      admin
        .from('booking_provisioning')
        .update({ drive_client_folder_id: null, drive_client_folder_url: null, updated_at: nowIso() })
        .eq('workspace_id', workspaceId)
        .eq('booking_id', bookingId),
      admin
        .from('drive_folders')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('booking_id', bookingId),
    ])
    if (provisioningReset.error) throw new Error(provisioningReset.error.message)
    if (folderReset.error) throw new Error(folderReset.error.message)
  }
  const prepared = await ensureBookingFolders(admin, workspaceId, bookingId)
  await audit(
    admin,
    workspaceId,
    { type: 'staff', id: actorId },
    repair ? 'DRIVE_FOLDERS_REPAIRED' : 'DRIVE_FOLDERS_REFRESHED',
    {
      bookingId,
      batchId: prepared.batch.id,
      metadata: {
        clientFolderId: prepared.hierarchy.client.id,
        rawFolderId: prepared.hierarchy.raw.id,
        selectedFolderId: prepared.hierarchy.selected.id,
        editedFolderId: prepared.hierarchy.edited.id,
        deliverablesFolderId: prepared.hierarchy.deliverables.id,
      },
    },
  )
  return {
    status: 'READY',
    bookingId,
    clientFolderId: prepared.hierarchy.client.id,
    clientFolderUrl: prepared.hierarchy.clientUrl,
    rawFolderId: prepared.hierarchy.raw.id,
    selectedFolderId: prepared.hierarchy.selected.id,
    editedFolderId: prepared.hierarchy.edited.id,
    deliverablesFolderId: prepared.hierarchy.deliverables.id,
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
  const { hierarchy, batch, booking } = await ensureBookingFolders(admin, input.workspaceId, input.bookingId)
  const checksum = sha256(input.data)
  const relativePath = `RAW/${safeSegment(input.fileName) || `photo-${checksum.slice(0, 8)}`}`
  const uploaded = await upsertDriveFile({
    destinationFolderId: hierarchy.raw.id,
    bookingId: input.bookingId,
    relativePath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    checksum,
    data: input.data,
    purpose: 'raw',
  })
  let thumbnailReference: string | null = uploaded.file.thumbnailLink || null
  if (input.thumbnail?.length) {
    const objectPath = `${input.workspaceId}/${input.bookingId}/${uploaded.file.id}.jpg`
    const { error: storageError } = await admin.storage
      .from('fico-mana-thumbnails')
      .upload(objectPath, input.thumbnail, { contentType: 'image/jpeg', upsert: true })
    if (!storageError) thumbnailReference = objectPath
  }
  const { data: gallery, error } = await admin
    .from('gallery_files')
    .upsert(
      {
        workspace_id: input.workspaceId,
        booking_id: input.bookingId,
        client_id: booking.client_id,
        drive_file_id: uploaded.file.id,
        file_name: uploaded.file.name,
        mime_type: uploaded.file.mimeType || input.mimeType,
        file_size: Number(uploaded.file.size || input.data.length),
        checksum,
        thumbnail_reference: thumbnailReference,
        preview_reference: uploaded.file.thumbnailLink || null,
      },
      { onConflict: 'workspace_id,drive_file_id' },
    )
    .select('*')
    .single()
  if (error || !gallery) throw new Error(error?.message || 'Could not index the RAW photo.')
  await audit(admin, input.workspaceId, { type: 'staff', id: input.actorId }, 'RAW_UPLOADED', {
    bookingId: input.bookingId,
    batchId: batch.id,
    metadata: { galleryFileId: gallery.id, driveFileId: uploaded.file.id, duplicate: uploaded.duplicate },
  })
  return gallery
}

export async function indexRawFolder(workspaceId: string, bookingId: string, actorId: string) {
  const admin = adminClient()
  const { hierarchy, batch, booking } = await ensureBookingFolders(admin, workspaceId, bookingId)
  const files = await listDriveFiles(hierarchy.raw.id)
  if (!files.length) {
    const { data: settings } = await admin
      .from('google_drive_settings')
      .select('granted_scopes')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (!hasRequiredGoogleDriveScopes(settings?.granted_scopes)) {
      throw new Error(
        'Reconnect Google Drive from Client Portals to let Fico Mana read photos uploaded directly inside RAW folders.',
      )
    }
  }
  const rows = files.map((file) => ({
    workspace_id: workspaceId,
    booking_id: bookingId,
    client_id: booking.client_id,
    drive_file_id: file.id,
    file_name: file.name,
    mime_type: file.mimeType || 'application/octet-stream',
    file_size: file.size ? Number(file.size) : null,
    checksum: file.md5Checksum || null,
    thumbnail_reference: file.thumbnailLink || null,
    preview_reference: file.thumbnailLink || null,
  }))
  if (rows.length) {
    const { error } = await admin.from('gallery_files').upsert(rows, { onConflict: 'workspace_id,drive_file_id' })
    if (error) throw new Error(error.message)
  }
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'GALLERY_INDEXED', {
    bookingId,
    batchId: batch.id,
    metadata: { rawFolderDriveId: hierarchy.raw.id, indexedFiles: rows.length },
  })
  return { indexed: rows.length }
}

async function portalRecord(publicId: string) {
  const admin = adminClient()
  const { data, error } = await admin
    .from('client_portals')
    .select('*')
    .eq('public_id', publicId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Portal not found.')
  if (data.status !== 'active') throw new Error('Portal disabled.')
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) throw new Error('Portal expired.')
  return { admin, portal: data }
}

export async function getPortalData(publicId: string, offset = 0, limit = 48) {
  const { admin, portal } = await portalRecord(publicId)
  const bookingId = String(portal.booking_id)
  const workspaceId = String(portal.workspace_id)
  const pageSize = Math.min(MAX_PORTAL_PAGE_SIZE, Math.max(1, limit))
  const [bookingResult, selectionResult, galleryResult, deliverablesResult, jobResult, paymentsResult, resourcesResult, catalogResult] =
    await Promise.all([
      admin.from('bookings').select('*').eq('id', bookingId).single(),
      admin.from('photo_selections').select('*').eq('booking_id', bookingId).maybeSingle(),
      admin
        .from('gallery_files')
        .select('id,file_name,mime_type,drive_file_id,created_at', { count: 'exact' })
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true })
        .range(Math.max(0, offset), Math.max(0, offset) + pageSize - 1),
      admin.from('deliverable_files').select('*').eq('booking_id', bookingId).order('published_at', { ascending: false }),
      admin.from('editing_jobs').select('status').eq('booking_id', bookingId).maybeSingle(),
      admin.from('payments').select('amount').eq('booking_id', bookingId).eq('status', 'confirmed'),
      admin
        .from('client_portal_resources')
        .select('id,resource_type,title,url,content,created_at')
        .eq('booking_id', bookingId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false }),
      admin
        .from('addon_catalog')
        .select('id,name,description,price_amount,pricing_type,display_order,max_quantity')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true }),
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
      .select('addon_catalog_id,name_snapshot,description_snapshot,pricing_type_snapshot,unit_price_snapshot,quantity,photo_count,total_amount')
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
    })),
    deliverables: (deliverablesResult.data || []).map((file) => ({
      id: String(file.id),
      fileName: String(file.file_name),
      mimeType: String(file.mime_type),
      fileSize: Number(file.file_size || 0),
      publishedAt: String(file.published_at),
    })),
    resources: resourcesResult.data || [],
  }
}

export async function getPortalFile(publicId: string, fileId: string, kind: 'gallery' | 'deliverable') {
  const { admin, portal } = await portalRecord(publicId)
  const table = kind === 'deliverable' ? 'deliverable_files' : 'gallery_files'
  const { data, error } = await admin
    .from(table)
    .select('*')
    .eq('id', fileId)
    .eq('booking_id', portal.booking_id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Photo not found.')
  if (kind === 'gallery') {
    const reference = String(data.thumbnail_reference || data.preview_reference || '')
    if (reference && !reference.startsWith('http')) {
      const { data: object, error: storageError } = await admin.storage.from('fico-mana-thumbnails').download(reference)
      if (!storageError && object) return { data: Buffer.from(await object.arrayBuffer()), mimeType: 'image/jpeg' }
    }
    if (reference.startsWith('http')) {
      try {
        return { data: await downloadDriveThumbnail(reference), mimeType: 'image/jpeg' }
      } catch {
        // Google thumbnail URLs are short-lived. Refresh the file metadata and
        // persist the replacement so future portal views use the current URL.
        const freshFile = await getDriveFile(String(data.drive_file_id))
        if (freshFile.thumbnailLink) {
          const thumbnail = await downloadDriveThumbnail(freshFile.thumbnailLink)
          await admin
            .from('gallery_files')
            .update({
              thumbnail_reference: freshFile.thumbnailLink,
              preview_reference: freshFile.thumbnailLink,
            })
            .eq('id', data.id)
          return { data: thumbnail, mimeType: 'image/jpeg' }
        }
      }
    }
  }
  return {
    data: await downloadDriveFile(String(data.drive_file_id)),
    mimeType: String(data.mime_type || 'application/octet-stream'),
    fileName: String(data.file_name || 'photo'),
  }
}

export async function submitPhotoSelection(publicId: string, input: PortalSelectionInput) {
  const { admin, portal } = await portalRecord(publicId)
  const bookingId = String(portal.booking_id)
  const workspaceId = String(portal.workspace_id)
  if (!input.acknowledgeNoRevision) throw new Error('Please acknowledge the no-revision policy before submitting.')
  const { data: selection, error } = await admin
    .from('photo_selections')
    .update({ status: 'SUBMITTING', client_status: 'Selection In Progress', updated_at: nowIso() })
    .eq('booking_id', bookingId)
    .in('status', ['OPEN', 'COPY_FAILED'])
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!selection) throw new Error('This selection is already submitted and locked.')
  const includedLimit = Math.min(5, Math.max(0, Number(selection.included_limit ?? selection.required_count ?? 5)))
  const included = [...new Set(input.includedFileIds?.length ? input.includedFileIds : input.fileIds.slice(0, includedLimit))]
  const extras = [...new Set(input.extraEditFileIds?.length ? input.extraEditFileIds : input.fileIds.filter((id) => !included.includes(id)))]
  if (included.length !== includedLimit || included.some((id) => extras.includes(id))) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error(`Select exactly ${includedLimit} included photo${includedLimit === 1 ? '' : 's'} before submitting.`)
  }
  const unique = [...new Set([...included, ...extras])]
  if (unique.length > 205) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error('A selection can contain at most 205 photos.')
  }
  const preferenceMap = new Map((input.preferences || []).map((item) => [item.fileId, item.preference]))
  const printAllocations = input.printAllocations || []
  if (printAllocations.length !== Object.keys(PRINT_CATEGORY_LIMITS).length) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error('Choose a photo for every free print category.')
  }
  const allocationByCategory = new Map<string, (typeof printAllocations)[number]>()
  for (const allocation of printAllocations) {
    if (allocationByCategory.has(allocation.category)) {
      await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
      throw new Error('Each free print category can be selected only once.')
    }
    if (!included.includes(allocation.fileId)) {
      await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
      throw new Error('Free print allocations must use an included enhanced photo.')
    }
    if (allocation.quantity !== PRINT_CATEGORY_LIMITS[allocation.category]) {
      await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
      throw new Error(`${PRINT_CATEGORY_LABELS[allocation.category]} allows at most ${PRINT_CATEGORY_LIMITS[allocation.category]}.`)
    }
    allocationByCategory.set(allocation.category, allocation)
  }
  const { data: gallery, error: galleryError } = await admin
    .from('gallery_files')
    .select('*')
    .eq('booking_id', bookingId)
    .in('id', unique)
  if (galleryError || !gallery || gallery.length !== unique.length) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error('One or more selected photos do not belong to this portal.')
  }
  const addonRequests = input.addons || []
  const addonIds = [...new Set(addonRequests.map((addon) => addon.addonId))]
  if (addonRequests.length !== addonIds.length) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error('Each add-on type may appear only once.')
  }
  const { data: addonRows, error: addonError } = addonIds.length
    ? await admin
        .from('addon_catalog')
        .select('id,name,description,price_amount,pricing_type,max_quantity')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .in('id', addonIds)
    : { data: [], error: null }
  if (addonError || (addonRows || []).length !== addonIds.length) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error('One or more selected add-ons are no longer available.')
  }
  const addonMap = new Map((addonRows || []).map((row) => [String(row.id), row]))
  const extraAddon = [...addonMap.values()].find((row) => String(row.name).toLowerCase() === 'extra edit')
  const requestedExtraAddon = addonRequests.find((addon) => String(addon.addonId) === String(extraAddon?.id))
  if (extras.length && (!extraAddon || !requestedExtraAddon || Number(requestedExtraAddon.photoCount || requestedExtraAddon.quantity) !== extras.length)) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error('Add Extra Edit for every photo selected beyond the included allocation.')
  }
  if (!extras.length && requestedExtraAddon) {
    await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
    throw new Error('Extra Edit can only be added when photos exceed the included allocation.')
  }
  for (const request of addonRequests) {
    const row = addonMap.get(request.addonId)
    if (!row || request.quantity > Number(row.max_quantity || 1)) {
      await admin.from('photo_selections').update({ status: 'OPEN' }).eq('id', selection.id)
      throw new Error(row ? `${row.name} exceeds its maximum quantity.` : 'Selected add-on not found.')
    }
  }
  const addonOrders = addonRequests.map((request) => {
    const row = addonMap.get(request.addonId)
    if (!row) throw new Error('Selected add-on not found.')
    const quantity = Number(request.quantity)
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
      total_amount: Number(row.price_amount || 0) * billableUnits,
    }
  })
  const totalAddonAmount = addonOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0)
  try {
    const { hierarchy, batch } = await ensureBookingFolders(admin, workspaceId, bookingId)
    const extraFolder = extras.length ? await findOrCreateFolder(hierarchy.selected.id, 'EXTRA EDITS') : null
    const items: Record<string, unknown>[] = []
    for (const file of gallery) {
      const extraEdit = extras.includes(String(file.id))
      const copy = await copyDriveFile({
        fileId: String(file.drive_file_id),
        destinationFolderId: extraEdit && extraFolder ? extraFolder.id : hierarchy.selected.id,
        bookingId,
        galleryFileId: String(file.id),
        purpose: extraEdit ? 'extra-edit' : 'selected-enhanced',
      })
      items.push({
        selection_id: selection.id,
        gallery_file_id: file.id,
        selected_drive_file_id: copy.id,
        copied_at: nowIso(),
        enhancement_preference: preferenceMap.get(String(file.id)) || 'standard',
        is_extra_edit: extraEdit,
      })
    }
    const allocationRows: Record<string, unknown>[] = []
    for (const allocation of printAllocations) {
      const folder = await findOrCreateFolder(hierarchy.selected.id, PRINT_CATEGORY_LABELS[allocation.category])
      const file = gallery.find((item) => String(item.id) === allocation.fileId)
      if (!file) throw new Error('A print allocation references an unknown photo.')
      const copy = await copyDriveFile({
        fileId: String(file.drive_file_id),
        destinationFolderId: folder.id,
        bookingId,
        galleryFileId: String(file.id),
        purpose: `print-${allocation.category.toLowerCase()}`,
      })
      allocationRows.push({
        workspace_id: workspaceId,
        booking_id: bookingId,
        selection_id: selection.id,
        gallery_file_id: file.id,
        category: allocation.category,
        quantity: allocation.quantity,
        label_snapshot: PRINT_CATEGORY_LABELS[allocation.category],
        drive_file_id: copy.id,
      })
    }
    await admin.from('photo_selection_items').delete().eq('selection_id', selection.id)
    await admin.from('print_allocations').delete().eq('selection_id', selection.id)
    await admin.from('client_addon_orders').delete().eq('selection_id', selection.id)
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
    await Promise.all([
      admin
        .from('photo_selections')
        .update({
          status: 'SUBMITTED',
          client_status: 'Submitted',
          included_limit: includedLimit,
          no_revision_acknowledged: true,
          no_revision_acknowledged_at: submittedAt,
          total_addon_amount: totalAddonAmount,
          submitted_at: submittedAt,
          updated_at: submittedAt,
        })
        .eq('id', selection.id),
      admin
        .from('editing_jobs')
        .update({ status: 'READY_FOR_EDITING', selected_count: unique.length, expected_output_count: unique.length, last_error: null, updated_at: submittedAt })
        .eq('booking_id', bookingId),
      admin
        .from('bookings')
        .update({
          raw_photo_status: 'Approved',
          raw_photo_link: driveFolderUrl(hierarchy.selected.id),
          raw_photo_submitted_at: submittedAt,
          raw_photo_approved_at: submittedAt,
        })
        .eq('id', bookingId),
    ])
    await audit(admin, workspaceId, { type: 'client', id: publicId }, 'SELECTION_SUBMITTED', {
      bookingId,
      batchId: batch.id,
      metadata: { galleryFileIds: unique, includedFileIds: included, extraEditFileIds: extras, printAllocations, totalAddonAmount },
    })
    await audit(admin, workspaceId, { type: 'system' }, 'SELECTED_FILES_COPIED', {
      bookingId,
      batchId: batch.id,
        metadata: { destinationFolderDriveId: hierarchy.selected.id, copiedFiles: items.length, printFolders: allocationRows.length, destructive: false },
    })
    return getPortalData(publicId)
  } catch (copyError) {
    const message = copyError instanceof Error ? copyError.message : 'Selected photo copy failed.'
    await admin.from('photo_selections').update({ status: 'COPY_FAILED', updated_at: nowIso() }).eq('id', selection.id)
    await admin.from('editing_jobs').update({ last_error: message, updated_at: nowIso() }).eq('booking_id', bookingId)
    await audit(admin, workspaceId, { type: 'system' }, 'SELECTION_COPY_FAILED', {
      bookingId,
      metadata: { error: message },
    })
    throw copyError
  }
}

export async function reopenPhotoSelection(workspaceId: string, bookingId: string, actorId: string) {
  const admin = adminClient()
  const { data: job } = await admin
    .from('editing_jobs')
    .select('id,batch_id,status')
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (!job) throw new Error('Editing job not found.')
  const { data: selection } = await admin
    .from('photo_selections')
    .select('id,version')
    .eq('workspace_id', workspaceId)
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (!selection) throw new Error('Photo selection not found.')
  const reopenedAt = nowIso()
  const { error } = await admin
    .from('photo_selections')
    .update({
      status: 'OPEN',
      client_status: 'Selection In Progress',
      no_revision_acknowledged: false,
      no_revision_acknowledged_at: null,
      reopened_at: reopenedAt,
      version: Number(selection.version || 1) + 1,
      updated_at: reopenedAt,
    })
    .eq('id', selection.id)
  if (error) throw new Error(error.message)
  if (job.status !== 'DELIVERED') {
    await admin
      .from('editing_jobs')
      .update({ status: 'WAITING_FOR_SELECTION', last_error: null, updated_at: reopenedAt })
      .eq('id', job.id)
  }
  await admin.from('bookings').update({ raw_photo_status: 'Pending Review', raw_photo_approved_at: null }).eq('id', bookingId)
  await audit(admin, workspaceId, { type: 'staff', id: actorId }, 'SELECTION_REOPENED', {
    bookingId,
    batchId: job.batch_id,
  })
  return { success: true }
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
  const now = Date.now()
  const jobs = (readyJobs || []).filter((job) => {
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
    .select('selection_id,gallery_file_id,selected_drive_file_id')
    .in('selection_id', selectionIds)
  if (itemsError) throw new Error(itemsError.message)
  const galleryIds = (items || []).map((item) => item.gallery_file_id)
  const { data: gallery, error: galleryError } = galleryIds.length
    ? await admin.from('gallery_files').select('id,file_name,drive_file_id').in('id', galleryIds)
    : { data: [], error: null }
  if (galleryError) throw new Error(galleryError.message)
  const galleryMap = new Map((gallery || []).map((file) => [String(file.id), file]))
  const selectionMap = new Map((selections || []).map((selection) => [String(selection.booking_id), String(selection.id)]))
  const portalMap = new Map((portals || []).map((portal) => [String(portal.booking_id), String(portal.public_id)]))
  const foldersResult = await admin.from('drive_folders').select('*').in('booking_id', bookingIds)
  const folderMap = new Map((foldersResult.data || []).map((folder) => [`${folder.booking_id}:${folder.folder_type}`, folder]))
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
        selected_folder_drive_id: folderMap.get(`${job.booking_id}:SELECTED`)?.drive_folder_id || null,
        edited_folder_drive_id: folderMap.get(`${job.booking_id}:EDITED`)?.drive_folder_id || null,
        deliverables_folder_drive_id: folderMap.get(`${job.booking_id}:DELIVERABLES`)?.drive_folder_id || null,
        portal_id: portalMap.get(String(job.booking_id)) || null,
        customer_name: String(booking?.customer_name || job.booking_id),
      }
    }),
  }
  const entries: Array<{ name: string; data?: Buffer; driveFileId?: string }> = [
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
    for (const item of (items || []).filter((row) => String(row.selection_id) === selectionId)) {
      const file = galleryMap.get(String(item.gallery_file_id))
      if (!file) continue
      entries.push({
        name: `${batch.shoot_date}/${folderName}/SELECTED/${safeSegment(String(file.file_name)) || file.id}`,
        driveFileId: String(item.selected_drive_file_id || file.drive_file_id),
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
  const expectedByBooking = new Map(clients.map((client) => [client.bookingId, client.expectedFiles]))
  const { data: jobs, error } = await admin
    .from('editing_jobs')
    .select('*')
    .eq('batch_id', batch.id)
    .in('booking_id', uniqueIds)
  if (error) throw new Error(error.message)
  if (!jobs?.length || jobs.length !== uniqueIds.length) throw new Error('Upload manifest contains unknown batch clients.')
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
  const priorPath = currentFiles.find((file) => String(file.relative_path) === relativePath)
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
  const { data: prior } = await admin
    .from('deliverable_files')
    .select('*')
    .eq('booking_id', input.bookingId)
    .eq('relative_path', relativePath)
    .maybeSingle()
  const { data: uploadFile, error: fileError } = await admin
    .from('batch_upload_files')
    .upsert(
      {
        upload_item_id: item.id,
        relative_path: relativePath,
        file_name: safeSegment(input.fileName),
        file_size: input.fileSize,
        checksum,
        drive_file_id: prior?.drive_file_id || null,
        status: prior?.checksum === checksum ? 'SKIPPED_DUPLICATE' : 'UPLOADING',
        attempt_count: 1,
        last_error: null,
        updated_at: nowIso(),
      },
      { onConflict: 'upload_item_id,relative_path' },
    )
    .select('*')
    .single()
  if (fileError || !uploadFile) throw new Error(fileError?.message || 'Could not create upload file state.')
  await admin
    .from('batch_upload_items')
    .update({ status: 'UPLOADING', attempt_count: Number(item.attempt_count || 0) + 1, updated_at: nowIso() })
    .eq('id', item.id)
  await admin.from('editing_jobs').update({ status: 'UPLOADING', last_error: null, updated_at: nowIso() }).eq('id', item.editing_job_id)
  if (prior?.checksum === checksum) {
    return { uploadFileId: String(uploadFile.id), duplicate: true, driveFileId: String(prior.drive_file_id) }
  }
  try {
    const { hierarchy } = await ensureBookingFolders(admin, workspaceId, input.bookingId)
    const uploadUrl = await createDriveResumableUpload({
      destinationFolderId: hierarchy.edited.id,
      existingDriveFileId: prior?.drive_file_id || null,
      bookingId: input.bookingId,
      relativePath,
      fileName: input.fileName,
      mimeType: input.mimeType || 'application/octet-stream',
      fileSize: input.fileSize,
      checksum,
    })
    return { uploadFileId: String(uploadFile.id), uploadUrl, duplicate: false }
  } catch (uploadError) {
    const message = uploadError instanceof Error ? uploadError.message : 'Could not initialize the Drive upload.'
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
  driveFileId: string,
  mimeType: string,
) {
  const admin = adminClient()
  const { data: uploadFile, error } = await admin
    .from('batch_upload_files')
    .select('*,batch_upload_items!inner(id,upload_job_id,booking_id,editing_job_id)')
    .eq('id', uploadFileId)
    .eq('batch_upload_items.upload_job_id', uploadJobId)
    .single()
  if (error || !uploadFile) throw new Error(error?.message || 'Upload file state not found.')
  const driveFile = await getDriveFile(driveFileId)
  const bookingId = String(uploadFile.batch_upload_items.booking_id)
  if (
    driveFile.appProperties?.bookingId !== bookingId ||
    driveFile.appProperties?.relativePath !== uploadFile.relative_path ||
    driveFile.appProperties?.checksum !== uploadFile.checksum
  ) {
    throw new Error('Google Drive upload metadata does not match the batch manifest.')
  }
  const { data: job } = await admin
    .from('editing_jobs')
    .select('id,workspace_id')
    .eq('id', uploadFile.batch_upload_items.editing_job_id)
    .eq('workspace_id', workspaceId)
    .single()
  if (!job) throw new Error('Upload job is outside this workspace.')
  const { hierarchy } = await ensureBookingFolders(admin, workspaceId, bookingId)
  if (!driveFile.parents?.includes(hierarchy.edited.id)) {
    throw new Error('Google Drive uploaded the file outside the authorized client destination.')
  }
  if (safeSegment(driveFile.name) !== uploadFile.file_name) {
    throw new Error('Google Drive uploaded a file with an unexpected name.')
  }
  validateEditedPhotoMetadata(driveFile.name, driveFile.mimeType || mimeType)
  const expectedBytes = Number(uploadFile.file_size || 0)
  const driveBytes = Number(driveFile.size || 0)
  if (!expectedBytes || !Number.isSafeInteger(driveBytes) || driveBytes !== expectedBytes) {
    await audit(admin, workspaceId, { type: 'system' }, 'UPLOAD_CHECKSUM_FAILED', {
      bookingId,
      metadata: { uploadFileId: uploadFile.id, reason: 'size_mismatch' },
    })
    throw new Error('The uploaded Drive file size does not match the batch manifest.')
  }
  const verified = await hashDriveFileSha256(driveFile.id, 500 * 1024 * 1024)
  if (verified.bytes !== expectedBytes || verified.checksum !== uploadFile.checksum) {
    await audit(admin, workspaceId, { type: 'system' }, 'UPLOAD_CHECKSUM_FAILED', {
      bookingId,
      metadata: { uploadFileId: uploadFile.id, reason: 'sha256_mismatch' },
    })
    throw new Error('The uploaded Drive file checksum does not match the batch manifest.')
  }
  const { error: deliveryError } = await admin.from('deliverable_files').upsert(
    {
      workspace_id: workspaceId,
      booking_id: bookingId,
      editing_job_id: job.id,
      drive_file_id: driveFile.id,
      relative_path: uploadFile.relative_path,
      file_name: driveFile.name,
      mime_type: driveFile.mimeType || mimeType || 'application/octet-stream',
      file_size: Number(driveFile.size || 0),
      checksum: uploadFile.checksum,
      published_at: nowIso(),
    },
    { onConflict: 'booking_id,relative_path' },
  )
  if (deliveryError) throw new Error(deliveryError.message)
  await admin
    .from('batch_upload_files')
    .update({ drive_file_id: driveFile.id, status: 'UPLOADED', last_error: null, updated_at: nowIso() })
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
  const portal = await ensurePortal(admin, workspaceId, bookingId)
  const url = portalUrl(String(portal.public_id))
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
      .update({ edited_photo_link: url, edited_photo_delivered_at: timestamp })
      .eq('id', bookingId),
  ])
  await setPortalExpiryFromDelivery(bookingId, timestamp)
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
      await sendEditedPhotosEmail(emailBooking, url)
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
    .select('drive_file_id,file_name')
    .eq('booking_id', portal.booking_id)
    .order('published_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []).map((file) => ({
    name: safeSegment(String(file.file_name)) || String(file.drive_file_id),
    driveFileId: String(file.drive_file_id),
  }))
}

export function driveDownloadBuffer(fileId: string) {
  return downloadDriveFile(fileId)
}
