import { NextRequest, NextResponse } from 'next/server'
import { requireWorkflowAuth } from '@/lib/auth-api'
import { canUseWorkflow } from '@/lib/auth/workflow'
import { Readable } from 'node:stream'
import { assertStorageKeyOwnership, parseStorageKey } from '@/lib/storage/storage-keys'
import { deleteObjects, getObject } from '@/lib/storage/storage-service'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { readDatabasePages } from '@/lib/database/read-pages'
import { STORAGE_CATEGORIES } from '@/lib/storage/storage-keys'
import { isFolderDeleteConfirmation, type FileManagementFolderScope } from '@/lib/file-management-delete'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })

type IndexedFile = {
  id: string
  source: 'gallery' | 'deliverable'
  bookingId: string
  category: string
  fileName: string
  size: number
  updatedAt: string | null
  storageKey: string
  storageKeys: string[]
  previewAvailable: boolean
}

function indexedFile(row: Record<string, any>, source: IndexedFile['source']): IndexedFile | null {
  const storageKey = String(row.storage_key || '')
  if (!storageKey) return null
  try {
    const parsed = parseStorageKey(storageKey)
    return {
      id: String(row.id), source, bookingId: String(row.booking_id), category: parsed.category,
      fileName: String(row.file_name || row.relative_path || `${parsed.objectId}.${parsed.extension}`),
      size: Number(row.file_size || 0), updatedAt: row.updated_at || row.published_at || row.created_at || null,
      storageKey,
      storageKeys: [storageKey, String(row.thumbnail_reference || ''), String(row.preview_reference || '')].filter(Boolean),
      previewAvailable: Boolean(row.thumbnail_reference || row.preview_reference),
    }
  } catch { return null }
}

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>

async function folderFiles(admin: AdminClient, workspaceId: string, bookingIds: string[], category?: string) {
  const files: IndexedFile[] = []
  for (let start = 0; start < bookingIds.length; start += 100) {
    const ids = bookingIds.slice(start, start + 100)
    const galleryQuery = () => {
      const query = admin.from('gallery_files')
        .select('id,booking_id,storage_key,file_name,file_size,thumbnail_reference,preview_reference,created_at,updated_at')
        .eq('workspace_id', workspaceId).eq('storage_status', 'available').in('booking_id', ids)
      if (category) query.like('storage_key', `%/${category}/%`)
      return query
    }
    const deliverableQuery = () => {
      const query = admin.from('deliverable_files')
        .select('id,booking_id,storage_key,file_name,relative_path,file_size,published_at,updated_at')
        .eq('workspace_id', workspaceId).eq('storage_status', 'available').in('booking_id', ids)
      if (category) query.like('storage_key', `%/${category}/%`)
      return query
    }
    const [gallery, deliverables] = await Promise.all([
      readDatabasePages<Record<string, any>>(galleryQuery),
      readDatabasePages<Record<string, any>>(deliverableQuery),
    ])
    files.push(
      ...gallery.map((row) => indexedFile(row, 'gallery')).filter((row): row is IndexedFile => Boolean(row)),
      ...deliverables.map((row) => indexedFile(row, 'deliverable')).filter((row): row is IndexedFile => Boolean(row)),
    )
  }
  return files
}

async function folderHasAssignedFiles(admin: AdminClient, files: IndexedFile[]) {
  const galleryIds = files.filter((file) => file.source === 'gallery').map((file) => file.id)
  const deliverableKeys = files.filter((file) => file.source === 'deliverable').map((file) => file.storageKey)
  for (let start = 0; start < galleryIds.length; start += 100) {
    const ids = galleryIds.slice(start, start + 100)
    const [selectionUse, printUse] = await Promise.all([
      admin.from('photo_selection_items').select('gallery_file_id', { count: 'exact', head: true }).in('gallery_file_id', ids),
      admin.from('print_allocations').select('gallery_file_id', { count: 'exact', head: true }).in('gallery_file_id', ids),
    ])
    if (selectionUse.error || printUse.error) throw new Error('File assignments could not be checked.')
    if ((selectionUse.count || 0) > 0 || (printUse.count || 0) > 0) return true
  }
  for (let start = 0; start < deliverableKeys.length; start += 100) {
    const keys = deliverableKeys.slice(start, start + 100)
    const [enhancedUse, printUse] = await Promise.all([
      admin.from('print_allocations').select('id', { count: 'exact', head: true }).in('enhanced_storage_key', keys),
      admin.from('print_allocations').select('id', { count: 'exact', head: true }).in('print_storage_key', keys),
    ])
    if (enhancedUse.error || printUse.error) throw new Error('File assignments could not be checked.')
    if ((enhancedUse.count || 0) > 0 || (printUse.count || 0) > 0) return true
  }
  return false
}

async function setFileRowsStatus(admin: AdminClient, files: IndexedFile[], from: 'available' | 'deleted', to: 'available' | 'deleted') {
  const timestamp = new Date().toISOString()
  for (const source of ['gallery', 'deliverable'] as const) {
    const ids = files.filter((file) => file.source === source).map((file) => file.id)
    const table = source === 'gallery' ? 'gallery_files' : 'deliverable_files'
    for (let start = 0; start < ids.length; start += 100) {
      const chunk = ids.slice(start, start + 100)
      const changed = await admin.from(table).update({ storage_status: to, updated_at: timestamp })
        .in('id', chunk).eq('storage_status', from).select('id')
      if (changed.error || (changed.data || []).length !== chunk.length) {
        throw new Error('The folder changed before deletion could finish.')
      }
    }
  }
}

async function deleteFolder(request: NextRequest, admin: AdminClient, workspaceId: string, userId: string) {
  const body = await request.json().catch(() => null) as null | {
    confirmation?: unknown
    scope?: unknown
    date?: unknown
    booking?: unknown
    category?: unknown
  }
  if (!body || !isFolderDeleteConfirmation(body.confirmation)) {
    return json({ error: 'Type CONFIRM DELETE exactly to delete this folder.' }, 400)
  }
  const scope = String(body.scope || '') as FileManagementFolderScope
  if (!['date', 'booking', 'category'].includes(scope)) return json({ error: 'Choose a valid folder to delete.' }, 400)

  const shootDate = String(body.date || '').trim()
  const bookingId = String(body.booking || '').trim()
  const category = String(body.category || '').trim()
  let bookingIds: string[] = []
  if (scope === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shootDate)) return json({ error: 'Choose a valid shoot-date folder.' }, 400)
    const bookings = await readDatabasePages<Record<string, any>>(() => admin.from('bookings').select('id')
      .eq('workspace_id', workspaceId).eq('booking_date', shootDate))
    bookingIds = bookings.map((row) => String(row.id))
  } else {
    if (!bookingId) return json({ error: 'Choose a valid client folder.' }, 400)
    const booking = await admin.from('bookings').select('id').eq('workspace_id', workspaceId).eq('id', bookingId).maybeSingle()
    if (booking.error || !booking.data) return json({ error: 'Client folder not found.' }, 404)
    bookingIds = [bookingId]
  }
  if (scope === 'category' && !STORAGE_CATEGORIES.includes(category as (typeof STORAGE_CATEGORIES)[number])) {
    return json({ error: 'Choose a valid photo folder.' }, 400)
  }
  if (!bookingIds.length) return json({ error: 'This folder is already empty. Refresh File Management.' }, 404)

  let files: IndexedFile[]
  try {
    files = await folderFiles(admin, workspaceId, bookingIds, scope === 'category' ? category : undefined)
    if (!files.length) return json({ error: 'This folder is already empty. Refresh File Management.' }, 404)
    if (await folderHasAssignedFiles(admin, files)) {
      return json({ error: 'This folder contains photos used in a client selection or print. Remove those assignments before deleting the folder.' }, 409)
    }
  } catch (cause) {
    console.error('Editor folder deletion validation failed:', cause)
    return json({ error: 'The folder could not be checked safely. Nothing was removed; try again.' }, 503)
  }

  const objectKeys = [...new Set(files.flatMap((file) => file.storageKeys))]
  const bookingSet = new Set(bookingIds)
  try {
    for (const storageKey of objectKeys) {
      const parsed = assertStorageKeyOwnership(storageKey, workspaceId)
      if (!bookingSet.has(parsed.bookingId) || (scope === 'category' && parsed.category !== category)) {
        throw new Error('The folder includes a file outside the selected scope.')
      }
    }
  } catch {
    return json({ error: 'The folder scope could not be verified. Nothing was removed.' }, 409)
  }

  const audit = await admin.from('workflow_audit_logs').insert({
    workspace_id: workspaceId, actor_type: 'staff', actor_id: userId,
    action: 'EDITOR_FOLDER_DELETE_STARTED', booking_id: scope === 'date' ? null : bookingId,
    metadata: { scope, shootDate: shootDate || null, bookingId: bookingId || null, category: category || null, fileCount: files.length, objectCount: objectKeys.length },
  })
  if (audit.error) return json({ error: 'The deletion could not be recorded. Nothing was removed.' }, 503)

  try {
    await setFileRowsStatus(admin, files, 'available', 'deleted')
    await deleteObjects(objectKeys)
  } catch (cause) {
    await setFileRowsStatus(admin, files, 'deleted', 'available').catch((rollbackError) => {
      console.error('Editor folder deletion rollback failed:', rollbackError)
    })
    console.error('Editor folder deletion failed:', cause)
    return json({ error: 'The folder could not be removed from storage. Remaining files stay visible; refresh and try again.' }, 503)
  }

  const completed = await admin.from('workflow_audit_logs').insert({
    workspace_id: workspaceId, actor_type: 'staff', actor_id: userId,
    action: 'EDITOR_FOLDER_DELETE_COMPLETED', booking_id: scope === 'date' ? null : bookingId,
    metadata: { scope, shootDate: shootDate || null, bookingId: bookingId || null, category: category || null, fileCount: files.length, objectCount: objectKeys.length },
  })
  if (completed.error) console.error('Editor folder deletion completion audit failed:', completed.error)
  return json({ success: true, deletedFiles: files.length, deletedObjects: objectKeys.length })
}

function publicIndexedFile(file: IndexedFile) {
  return {
    id: file.id, source: file.source, bookingId: file.bookingId, category: file.category,
    fileName: file.fileName, size: file.size, updatedAt: file.updatedAt,
    previewAvailable: file.previewAvailable,
  }
}

export async function GET(request: NextRequest) {
  const { user, access, error } = await requireWorkflowAuth('view', request)
  if (error || !user || !access) return error || json({ error: 'Unauthorized' }, 401)
  if (!canUseWorkflow(access, 'edit')) return json({ error: 'This staff role cannot browse studio files.' }, 403)
  const admin = getSupabaseAdmin()
  if (!admin) return json({ error: 'File management is temporarily unavailable.' }, 503)

  const bookingId = request.nextUrl.searchParams.get('booking')?.trim() || ''
  const shootDate = request.nextUrl.searchParams.get('date')?.trim() || ''
  const category = request.nextUrl.searchParams.get('category')?.trim() || ''
  const openSource = request.nextUrl.searchParams.get('source')
  const openId = request.nextUrl.searchParams.get('file')?.trim() || ''
  const preview = request.nextUrl.searchParams.get('preview') === '1'

  if (request.nextUrl.searchParams.get('summary') === '1') {
    const result = await admin.rpc('private_storage_summary', { p_workspace: access.workspaceId })
    if (result.error) return json({ error: 'Storage usage could not be loaded. Try again.' }, 503)
    const summary = (result.data || {}) as Record<string, unknown>
    const indexedBytes = Number(summary.indexedBytes || 0)
    const storageGb = indexedBytes / 1024 ** 3
    const estimatedMonthlyUsd = Math.max(0, storageGb - 10) * 0.015
    return json({
      ...summary,
      storageGb,
      estimatedMonthlyUsd,
      pricing: { currency: 'USD', freeGb: 10, storagePerGbMonth: 0.015, egressPerGb: 0 },
      delivery: {
        privateWorkerConfigured: Boolean(process.env.PRIVATE_DOWNLOAD_WORKER_URL),
        portalDownloads: 'Cloudflare R2 Worker',
        editorBatchDownloads: 'Cloudflare R2 Worker',
      },
    })
  }

  if (openId && (openSource === 'gallery' || openSource === 'deliverable')) {
    const result = openSource === 'gallery'
      ? await admin.from('gallery_files').select('id,booking_id,storage_key,file_name,thumbnail_reference,preview_reference')
          .eq('workspace_id', access.workspaceId).eq('id', openId).eq('storage_status', 'available').maybeSingle()
      : await admin.from('deliverable_files').select('id,booking_id,storage_key,file_name,relative_path')
          .eq('workspace_id', access.workspaceId).eq('id', openId).eq('storage_status', 'available').maybeSingle()
    if (result.error || !result.data?.storage_key) return json({ error: 'File not found.' }, 404)
    assertStorageKeyOwnership(String(result.data.storage_key), access.workspaceId, String(result.data.booking_id))
    const previewKey = preview && openSource === 'gallery'
      ? String(('thumbnail_reference' in result.data && result.data.thumbnail_reference) || ('preview_reference' in result.data && result.data.preview_reference) || result.data.storage_key)
      : String(result.data.storage_key)
    assertStorageKeyOwnership(previewKey, access.workspaceId, String(result.data.booking_id))
    const stored = await getObject(previewKey)
    if (!stored.Body) return json({ error: 'This file is currently unavailable.' }, 404)
    const fileName = String(result.data.file_name || ('relative_path' in result.data ? result.data.relative_path : '') || 'studio-file').replace(/["\r\n]/g, '')
    return new Response(Readable.toWeb(Readable.from(stored.Body as AsyncIterable<Uint8Array>)) as ReadableStream, {
      headers: {
        ...headers,
        'content-type': stored.ContentType || 'application/octet-stream',
        'content-disposition': `inline; filename="${fileName}"`,
        'referrer-policy': 'no-referrer',
      },
    })
  }

  const fileRows = async (ids?: string[]) => {
    // Parent folders need only identity/category metadata, not filenames, image
    // references and sizes for every descendant. Never read R2 objects here.
    const details = Boolean(bookingId && category)
    const query = (table: 'gallery_files' | 'deliverable_files') => {
    const projection = table === 'gallery_files' ? (details
      ? 'id,booking_id,storage_key,file_name,file_size,thumbnail_reference,preview_reference,created_at,updated_at'
      : 'id,booking_id,storage_key') : (details
      ? 'id,booking_id,storage_key,file_name,relative_path,file_size,published_at,updated_at'
      : 'id,booking_id,storage_key')
    const scoped = admin.from(table).select(projection)
      .eq('workspace_id', access.workspaceId).eq('storage_status', 'available')
    if (ids?.length) scoped.in('booking_id', ids)
    if (bookingId) scoped.eq('booking_id', bookingId)
    if (details) scoped.like('storage_key', `%/${category}/%`)
    return scoped
    }
    const [gallery, deliverables] = await Promise.all([
      readDatabasePages<Record<string, any>>(() => query('gallery_files')),
      readDatabasePages<Record<string, any>>(() => query('deliverable_files')),
    ])
    return [
      ...gallery.map((row) => indexedFile(row, 'gallery')),
      ...deliverables.map((row) => indexedFile(row, 'deliverable')),
    ].filter((row): row is IndexedFile => Boolean(row))
  }

  try {
    if (bookingId) {
      const booking = await admin.from('bookings').select('id,customer_name,booking_date')
        .eq('workspace_id', access.workspaceId).eq('id', bookingId).maybeSingle()
      if (booking.error || !booking.data) return json({ error: 'Client folder not found.' }, 404)
      const files = await fileRows()
      if (category) return json({ level: 'files', booking: booking.data, category,
        items: files.filter((file) => file.category === category).map(publicIndexedFile) })
      const counts = new Map<string, number>()
      for (const file of files) counts.set(file.category, (counts.get(file.category) || 0) + 1)
      return json({ level: 'categories', booking: booking.data,
        items: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })) })
    }

    if (shootDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(shootDate)) return json({ error: 'Invalid shoot date.' }, 400)
      const bookings = await readDatabasePages<Record<string, any>>(() => admin.from('bookings')
        .select('id,customer_name,package_name,booking_date')
        .eq('workspace_id', access.workspaceId).eq('booking_date', shootDate))
      bookings.sort((a, b) => String(a.customer_name).localeCompare(String(b.customer_name)))
      const ids = bookings.map((row) => String(row.id))
      const files = ids.length ? await fileRows(ids) : []
      const counts = new Map<string, number>()
      for (const file of files) counts.set(file.bookingId, (counts.get(file.bookingId) || 0) + 1)
      return json({ level: 'clients', shootDate, items: bookings
        .filter((row) => counts.has(String(row.id))).map((row) => ({ ...row, fileCount: counts.get(String(row.id)) })) })
    }

    const files = await fileRows()
    const ids = [...new Set(files.map((file) => file.bookingId))]
    if (!ids.length) return json({ level: 'dates', items: [] })
    const bookings: Array<{ id: string; booking_date: string }> = []
    // Keep query URLs bounded; one giant IN expression fails at large studios.
    for (let start = 0; start < ids.length; start += 100) {
      const chunk = await admin.from('bookings').select('id,booking_date')
        .eq('workspace_id', access.workspaceId).in('id', ids.slice(start, start + 100))
      if (chunk.error) throw new Error(chunk.error.message)
      bookings.push(...(chunk.data || []))
    }
    const counts = new Map<string, number>()
    const dateByBooking = new Map(bookings.map((row) => [String(row.id), String(row.booking_date)]))
    for (const file of files) {
      const date = dateByBooking.get(file.bookingId)
      if (date) counts.set(date, (counts.get(date) || 0) + 1)
    }
    return json({ level: 'dates', items: [...counts].sort(([a], [b]) => b.localeCompare(a)).map(([date, fileCount]) => ({ date, fileCount })) })
  } catch (cause) {
    console.error('Editor file browser failed:', cause)
    return json({ error: 'Studio files could not be loaded. Try again.' }, 503)
  }
}

export async function DELETE(request: NextRequest) {
  const { user, access, error } = await requireWorkflowAuth('edit', request)
  if (error || !user || !access) return error || json({ error: 'Unauthorized' }, 401)
  const admin = getSupabaseAdmin()
  if (!admin) return json({ error: 'File management is temporarily unavailable.' }, 503)

  if (request.nextUrl.searchParams.get('folder') === '1') {
    return deleteFolder(request, admin, access.workspaceId, user.id)
  }

  const source = request.nextUrl.searchParams.get('source')
  const fileId = request.nextUrl.searchParams.get('file')?.trim() || ''
  if (!fileId || (source !== 'gallery' && source !== 'deliverable')) return json({ error: 'Choose a valid file to delete.' }, 400)

  const table = source === 'gallery' ? 'gallery_files' : 'deliverable_files'
  const found = source === 'gallery'
    ? await admin.from('gallery_files').select('id,booking_id,storage_key,file_name,thumbnail_reference,preview_reference')
        .eq('workspace_id', access.workspaceId).eq('id', fileId).eq('storage_status', 'available').maybeSingle()
    : await admin.from('deliverable_files').select('id,booking_id,storage_key,file_name,relative_path')
        .eq('workspace_id', access.workspaceId).eq('id', fileId).eq('storage_status', 'available').maybeSingle()
  if (found.error || !found.data?.storage_key) return json({ error: 'This file is no longer available. Refresh the folder.' }, 404)
  const file = found.data as Record<string, unknown>

  const bookingId = String(file.booking_id)
  const storageKey = String(file.storage_key)
  assertStorageKeyOwnership(storageKey, access.workspaceId, bookingId)

  if (source === 'gallery') {
    const [selectionUse, printUse] = await Promise.all([
      admin.from('photo_selection_items').select('gallery_file_id', { count: 'exact', head: true }).eq('gallery_file_id', fileId),
      admin.from('print_allocations').select('gallery_file_id', { count: 'exact', head: true }).eq('gallery_file_id', fileId),
    ])
    if (selectionUse.error || printUse.error) return json({ error: 'File usage could not be checked. Try again.' }, 503)
    if ((selectionUse.count || 0) > 0 || (printUse.count || 0) > 0) {
      return json({ error: 'This photo is already used in a client selection or print. Remove that assignment before deleting it.' }, 409)
    }
  } else {
    const [enhancedUse, printUse] = await Promise.all([
      admin.from('print_allocations').select('id', { count: 'exact', head: true }).eq('enhanced_storage_key', storageKey),
      admin.from('print_allocations').select('id', { count: 'exact', head: true }).eq('print_storage_key', storageKey),
    ])
    if (enhancedUse.error || printUse.error) return json({ error: 'File usage could not be checked. Try again.' }, 503)
    if ((enhancedUse.count || 0) > 0 || (printUse.count || 0) > 0) {
      return json({ error: 'This file is assigned to a print. Remove that assignment before deleting it.' }, 409)
    }
  }

  const keys = source === 'gallery'
    ? [storageKey, String(file.thumbnail_reference || ''), String(file.preview_reference || '')].filter(Boolean)
    : [storageKey]
  for (const key of keys) assertStorageKeyOwnership(key, access.workspaceId, bookingId)

  const auditStart = await admin.from('workflow_audit_logs').insert({
    workspace_id: access.workspaceId, actor_type: 'staff', actor_id: user.id,
    action: 'EDITOR_FILE_DELETE_STARTED', booking_id: bookingId,
    metadata: { source, fileId, fileName: String(file.file_name || ''), storageKeys: keys },
  })
  if (auditStart.error) return json({ error: 'The deletion could not be recorded. Nothing was removed.' }, 503)

  const timestamp = new Date().toISOString()
  const hidden = await admin.from(table).update({ storage_status: 'deleted', updated_at: timestamp })
    .eq('workspace_id', access.workspaceId).eq('id', fileId).eq('storage_status', 'available').select('id').maybeSingle()
  if (hidden.error || !hidden.data) return json({ error: 'This file changed before it could be deleted. Refresh the folder.' }, 409)

  try {
    await deleteObjects([...new Set(keys)])
  } catch (cause) {
    await admin.from(table).update({ storage_status: 'available', updated_at: new Date().toISOString() })
      .eq('workspace_id', access.workspaceId).eq('id', fileId).eq('storage_status', 'deleted')
    console.error('Editor file deletion failed:', cause)
    return json({ error: 'The file could not be removed from storage. It remains available; try again.' }, 503)
  }

  const completed = await admin.from('workflow_audit_logs').insert({
    workspace_id: access.workspaceId, actor_type: 'staff', actor_id: user.id,
    action: 'EDITOR_FILE_DELETE_COMPLETED', booking_id: bookingId,
    metadata: { source, fileId, fileName: String(file.file_name || ''), storageKeys: keys },
  })
  if (completed.error) console.error('Editor file deletion completion audit failed:', completed.error)
  return json({ success: true, fileId })
}
