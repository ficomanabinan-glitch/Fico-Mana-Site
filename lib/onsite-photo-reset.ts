import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { RawUploadError } from '@/lib/raw-upload-contract'
import { assertGraduationBooking } from '@/lib/package-workflow-server'
import { assertStorageKeyOwnership } from '@/lib/storage/storage-keys'
import { deleteObject, getObjectMetadata, StorageError } from '@/lib/storage/storage-service'

type Context = { workspaceId: string; bookingId: string; actorId: string }
type Target = { id: string; storageKey: string; name: string; etag: string | null; size: number }
const safeError = (message: string) => new RawUploadError(`${message} Try: retry Delete Files for this client. If it continues, ask an administrator to review private storage.`, 409)

function adminClient() {
  const admin = getSupabaseAdmin()
  if (!admin) throw safeError('The photo service is unavailable.')
  return admin
}

async function targetFor(storageKey: string, name: string, context: Context): Promise<Target | null> {
  assertStorageKeyOwnership(storageKey, context.workspaceId, context.bookingId)
  try {
    const object = await getObjectMetadata(storageKey)
    return { id: storageKey, storageKey, name, etag: object.etag, size: object.contentLength }
  } catch (error) {
    if (error instanceof StorageError && error.code === 'NOT_FOUND') return null
    throw error
  }
}

export async function beginOnsitePhotoReset(context: Context) {
  const admin = adminClient()
  await assertGraduationBooking(admin, context.bookingId, context.workspaceId)
  const [selection, gallery, job] = await Promise.all([
    admin.from('photo_selections').select('*').eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).single(),
    admin.from('gallery_files').select('*').eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).limit(5001),
    admin.from('editing_jobs').select('status,downloaded_at,editing_started_at,delivered_at').eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).single(),
  ])
  if ([selection, gallery, job].some(result => result.error) || !selection.data || !job.data) throw safeError('Client photo records could not be loaded.')
  if (selection.data.raw_reset_id) return { resetId: String(selection.data.raw_reset_id) }
  if (!['OPEN', 'COPY_FAILED'].includes(selection.data.status) || job.data.status !== 'WAITING_FOR_SELECTION' || job.data.downloaded_at || job.data.editing_started_at || job.data.delivered_at) {
    throw new RawUploadError('This client’s selection is locked or editing has started. Try: ask an administrator to review the client before clearing their photos.', 409)
  }
  if ((gallery.data || []).length > 5000) throw safeError('Too many photos for one reset.')
  const indexedIds = (gallery.data || []).map(file => String(file.id))
  for (let offset = 0; offset < indexedIds.length; offset += 100) {
    for (const table of ['photo_selection_items', 'print_allocations']) {
      const shared = await admin.from(table).select('selection_id').in('gallery_file_id', indexedIds.slice(offset, offset + 100)).neq('selection_id', selection.data.id).limit(1)
      if (shared.error || shared.data?.length) throw safeError('An indexed photo is referenced by another client.')
    }
  }

  const targets = new Map<string, Target>()
  for (const row of gallery.data || []) {
    if (row.storage_provider !== 'r2') continue
    const candidates = [
      [String(row.storage_key || ''), String(row.file_name || 'photo')],
      [String(row.preview_reference || ''), `${String(row.file_name || 'photo')} preview`],
      [String(row.thumbnail_reference || ''), `${String(row.file_name || 'photo')} thumbnail`],
    ]
    for (const [storageKey, name] of candidates) {
      if (!storageKey) continue
      const target = await targetFor(storageKey, name, context)
      if (target) targets.set(storageKey, target)
    }
  }
  if (targets.size > 15_000) throw safeError('Too many stored objects for one reset.')

  const keys = [...targets.keys()]
  for (let index = 0; index < keys.length; index += 100) {
    for (const table of ['gallery_files', 'deliverable_files']) {
      const others = await admin.from(table).select('id').in('storage_key', keys.slice(index, index + 100)).neq('booking_id', context.bookingId).limit(1)
      if (others.error || others.data?.length) throw safeError('A photo is linked to another booking.')
    }
  }
  const { data, error } = await admin.rpc('begin_onsite_photo_reset', {
    p_workspace: context.workspaceId,
    p_booking: context.bookingId,
    p_actor: context.actorId,
    p_generation: Number(selection.data.raw_upload_generation || 0),
    p_gallery_ids: indexedIds,
    p_targets: [...targets.values()],
  })
  if (error || !data) {
    console.error('Onsite reset start:', error)
    throw safeError('The reset could not start. Uploads or setup may have changed.')
  }
  return { resetId: String(data) }
}

export async function continueOnsitePhotoReset(context: Context, resetId: string) {
  const admin = adminClient()
  const { data: reset, error } = await admin.from('onsite_photo_resets').select('*')
    .eq('id', resetId).eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).single()
  if (error || !reset) throw safeError('Reset not found.')
  if (reset.state === 'COMPLETED') return { complete: true, cleared: reset.targets.length, total: reset.targets.length }
  const selection = await admin.from('photo_selections').select('raw_reset_id')
    .eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).single()
  if (selection.error || selection.data?.raw_reset_id !== resetId) throw safeError('The active deletion changed.')

  const targets = reset.targets as Target[]
  const completed = new Set<string>(reset.completed_ids || [])
  for (const target of targets.filter(file => !completed.has(file.id)).slice(0, 10)) {
    try {
      assertStorageKeyOwnership(target.storageKey, context.workspaceId, context.bookingId)
      try {
        const current = await getObjectMetadata(target.storageKey)
        if (current.etag !== target.etag || current.contentLength !== target.size) throw safeError('A photo changed during deletion.')
        await deleteObject(target.storageKey)
      } catch (error) {
        if (!(error instanceof StorageError && error.code === 'NOT_FOUND')) throw error
      }
      completed.add(target.id)
    } catch (error) {
      console.error('Onsite reset target failed:', resetId, target.id, error)
      throw safeError('Some photos could not be cleared. Completed deletions will not be repeated.')
    }
  }
  const saved = await admin.rpc('record_onsite_photo_reset_progress', {
    p_workspace: context.workspaceId, p_booking: context.bookingId, p_reset: resetId, p_completed: [...completed],
  })
  if (saved.error) throw safeError('Deletion progress could not be saved.')
  const complete = Number(saved.data) === targets.length
  if (complete) {
    const result = await admin.rpc('finish_onsite_photo_reset', {
      p_workspace: context.workspaceId, p_booking: context.bookingId, p_reset: resetId,
    })
    if (result.error) {
      console.error('Onsite reset finalization:', result.error)
      throw safeError('Photos were cleared, but the client records could not be refreshed.')
    }
  }
  return { complete, cleared: Number(saved.data), total: targets.length }
}
