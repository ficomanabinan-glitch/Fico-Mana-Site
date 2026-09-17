import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { activateClientPortalAfterOnsiteUpload, ensureBookingStorage } from '@/lib/editor-workflow'
import { validatePhotographyFileContent } from '@/lib/security/file-validation'
import { scanUpload } from '@/lib/security/upload-scanner'
import { MAX_RAW_UPLOAD_BYTES, RawUploadError, rawUploadMetadataSchema } from '@/lib/raw-upload-contract'
import { signRawUploadGrant, verifyRawUploadGrant } from '@/lib/raw-upload-grant'
import type { RawUploadMetadata } from '@/lib/raw-upload-contract'
import { rawUploadGeneration } from '@/lib/raw-upload-generation'
import { createUploadUrl } from '@/lib/storage/presigned-urls'
import {
  MULTIPART_PART_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  completeMultipartUpload,
  createMultipartPartUrl,
  createMultipartUpload,
} from '@/lib/storage/multipart-upload'
import { createDerivativeKey, createStorageKey } from '@/lib/storage/storage-keys'
import { hasSameFileName } from '@/lib/storage/file-name-policy'
import { deleteObjects, getObjectMetadata, objectExists, readObject, uploadObject } from '@/lib/storage/storage-service'

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

function safeFileName(value: string) {
  return value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export async function startRawUpload(context: Context, supplied: RawUploadMetadata) {
  const metadata = rawUploadMetadataSchema.parse(supplied)
  metadata.fileName = safeFileName(metadata.fileName)
  const admin = adminClient()
  const { booking } = await ensureBookingStorage(admin, context.workspaceId, context.bookingId)
  const generation = await rawUploadGeneration(admin, context.workspaceId, context.bookingId)
  const uploadKey = sha256(JSON.stringify([
    context.workspaceId,
    context.bookingId,
    metadata.fileName,
    metadata.fileSize,
    metadata.checksum,
    generation,
  ]))
  const storageKey = createStorageKey({
    workspaceId: context.workspaceId,
    bookingId: context.bookingId,
    shootDate: String(booking.booking_date),
    category: 'raw',
    objectId: uploadKey.slice(0, 40),
    fileName: metadata.fileName,
  })
  const expiresAt = Date.now() + 60 * 60 * 1000
  const grant = signRawUploadGrant({ ...context, ...metadata, version: 2, storageKey, uploadKey, expiresAt, generation })
  const mimeType = photoMime(metadata.fileName)

  const { data: namedFiles, error: namedFilesError } = await admin.from('gallery_files')
    .select('id,storage_key,file_name,file_size,checksum')
    .eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId)
    .eq('storage_status', 'available').limit(5_000)
  if (namedFilesError) throw new RawUploadError('Existing filenames could not be checked. Try: refresh the client folder and retry.', 503)
  const namedFile = (namedFiles || []).find((file) => hasSameFileName(String(file.file_name || ''), metadata.fileName))
  if (namedFile && (String(namedFile.checksum || '') !== metadata.checksum || Number(namedFile.file_size || 0) !== metadata.fileSize)) {
    throw new RawUploadError(`A file named ${metadata.fileName} already exists in this client folder. Rename the new file before uploading.`, 409)
  }

  const { data: completed } = await admin.from('gallery_files').select('id,storage_key,file_name')
    .eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId)
    .eq('checksum', metadata.checksum).eq('file_size', metadata.fileSize)
    .eq('storage_status', 'available').maybeSingle()
  if (completed && await objectExists(String(completed.storage_key))) {
    const completedStorageKey = String(completed.storage_key)
    const completedGrant = signRawUploadGrant({
      ...context,
      ...metadata,
      version: 2,
      storageKey: completedStorageKey,
      uploadKey,
      expiresAt,
      generation,
    })
    return { grant: completedGrant, expiresAt, mimeType, storageKey: completedStorageKey, completed: true }
  }

  const objectMetadata = {
    bookingid: context.bookingId,
    uploadkey: uploadKey,
    generation: String(generation),
    filename: metadata.fileName,
    sha256: metadata.checksum,
  }
  if (metadata.fileSize >= MULTIPART_THRESHOLD_BYTES) {
    const multipart = await createMultipartUpload({ key: storageKey, contentType: mimeType, checksum: metadata.checksum, metadata: objectMetadata })
    const partCount = Math.ceil(metadata.fileSize / MULTIPART_PART_BYTES)
    const parts = await Promise.all(Array.from({ length: partCount }, async (_, index) => ({
      partNumber: index + 1,
      url: await createMultipartPartUrl({ key: storageKey, uploadId: multipart.uploadId, partNumber: index + 1 }),
    })))
    const { error } = await admin.from('storage_multipart_uploads').insert({
      workspace_id: context.workspaceId,
      booking_id: context.bookingId,
      storage_key: storageKey,
      upload_id: multipart.uploadId,
      category: 'raw',
      expected_size: metadata.fileSize,
      expected_checksum: metadata.checksum,
      mime_type: mimeType,
      original_filename: metadata.fileName,
      status: 'uploading',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    if (error) throw new RawUploadError('The resumable upload could not be saved. Try: select the file again.', 503)
    return { grant, expiresAt, mimeType, storageKey, upload: { mode: 'multipart' as const, uploadId: multipart.uploadId, partSize: MULTIPART_PART_BYTES, parts } }
  }

  const upload = await createUploadUrl({ key: storageKey, contentType: mimeType, checksum: metadata.checksum, metadata: objectMetadata })
  return { grant, expiresAt, mimeType, storageKey, upload: { mode: 'single' as const, url: upload.url, headers: upload.headers } }
}

export async function completeRawUpload(
  context: Context,
  token: string,
  completion: { storageKey: string; uploadId?: string; parts?: Array<{ partNumber: number; etag: string }> },
) {
  const grant = verifyRawUploadGrant(token, context.workspaceId, context.actorId, context.bookingId)
  if (completion.storageKey !== grant.storageKey) {
    throw new RawUploadError('The uploaded photo does not match this client or file. Try: select the correct photo and upload it again.', 409)
  }
  const admin = adminClient()
  const { booking, batch } = await ensureBookingStorage(admin, context.workspaceId, context.bookingId)
  const generation = await rawUploadGeneration(admin, context.workspaceId, context.bookingId)
  if (generation !== (grant.generation || 0)) {
    throw new RawUploadError('These uploads were cleared. Try: refresh the client and select the correct photos again.', 409)
  }

  if (completion.uploadId) {
    const { data: session, error } = await admin.from('storage_multipart_uploads').select('*')
      .eq('workspace_id', context.workspaceId).eq('booking_id', context.bookingId)
      .eq('storage_key', grant.storageKey).eq('upload_id', completion.uploadId)
      .eq('status', 'uploading').gt('expires_at', new Date().toISOString()).maybeSingle()
    if (error || !session) throw new RawUploadError('The resumable upload expired. Try: select the file again.', 409)
    await completeMultipartUpload({ key: grant.storageKey, uploadId: completion.uploadId, parts: completion.parts || [] })
    await admin.from('storage_multipart_uploads').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', session.id)
  }

  const object = await getObjectMetadata(grant.storageKey)
  if (object.contentLength !== grant.fileSize || object.metadata.bookingid !== context.bookingId ||
      object.metadata.uploadkey !== grant.uploadKey || object.metadata.sha256 !== grant.checksum ||
      object.metadata.filename !== grant.fileName || Number(object.metadata.generation) !== generation) {
    throw new RawUploadError('The uploaded photo does not match this client or file. Try: select the correct photo and upload it again.', 409)
  }

  const data = await readObject(grant.storageKey, MAX_RAW_UPLOAD_BYTES)
  if (data.length !== grant.fileSize || sha256(data) !== grant.checksum) {
    throw new RawUploadError('The photo did not pass the upload check. Try: select the original photo and retry.', 409)
  }
  try {
    validatePhotographyFileContent(data, grant.fileName)
  } catch {
    throw new RawUploadError('The file content does not match a supported photo. Try: select the original JPG or camera RAW file.', 415)
  }
  const scan = await scanUpload({ buffer: data, fileName: grant.fileName, mimeType: photoMime(grant.fileName), purpose: 'raw-photo' })
  if (scan.status === 'rejected') throw new RawUploadError('The photo was rejected by the security check. Try: select a clean original file.', 415)

  let thumbnailReference: string | null = null
  let previewReference: string | null = null
  if (/^image\/(?:jpeg|png|webp|tiff)$/i.test(photoMime(grant.fileName))) {
    try {
      const source = sharp(data, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate()
      const [preview, thumbnail] = await Promise.all([
        source.clone().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer(),
        source.clone().resize(480, 480, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
      ])
      previewReference = createDerivativeKey(grant.storageKey, 'preview')
      thumbnailReference = createDerivativeKey(grant.storageKey, 'thumbnail')
      await Promise.all([
        uploadObject({ key: previewReference, body: preview, contentType: 'image/webp', contentLength: preview.length,
          checksum: sha256(preview), cacheControl: 'private, max-age=31536000, immutable' }),
        uploadObject({ key: thumbnailReference, body: thumbnail, contentType: 'image/webp', contentLength: thumbnail.length,
          checksum: sha256(thumbnail), cacheControl: 'private, max-age=31536000, immutable' }),
      ])
    } catch (error) {
      console.error('RAW derivative generation failed:', error)
    }
  }

  const timestamp = new Date().toISOString()
  const { error: auditError } = await admin.from('workflow_audit_logs').insert({
    workspace_id: context.workspaceId,
    actor_type: 'staff',
    actor_id: context.actorId,
    action: 'RAW_UPLOAD_VERIFIED',
    booking_id: context.bookingId,
    batch_id: batch.id,
    metadata: { storageKey: grant.storageKey, checksum: grant.checksum, fileSize: grant.fileSize },
  })
  if (auditError) throw new RawUploadError('The upload check could not be saved. Try: retry the failed file; the original is already stored.', 503)

  const galleryPayload = {
    upload_generation: generation,
    workspace_id: context.workspaceId,
    booking_id: context.bookingId,
    client_id: booking.client_id,
    storage_provider: 'r2',
    storage_key: grant.storageKey,
    storage_status: 'available',
    etag: object.etag,
    file_name: grant.fileName,
    mime_type: photoMime(grant.fileName),
    file_size: grant.fileSize,
    checksum: grant.checksum,
    thumbnail_reference: thumbnailReference,
    preview_reference: previewReference,
    updated_at: timestamp,
  }

  const existingResult = await admin.from('gallery_files').select('id')
    .eq('workspace_id', context.workspaceId).eq('storage_key', grant.storageKey).maybeSingle()
  if (existingResult.error) {
    console.error('RAW gallery lookup failed', { code: existingResult.error.code, hint: existingResult.error.hint })
    throw new RawUploadError('The original was stored, but the portal could not be updated. Try: retry the failed file or refresh the files.', 503)
  }

  let galleryResult = existingResult.data
    ? await admin.from('gallery_files').update(galleryPayload).eq('id', existingResult.data.id)
        .select('id,file_name,storage_key').single()
    : await admin.from('gallery_files').insert(galleryPayload).select('id,file_name,storage_key').single()

  // Two completion requests can race after an interrupted browser retry. The
  // database constraint picks the winner; the loser updates the same record.
  if (galleryResult.error?.code === '23505') {
    const raced = await admin.from('gallery_files').select('id')
      .eq('workspace_id', context.workspaceId).eq('storage_key', grant.storageKey).single()
    if (!raced.error && raced.data) {
      galleryResult = await admin.from('gallery_files').update(galleryPayload).eq('id', raced.data.id)
        .select('id,file_name,storage_key').single()
    }
  }

  if (galleryResult.error || !galleryResult.data) {
    const duplicateName = galleryResult.error && /already exists in this client folder|duplicate client filename/i.test(galleryResult.error.message || '')
    if (duplicateName) {
      await deleteObjects([grant.storageKey, previewReference, thumbnailReference].filter((key): key is string => Boolean(key)))
      throw new RawUploadError(`A file named ${grant.fileName} already exists in this client folder. Rename the new file before uploading.`, 409)
    }
    console.error('RAW gallery registration failed', {
      code: galleryResult.error?.code,
      hint: galleryResult.error?.hint,
      details: galleryResult.error?.details,
    })
    throw new RawUploadError('The original was stored, but the portal could not be updated. Try: retry the failed file or refresh the files.', 503)
  }
  const gallery = galleryResult.data
  try {
    await activateClientPortalAfterOnsiteUpload(admin, context.workspaceId, context.bookingId)
  } catch (error) {
    console.error('Client portal activation after RAW upload failed:', error)
    throw new RawUploadError('The original was stored, but the client portal could not be activated. Try: retry the failed file or refresh the files.', 503)
  }
  return { success: true, file: gallery }
}
