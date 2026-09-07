import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getDriveCleanupFile, listDriveCleanupChildren, trashDriveFile, GoogleDriveRequestError, type DriveFile } from '@/lib/google-drive'
import { RawUploadError } from '@/lib/raw-upload-contract'
import { assertGraduationBooking } from '@/lib/package-workflow-server'

type Context = { workspaceId: string; bookingId: string; actorId: string }
type Target = { id: string; name: string; parents: string[]; mimeType: string; modifiedTime?: string; kind: 'drive' | 'thumbnail' }
const FOLDER = 'application/vnd.google-apps.folder'
const safeError = (message: string) => new RawUploadError(`${message} Try: retry Delete Files for this client. If it continues, ask an administrator to check the Drive files.`, 409)
function adminClient() {
  const admin = getSupabaseAdmin()
  if (!admin) throw safeError('The photo service is unavailable.')
  return admin
}
async function fileOrMissing(id: string) {
  try { return await getDriveCleanupFile(id) } catch (error) {
    if (error instanceof GoogleDriveRequestError && error.status === 404) return null
    throw error
  }
}

export async function beginOnsitePhotoReset(context: Context) {
  const admin = adminClient()
  await assertGraduationBooking(admin, context.bookingId, context.workspaceId)
  const [selection, gallery, folders, job] = await Promise.all([
    admin.from('photo_selections').select('*').eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).single(),
    admin.from('gallery_files').select('*').eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).limit(5001),
    admin.from('drive_folders').select('folder_type,drive_folder_id').eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId),
    admin.from('editing_jobs').select('status,downloaded_at,editing_started_at,delivered_at').eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId).single(),
  ])
  if ([selection, gallery, folders, job].some(result => result.error) || !selection.data || !job.data) throw safeError('Client photo records could not be loaded.')
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
  const galleryIds = new Set((gallery.data || []).map(file => String(file.id)))
  const roots = folders.data || []
  const raw = roots.find(row => row.folder_type === 'RAW')?.drive_folder_id
  const client = roots.find(row => row.folder_type === 'CLIENT')?.drive_folder_id
  const selected = roots.find(row => row.folder_type === 'SELECTED')?.drive_folder_id
  for (const type of ['CLIENT', 'RAW', 'SELECTED']) if (roots.filter(row => row.folder_type === type).length > 1) throw safeError('More than one folder is linked to this client.')
  const mappedIds = roots.map(row => String(row.drive_folder_id))
  if (mappedIds.length) {
    const shared = await admin.from('drive_folders').select('id').in('drive_folder_id', mappedIds).neq('booking_id', context.bookingId).limit(1)
    if (shared.error || shared.data?.length) throw safeError('A folder is linked to another booking.')
  }
  if (client) {
    const folder = await fileOrMissing(String(client))
    if (folder && (folder.mimeType !== FOLDER || folder.appProperties?.bookingId && folder.appProperties.bookingId !== context.bookingId)) throw safeError('The client folder could not be verified.')
  }
  const validParents = new Set<string>(raw ? [String(raw)] : [])
  const addFile = (file: DriveFile) => {
    if (file.mimeType.startsWith('application/vnd.google-apps.')) throw safeError('A photo reference points to a folder or shortcut.')
    if (file.appProperties?.bookingId && file.appProperties.bookingId !== context.bookingId) throw safeError('A file belongs to another client.')
    targets.set(file.id, { id: file.id, name: file.name, parents: file.parents || [], mimeType: file.mimeType, modifiedTime: file.modifiedTime, kind: 'drive' })
  }
  const verifyFolder = async (id: string, parent: string) => {
    const folder = await fileOrMissing(id)
    if (!folder || folder.trashed) return false
    if (folder.mimeType !== FOLDER || folder.parents?.length !== 1 || folder.parents[0] !== parent || folder.appProperties?.bookingId && folder.appProperties.bookingId !== context.bookingId) throw safeError('The client folder moved or belongs to another booking.')
    return true
  }
  const list = async (id: string) => {
    const files: DriveFile[] = []
    let token = ''
    do {
      const page = await listDriveCleanupChildren(id, token)
      files.push(...(page.files || []))
      if (files.length > 5000) throw safeError('There are too many files in one folder to clear safely.')
      token = page.nextPageToken || ''
    } while (token)
    return files
  }
  // Only current registered RAW files and system-generated selected copies are included.
  if (raw && client && await verifyFolder(String(raw), String(client))) {
    for (const file of await list(String(raw))) {
      if (file.mimeType === FOLDER && file.name === '_UPLOADS') {
        validParents.add(file.id)
        for (const pending of await list(file.id)) {
          if (pending.appProperties?.bookingId === context.bookingId && pending.appProperties?.purpose === 'raw') addFile(pending)
        }
      } else if (!file.mimeType.startsWith('application/vnd.google-apps.') && /\.(jpe?g|png|webp|tiff?|heic|heif|dng|cr2|cr3|nef|arw|orf|rw2|raf)$/i.test(file.name)) addFile(file)
    }
  }
  for (const row of gallery.data || []) {
    const file = await fileOrMissing(String(row.drive_file_id))
    if (file && !file.trashed) {
      // A moved original is no longer an upload in this client's folder. Clear its stale
      // index below, but never reach outside the confirmed folders to trash the file.
      if (file.parents?.length === 1 && validParents.has(file.parents[0])) addFile(file)
    }
    const path = String(row.thumbnail_reference || '')
    if (path.startsWith(`${context.workspaceId}/${context.bookingId}/`) && !path.includes('..') && !path.includes('://')) {
      targets.set(`thumbnail:${path}`, { id: `thumbnail:${path}`, name: path, parents: [], mimeType: 'image/jpeg', kind: 'thumbnail' })
    }
  }
  if (selected && client && await verifyFolder(String(selected), String(client))) {
    const inspectSelected = async (id: string) => {
      for (const file of await list(id)) {
        if (file.appProperties?.bookingId !== context.bookingId) continue
        if (file.appProperties?.purpose === 'print-manifest' || galleryIds.has(file.appProperties?.galleryFileId || '') && ['selected','selected-enhanced','extra-edit'].includes(file.appProperties?.purpose || '')) addFile(file)
      }
    }
    await inspectSelected(String(selected))
    for (const child of await list(String(selected))) if (child.mimeType === FOLDER && child.name === 'EXTRA EDITS') await inspectSelected(child.id)
  }
  if (targets.size > 5000) throw safeError('Too many files for one reset.')
  // Never trash an indexed original/copy shared by another booking, even with corrupt folder mappings.
  const driveIds = [...targets.values()].filter(file => file.kind === 'drive').map(file => file.id)
  for (let index = 0; index < driveIds.length; index += 100) {
    for (const table of ['gallery_files', 'deliverable_files']) {
      const others = await admin.from(table).select('id').in('drive_file_id', driveIds.slice(index,index+100)).neq('booking_id',context.bookingId).limit(1)
      if (others.error || others.data?.length) throw safeError('A photo is shared with another booking.')
    }
    const copies = await admin.from('photo_selection_items').select('selection_id').in('selected_drive_file_id', driveIds.slice(index,index+100)).neq('selection_id',selection.data.id).limit(1)
    if (copies.error || copies.data?.length) throw safeError('A selected copy belongs to another client.')
  }
  const { data, error } = await admin.rpc('begin_onsite_photo_reset', { p_workspace: context.workspaceId, p_booking: context.bookingId,
    p_actor: context.actorId, p_generation: Number(selection.data.raw_upload_generation || 0), p_gallery_ids: [...galleryIds], p_targets: [...targets.values()] })
  if (error || !data) { console.error('Onsite reset start:', error); throw safeError('The reset could not start. Uploads or setup may have changed.') }
  return { resetId: String(data) }
}

export async function continueOnsitePhotoReset(context: Context, resetId: string) {
  const admin = adminClient()
  const { data: reset, error } = await admin.from('onsite_photo_resets').select('*').eq('id',resetId).eq('workspace_id',context.workspaceId).eq('booking_id',context.bookingId).single()
  if (error || !reset) throw safeError('Reset not found.')
  if (reset.state === 'COMPLETED') return { complete: true, cleared: reset.targets.length, total: reset.targets.length }
  const selection = await admin.from('photo_selections').select('raw_reset_id').eq('workspace_id',context.workspaceId).eq('booking_id',context.bookingId).single()
  if (selection.error || selection.data?.raw_reset_id !== resetId) throw safeError('The active deletion changed.')
  const targets = reset.targets as Target[], completed = new Set<string>(reset.completed_ids || [])
  for (const target of targets.filter(file => !completed.has(file.id)).slice(0,10)) {
    try {
      if (target.kind === 'thumbnail') {
        if (!target.name.startsWith(`${context.workspaceId}/${context.bookingId}/`) || target.name.includes('..')) throw safeError('Invalid preview path.')
        const result = await admin.storage.from('fico-mana-thumbnails').remove([target.name])
        if (result.error) throw result.error
      } else {
        const file = await fileOrMissing(target.id)
        if (file && !file.trashed) {
          if (file.mimeType !== target.mimeType || file.name !== target.name || JSON.stringify(file.parents) !== JSON.stringify(target.parents)
            || file.modifiedTime !== target.modifiedTime || file.appProperties?.bookingId && file.appProperties.bookingId !== context.bookingId) throw safeError('A photo changed during deletion.')
          await trashDriveFile(file.id)
        }
      }
      completed.add(target.id)
    } catch (error) { console.error('Onsite reset target failed:', resetId, target.id, error); throw safeError('Some photos could not be cleared. Completed deletions will not be repeated.') }
  }
  const saved = await admin.rpc('record_onsite_photo_reset_progress', { p_workspace:context.workspaceId,p_booking:context.bookingId,p_reset:resetId,p_completed:[...completed] })
  if (saved.error) throw safeError('Deletion progress could not be saved.')
  const complete = Number(saved.data) === targets.length
  if (complete) {
    const result = await admin.rpc('finish_onsite_photo_reset', { p_workspace:context.workspaceId,p_booking:context.bookingId,p_reset:resetId })
    if (result.error) { console.error('Onsite reset finalization:', result.error); throw safeError('Photos were cleared, but the client records could not be refreshed.') }
  }
  return { complete, cleared:Number(saved.data),total:targets.length }
}
