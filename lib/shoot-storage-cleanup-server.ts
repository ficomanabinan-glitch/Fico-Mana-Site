import type { SupabaseClient } from '@supabase/supabase-js'
import { getDriveCleanupFile, listDriveCleanupChildren, trashDriveFile, type DriveFile } from '@/lib/google-drive'
import {
  CLEANUP_CHUNK_SIZE, cleanupDateRange, cleanupFingerprint, runCleanupChunk, signCleanupGrant, validateCleanupFile,
  type CleanupCategory, type CleanupFile, type CleanupGrant, type CleanupRange,
} from '@/lib/shoot-storage-cleanup'
import {
  folderTreeFingerprint, runCleanupFolder, signCleanupFolderGrant, validateCleanupFolder,
  type CleanupFolderGrant,
} from '@/lib/shoot-folder-cleanup'

const FOLDER = 'application/vnd.google-apps.folder'
const SHORTCUT = 'application/vnd.google-apps.shortcut'

async function configuredRoot(admin: SupabaseClient, workspaceId: string) {
  const result = await admin.from('google_drive_settings').select('root_folder_id')
    .eq('workspace_id', workspaceId).eq('id', 1).single()
  if (result.error || !result.data?.root_folder_id) throw new Error('Storage root is unavailable.')
  return String(result.data.root_folder_id)
}

export async function listCleanupShoots(admin: SupabaseClient, workspaceId: string, range: CleanupRange, cursor: string) {
  const rootId = await configuredRoot(admin, workspaceId)
  const dates = cleanupDateRange(range)
  let query = admin.from('bookings')
    .select('id,customer_name,booking_date,booking_provisioning!inner(drive_root_folder_id,drive_client_folder_id)')
    .eq('workspace_id', workspaceId).eq('booking_provisioning.drive_root_folder_id', rootId)
    .not('booking_provisioning.drive_client_folder_id', 'is', null).order('id').limit(100)
  if (dates.from && dates.to) query = query.gte('booking_date', dates.from).lte('booking_date', dates.to)
  if (cursor) query = query.gt('id', cursor)
  const result = await query
  if (result.error) throw new Error('Shoot list is unavailable.')
  const shoots = (result.data || []).map(row => ({
    id: String(row.id), name: String(row.customer_name), date: String(row.booking_date),
  }))
  return { shoots, nextCursor: shoots.length === 100 ? shoots.at(-1)!.id : null, dates }
}

async function shootContext(admin: SupabaseClient, workspaceId: string, bookingId: string, resolveCategories = true) {
  const [rootId, booking, provisioning, folders, uploading] = await Promise.all([
    configuredRoot(admin, workspaceId),
    admin.from('bookings').select('id,booking_date,customer_name').eq('workspace_id', workspaceId).eq('id', bookingId).single(),
    admin.from('booking_provisioning').select('drive_root_folder_id,drive_month_folder_id,drive_day_folder_id,drive_client_folder_id')
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).single(),
    admin.from('drive_folders').select('folder_type,drive_folder_id').eq('workspace_id', workspaceId).eq('booking_id', bookingId),
    admin.from('editing_jobs').select('id').eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('status', 'UPLOADING').limit(1),
  ])
  if (booking.error || provisioning.error || folders.error || uploading.error || !booking.data || !provisioning.data) {
    throw new Error('Shoot folder records are unavailable.')
  }
  if (uploading.data?.length) throw new Error('An upload is running for this shoot. Wait until it finishes.')
  const p = provisioning.data
  if (p.drive_root_folder_id !== rootId || !p.drive_client_folder_id || !p.drive_day_folder_id || !p.drive_month_folder_id) {
    throw new Error('Shoot is outside the configured storage root.')
  }
  const chain = [String(p.drive_client_folder_id), String(p.drive_day_folder_id), String(p.drive_month_folder_id), rootId]
  if (new Set(chain).size !== 4) throw new Error('Folder hierarchy is invalid.')
  // Older provisioned shoots can predate the editor's folder index. Resolve only the
  // known category names directly below their registered client folder, without writes.
  const resolvedFolders = [...(folders.data || [])]
  const missing = ['RAW', 'SELECTED', 'EDITED', 'DELIVERABLES'].filter(type => !resolvedFolders.some(folder => folder.folder_type === type))
  if (resolveCategories && missing.length) {
    const names: Record<string, RegExp> = { RAW: /^RAW$/, SELECTED: /^(?:\d+ SELECTED PHOTOS|SELECTED \d+ PHOTOS)$/, EDITED: /^EDITED PHOTOS$/, DELIVERABLES: /^DELIVERABLES$/ }
    const children = await listDriveCleanupChildren(chain[0])
    if (children.nextPageToken) throw new Error('Client folder is too large to resolve safely.')
    for (const type of missing) {
      for (const folder of children.files || []) {
        if (folder.mimeType === FOLDER && names[type].test(folder.name) && folder.parents?.length === 1 && folder.parents[0] === chain[0]) {
          resolvedFolders.push({ folder_type: type, drive_folder_id: folder.id })
        }
      }
    }
  }
  return { rootId, booking: booking.data, folders: resolvedFolders, chain }
}

/** Review all contents, including non-photo files and shortcut objects; never follow shortcuts. */
async function reviewShootFolderTree(admin: SupabaseClient, context: Awaited<ReturnType<typeof shootContext>>, allowTrashed = false) {
  const read = verifiedMetadata()
  await verifyParents(context.chain.slice(1), read)
  const folder = await read(context.chain[0])
  if (folder.mimeType !== FOLDER || folder.parents?.length !== 1 || folder.parents[0] !== context.chain[1]) {
    throw new Error('Shoot folder moved or became unavailable.')
  }
  if (folder.trashed && !allowTrashed) throw new Error('Shoot folder is already in Trash.')
  if (!folder.trashed && folder.capabilities?.canTrash !== true) throw new Error('Drive does not allow this shoot folder to be trashed.')
  const entries: DriveFile[] = [folder]
  const folderIds = [folder.id]
  const visited = new Set(context.chain)
  const deadline = Date.now() + 40_000
  let fileCount = 0, shortcutCount = 0
  const walk = async (parentId: string, depth: number) => {
    let pageToken = ''
    const pages = new Set<string>()
    do {
      if (Date.now() > deadline || depth > 12 || pages.has(pageToken)) throw new Error('Shoot folder is too large to review safely.')
      pages.add(pageToken)
      const page = await listDriveCleanupChildren(parentId, pageToken)
      for (const file of page.files || []) {
        if (file.trashed || file.parents?.length !== 1 || file.parents[0] !== parentId || visited.has(file.id)) {
          throw new Error('Shoot folder contents changed or are ambiguous.')
        }
        visited.add(file.id); entries.push(file)
        if (file.mimeType === FOLDER) {
          folderIds.push(file.id)
          if (folderIds.length > 200) throw new Error('Too many subfolders for one safe review.')
          await walk(file.id, depth + 1)
        } else {
          if (file.mimeType === SHORTCUT) shortcutCount++
          else fileCount++
          if (fileCount + shortcutCount > 5000) throw new Error('Too many files for one safe folder review.')
        }
      }
      pageToken = page.nextPageToken || ''
    } while (pageToken)
  }
  if (!folder.trashed) await walk(folder.id, 0)
  // Protect other bookings even if somebody moved their registered client folder
  // below this one or two provisioning records point at the same Drive folder.
  const otherBookings = await admin.from('booking_provisioning').select('booking_id')
    .in('drive_client_folder_id', folderIds).neq('booking_id', String(context.booking.id)).limit(1)
  if (otherBookings.error || otherBookings.data?.length) throw new Error('Folder is shared with another shoot. Review its folder records first.')
  return { folder, fileCount, shortcutCount, subfolderCount: folderIds.length - 1, treeFingerprint: folderTreeFingerprint(entries) }
}

export async function previewCleanupShootFolder(admin: SupabaseClient, workspaceId: string, actorId: string, bookingId: string, range: CleanupRange) {
  const context = await shootContext(admin, workspaceId, bookingId, false)
  const dates = cleanupDateRange(range), shootDate = String(context.booking.booking_date)
  if (dates.from && dates.to && (shootDate < dates.from || shootDate > dates.to)) throw new Error('Shoot date changed. Review again.')
  const tree = await reviewShootFolderTree(admin, context)
  const expiresAt = Date.now() + 30 * 60 * 1000
  const grant: CleanupFolderGrant = {
    version: 1, kind: 'shoot_folder', workspaceId, actorId, bookingId, rootId: context.rootId, shootDate, expiresAt,
    folder: { id: tree.folder.id, name: tree.folder.name, parents: context.chain.slice(1) as [string, string, string], fingerprint: cleanupFingerprint(tree.folder) },
    treeFingerprint: tree.treeFingerprint, fileCount: tree.fileCount, subfolderCount: tree.subfolderCount, shortcutCount: tree.shortcutCount,
  }
  return { bookingId, name: String(context.booking.customer_name), date: shootDate, expiresAt,
    chunks: [{ token: signCleanupFolderGrant(grant), files: [] }], skippedShortcuts: 0,
    folder: { id: tree.folder.id, name: tree.folder.name, fileCount: tree.fileCount, subfolderCount: tree.subfolderCount, shortcutCount: tree.shortcutCount },
  }
}

export async function executeCleanupShootFolder(admin: SupabaseClient, grant: CleanupFolderGrant) {
  const validate = async () => {
    const context = await shootContext(admin, grant.workspaceId, grant.bookingId, false)
    if (context.rootId !== grant.rootId || String(context.booking.booking_date) !== grant.shootDate
      || context.chain.join('/') !== [grant.folder.id, ...grant.folder.parents].join('/')) {
      throw new Error('The registered shoot folder changed. Review again.')
    }
    const tree = await reviewShootFolderTree(admin, context, true)
    const state = validateCleanupFolder(grant, tree.folder)
    if (state !== 'trashed' && (tree.treeFingerprint !== grant.treeFingerprint || tree.fileCount !== grant.fileCount
      || tree.subfolderCount !== grant.subfolderCount || tree.shortcutCount !== grant.shortcutCount)) {
      throw new Error('Folder contents changed since review. Review again.')
    }
    return state
  }
  const audit = async (action: string, metadata: Record<string, unknown>) => {
    const result = await admin.from('workflow_audit_logs').insert({ workspace_id: grant.workspaceId, actor_type: 'staff',
      actor_id: grant.actorId, booking_id: grant.bookingId, action, metadata })
    if (result.error) throw new Error('Could not record folder cleanup.')
  }
  return runCleanupFolder(grant, {
    validate,
    auditStart: () => audit('SHOOT_FOLDER_CLEANUP_STARTED', { folderId: grant.folder.id, fileCount: grant.fileCount,
      subfolderCount: grant.subfolderCount, shortcutCount: grant.shortcutCount, treeFingerprint: grant.treeFingerprint }),
    disablePortal: async () => {
      const result = await admin.from('client_portals').update({ status: 'disabled', updated_at: new Date().toISOString() })
        .eq('workspace_id', grant.workspaceId).eq('booking_id', grant.bookingId).eq('status', 'active')
      if (result.error) throw new Error('Could not disable the portal; the folder was not moved.')
    },
    // Recheck the entire reviewed tree just before the one folder mutation. No
    // cross-app transaction is possible; uploads/external edits must stay stopped.
    trash: async () => { if (await validate() !== 'trashed') await trashDriveFile(grant.folder.id) },
    auditResult: results => audit('SHOOT_FOLDER_CLEANUP_FINISHED', { folderId: grant.folder.id, results, portalDisabled: true }),
  })
}

function verifiedMetadata() {
  const files = new Map<string, Promise<DriveFile>>()
  return (id: string) => {
    if (!files.has(id)) files.set(id, getDriveCleanupFile(id))
    return files.get(id)!
  }
}

async function verifyParents(chain: string[], read: ReturnType<typeof verifiedMetadata>) {
  for (const [index, id] of chain.entries()) {
    const folder = await read(id)
    if (folder.trashed || folder.mimeType !== FOLDER
      || (index < chain.length - 1 && (folder.parents?.length !== 1 || folder.parents[0] !== chain[index + 1]))) {
      throw new Error('A folder moved or became unavailable. Review again.')
    }
  }
}

export async function previewCleanupShoot(admin: SupabaseClient, workspaceId: string, actorId: string,
  bookingId: string, range: CleanupRange, categories: CleanupCategory[]) {
  const context = await shootContext(admin, workspaceId, bookingId)
  const dates = cleanupDateRange(range)
  const shootDate = String(context.booking.booking_date)
  if (dates.from && dates.to && (shootDate < dates.from || shootDate > dates.to)) throw new Error('Shoot date changed. Review again.')
  const read = verifiedMetadata()
  await verifyParents(context.chain, read)
  const files: CleanupFile[] = []
  const visited = new Set(context.chain)
  const deadline = Date.now() + 40_000
  let skippedShortcuts = 0
  const walk = async (parents: string[], category: CleanupCategory): Promise<void> => {
    const id = parents[0]
    if (visited.has(id) || parents.length > 12 || visited.size >= 200) throw new Error('Folder structure is too large or ambiguous.')
    visited.add(id)
    await verifyParents(parents, read)
    let pageToken = ''
    const pages = new Set<string>()
    do {
      if (Date.now() > deadline || files.length > 5000 || pages.has(pageToken)) throw new Error('Shoot is too large for one safe review.')
      pages.add(pageToken)
      const page = await listDriveCleanupChildren(id, pageToken)
      for (const file of page.files || []) {
        if (file.parents?.length !== 1 || file.parents[0] !== id || file.trashed) throw new Error('File location changed. Review again.')
        if (file.mimeType === SHORTCUT) { skippedShortcuts++; continue }
        if (file.mimeType === FOLDER) await walk([file.id, ...parents], category)
        else files.push({ id: file.id, name: file.name, category, parents, fingerprint: cleanupFingerprint(file) })
      }
      pageToken = page.nextPageToken || ''
    } while (pageToken)
  }
  for (const category of categories) {
    const matches = context.folders.filter(folder => folder.folder_type === category)
    if (matches.length > 1) throw new Error('Duplicate folder records need review in Client Portals.')
    if (matches[0]) await walk([String(matches[0].drive_folder_id), ...context.chain], category)
  }
  if (files.length > 5000 || new Set(files.map(file => file.id)).size !== files.length) throw new Error('Too many or duplicate file targets.')
  const expiresAt = Date.now() + 30 * 60 * 1000
  const chunks = []
  for (let index = 0; index < files.length; index += CLEANUP_CHUNK_SIZE) {
    const items = files.slice(index, index + CLEANUP_CHUNK_SIZE)
    chunks.push({ token: signCleanupGrant({ version: 1, workspaceId, actorId, bookingId, rootId: context.rootId,
      shootDate, files: items, expiresAt }), files: items.map(({ id, name, category }) => ({ id, name, category })) })
  }
  return { bookingId, name: String(context.booking.customer_name), date: shootDate, chunks, skippedShortcuts, expiresAt }
}

export async function executeCleanupShoot(admin: SupabaseClient, grant: CleanupGrant) {
  const context = await shootContext(admin, grant.workspaceId, grant.bookingId)
  if (context.rootId !== grant.rootId || String(context.booking.booking_date) !== grant.shootDate) throw new Error('Shoot settings changed. Review again.')
  const read = verifiedMetadata()
  const audit = async (action: string, metadata: Record<string, unknown>) => {
    const result = await admin.from('workflow_audit_logs').insert({ workspace_id: grant.workspaceId,
      actor_type: 'staff', actor_id: grant.actorId, booking_id: grant.bookingId, action, metadata })
    if (result.error) throw new Error('Could not record the storage cleanup result.')
  }
  return runCleanupChunk(grant, {
    validate: async file => {
      if (file.parents.slice(-4).join('/') !== context.chain.join('/')) throw new Error('Shoot folder changed. Review again.')
      const categoryId = file.parents[file.parents.length - 5]
      const matches = context.folders.filter(folder => folder.folder_type === file.category)
      if (matches.length !== 1 || matches[0].drive_folder_id !== categoryId || file.parents.includes(file.id)
        || new Set(file.parents).size !== file.parents.length) throw new Error('File is outside its approved folder.')
      await verifyParents(file.parents, read)
      return validateCleanupFile(file, await read(file.id))
    },
    auditStart: () => audit('SHOOT_STORAGE_CLEANUP_STARTED', { fileIds: grant.files.map(file => file.id), categories: [...new Set(grant.files.map(file => file.category))] }),
    disablePortal: async () => {
      const result = await admin.from('client_portals').update({ status: 'disabled', updated_at: new Date().toISOString() })
        .eq('workspace_id', grant.workspaceId).eq('booking_id', grant.bookingId).eq('status', 'active')
      if (result.error) throw new Error('Could not disable the client portal; no files were moved.')
    },
    trash: async file => {
      // Refresh the file immediately before the mutation, not just at chunk start.
      if (validateCleanupFile(file, await getDriveCleanupFile(file.id)) === 'present') await trashDriveFile(file.id)
    },
    auditResult: results => audit('SHOOT_STORAGE_CLEANUP_FINISHED', { results: results.map(({ id, status }) => ({ id, status })), portalDisabled: true }),
  })
}
