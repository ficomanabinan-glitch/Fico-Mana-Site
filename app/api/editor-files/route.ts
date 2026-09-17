import { NextRequest, NextResponse } from 'next/server'
import { requireWorkflowAuth } from '@/lib/auth-api'
import { canUseWorkflow } from '@/lib/auth/workflow'
import { createDownloadUrl } from '@/lib/storage/presigned-urls'
import { assertStorageKeyOwnership, parseStorageKey } from '@/lib/storage/storage-keys'
import { deleteObjects } from '@/lib/storage/storage-service'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

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
      storageKey, previewAvailable: Boolean(row.thumbnail_reference || row.preview_reference),
    }
  } catch { return null }
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
    const url = await createDownloadUrl({ key: previewKey, expiresIn: 5 * 60,
      inline: true, downloadName: String(result.data.file_name || ('relative_path' in result.data ? result.data.relative_path : '') || 'studio-file') })
    return NextResponse.redirect(url, { status: 307, headers: { ...headers, 'referrer-policy': 'no-referrer' } })
  }

  const fileRows = async (ids?: string[]) => {
    const galleryQuery = admin.from('gallery_files').select('id,booking_id,storage_key,file_name,mime_type,file_size,thumbnail_reference,preview_reference,created_at,updated_at')
      .eq('workspace_id', access.workspaceId).eq('storage_status', 'available')
    const deliverableQuery = admin.from('deliverable_files').select('id,booking_id,storage_key,file_name,relative_path,file_size,published_at,updated_at')
      .eq('workspace_id', access.workspaceId).eq('storage_status', 'available')
    if (ids?.length) {
      galleryQuery.in('booking_id', ids)
      deliverableQuery.in('booking_id', ids)
    }
    if (bookingId) {
      galleryQuery.eq('booking_id', bookingId)
      deliverableQuery.eq('booking_id', bookingId)
    }
    const [gallery, deliverables] = await Promise.all([galleryQuery.limit(5000), deliverableQuery.limit(5000)])
    if (gallery.error || deliverables.error) throw new Error(gallery.error?.message || deliverables.error?.message)
    return [
      ...(gallery.data || []).map((row) => indexedFile(row, 'gallery')),
      ...(deliverables.data || []).map((row) => indexedFile(row, 'deliverable')),
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
      const bookings = await admin.from('bookings').select('id,customer_name,package_name,booking_date')
        .eq('workspace_id', access.workspaceId).eq('booking_date', shootDate).order('customer_name')
      if (bookings.error) throw new Error(bookings.error.message)
      const ids = (bookings.data || []).map((row) => String(row.id))
      const files = ids.length ? await fileRows(ids) : []
      const counts = new Map<string, number>()
      for (const file of files) counts.set(file.bookingId, (counts.get(file.bookingId) || 0) + 1)
      return json({ level: 'clients', shootDate, items: (bookings.data || [])
        .filter((row) => counts.has(String(row.id))).map((row) => ({ ...row, fileCount: counts.get(String(row.id)) })) })
    }

    const files = await fileRows()
    const ids = [...new Set(files.map((file) => file.bookingId))]
    if (!ids.length) return json({ level: 'dates', items: [] })
    const bookings = await admin.from('bookings').select('id,booking_date').eq('workspace_id', access.workspaceId).in('id', ids)
    if (bookings.error) throw new Error(bookings.error.message)
    const counts = new Map<string, number>()
    const dateByBooking = new Map((bookings.data || []).map((row) => [String(row.id), String(row.booking_date)]))
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
