import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { ensureBookingFolders } from '@/lib/editor-workflow'
import { createDriveResumableUpload, findOrCreateFolder, getDriveFile, getDriveFolder, listDriveFiles,
  normalizeDriveFolderName, openDriveFile, promoteRawUpload } from '@/lib/google-drive'
import { readBoundedResponse } from '@/lib/security/outbound-url'
import { validatePhotographyFileContent } from '@/lib/security/file-validation'
import { scanUpload } from '@/lib/security/upload-scanner'
import { MAX_RAW_UPLOAD_BYTES, RawUploadError, rawUploadMetadataSchema, validateRawSessionUrl } from '@/lib/raw-upload-contract'
import { signRawUploadGrant, verifyRawUploadGrant } from '@/lib/raw-upload-grant'
import type { RawUploadMetadata } from '@/lib/raw-upload-contract'

type Context = { workspaceId: string; bookingId: string; actorId: string }
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
function adminClient() {
  const admin = getSupabaseAdmin()
  if (!admin) throw new RawUploadError('The upload service is unavailable. Try: refresh the page and retry.', 503)
  return admin
}
function photoMime(name: string) {
  const extension = name.split('.').at(-1)!.toLowerCase()
  const known: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif' }
  return known[extension] || 'application/octet-stream'
}

export async function startRawUpload(context: Context, supplied: RawUploadMetadata) {
  const metadata = rawUploadMetadataSchema.parse(supplied)
  metadata.fileName = normalizeDriveFolderName(metadata.fileName)
  const admin = adminClient()
  const { hierarchy } = await ensureBookingFolders(admin, context.workspaceId, context.bookingId)
  // Quarantine is inside Drive, not Vercel Blob. Pending files are not exposed in the client portal.
  const incoming = await findOrCreateFolder(hierarchy.raw.id, '_UPLOADS')
  const uploadKey = sha256(JSON.stringify([context.workspaceId, context.bookingId, metadata.fileName, metadata.fileSize, metadata.checksum]))
  const expiresAt = Date.now() + 60 * 60 * 1000
  const grant = signRawUploadGrant({ ...context, ...metadata, version: 1,
    rawFolderId: hierarchy.raw.id, incomingFolderId: incoming.id, uploadKey, expiresAt })
  const candidates = [...await listDriveFiles(hierarchy.raw.id), ...await listDriveFiles(incoming.id)]
  const completed = candidates.find(file => file.appProperties?.rawUploadKey === uploadKey &&
    file.appProperties?.bookingId === context.bookingId && file.appProperties?.purpose === 'raw' &&
    file.appProperties?.checksum === metadata.checksum && Number(file.size) === metadata.fileSize && file.name === metadata.fileName)
  const mimeType = photoMime(metadata.fileName)
  if (completed) return { grant, expiresAt, mimeType, driveFileId: completed.id }
  const uploadUrl = validateRawSessionUrl(await createDriveResumableUpload({
    destinationFolderId: incoming.id, bookingId: context.bookingId, relativePath: `RAW/${metadata.fileName}`,
    ...metadata, mimeType, purpose: 'raw', uploadKey,
  }))
  return { grant, expiresAt, mimeType, uploadUrl }
}

export async function completeRawUpload(context: Context, token: string, driveFileId: string) {
  // Validate signed ownership before touching a caller-supplied Drive ID.
  const grant = verifyRawUploadGrant(token, context.workspaceId, context.actorId, context.bookingId)
  const admin = adminClient()
  const { hierarchy, booking, batch } = await ensureBookingFolders(admin, context.workspaceId, context.bookingId)
  if (hierarchy.raw.id !== grant.rawFolderId) {
    throw new RawUploadError('The client folder changed during upload. Try: refresh the client folder and select the photo again.', 409)
  }
  const incoming = await getDriveFolder(grant.incomingFolderId)
  if (!incoming.parents?.includes(grant.rawFolderId)) throw new RawUploadError('The upload folder moved. Try: refresh the client folder and retry.', 409)
  const file = await getDriveFile(driveFileId)
  if (file.appProperties?.bookingId !== context.bookingId || file.appProperties?.purpose !== 'raw' ||
    file.appProperties?.rawUploadKey !== grant.uploadKey || file.appProperties?.checksum !== grant.checksum ||
    file.appProperties?.relativePath !== `RAW/${grant.fileName}` || file.name !== grant.fileName ||
    file.parents?.length !== 1 || ![grant.incomingFolderId, grant.rawFolderId].includes(file.parents[0]) ||
    file.mimeType === 'application/vnd.google-apps.shortcut' || Number(file.size) !== grant.fileSize) {
    throw new RawUploadError('The uploaded photo does not match this client or file. Try: select the correct photo and upload it again.', 409)
  }
  const data = await readBoundedResponse(await openDriveFile(file.id), MAX_RAW_UPLOAD_BYTES)
  if (data.length !== grant.fileSize || sha256(data) !== grant.checksum) {
    throw new RawUploadError('The photo did not pass the upload check. Try: select the original photo and retry.', 409)
  }
  try { validatePhotographyFileContent(data, grant.fileName) } catch {
    throw new RawUploadError('The file content does not match a supported photo. Try: select the original JPG or camera RAW file.', 415)
  }
  const scan = await scanUpload({ buffer: data, fileName: grant.fileName, mimeType: photoMime(grant.fileName), purpose: 'raw-photo' })
  if (scan.status === 'rejected') throw new RawUploadError('The photo was rejected by the security check. Try: select a clean original file.', 415)
  const { error: auditError } = await admin.from('workflow_audit_logs').insert({
    workspace_id: context.workspaceId, actor_type: 'staff', actor_id: context.actorId,
    action: 'RAW_UPLOAD_VERIFIED', booking_id: context.bookingId, batch_id: batch.id,
    metadata: { driveFileId: file.id, checksum: grant.checksum, fileSize: grant.fileSize },
  })
  if (auditError) throw new RawUploadError('The upload check could not be saved. Try: retry the failed file; the original is already in Drive.', 503)
  // Moving the new verified upload is not a replacement of any existing original.
  const promoted = await promoteRawUpload(file, grant.incomingFolderId, grant.rawFolderId)
  let thumbnailReference: string | null = promoted.thumbnailLink || null
  // Reuse the existing preview bucket; the full-resolution original remains exclusively in Drive.
  // This avoids serving a >4.5 MB original through a portal image endpoint while Drive makes its thumbnail.
  if (/\.(jpe?g|png|webp|tiff?)$/i.test(grant.fileName)) {
    try {
      const preview = await sharp(data, { failOn: 'error', limitInputPixels: 80_000_000 })
        .rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
      const path = `${context.workspaceId}/${context.bookingId}/${promoted.id}.jpg`
      const { error: previewError } = await admin.storage.from('fico-mana-thumbnails')
        .upload(path, preview, { contentType: 'image/jpeg', upsert: true })
      if (!previewError) thumbnailReference = path
    } catch { /* Camera formats/preview outages can still use Google's generated thumbnail. */ }
  }
  const { data: gallery, error } = await admin.from('gallery_files').upsert({
    workspace_id: context.workspaceId, booking_id: context.bookingId, client_id: booking.client_id,
    drive_file_id: promoted.id, file_name: promoted.name, mime_type: photoMime(promoted.name),
    file_size: grant.fileSize, checksum: grant.checksum,
    thumbnail_reference: thumbnailReference, preview_reference: promoted.thumbnailLink || null,
  }, { onConflict: 'workspace_id,drive_file_id' }).select('id,file_name,drive_file_id').single()
  if (error || !gallery) throw new RawUploadError('The original reached Drive, but the portal could not be updated. Try: retry the failed file or click Sync Drive.', 503)
  return { success: true, file: gallery }
}
