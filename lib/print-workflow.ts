import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildPrintManifest, enhancedPrintSourceName, matchEnhancedPrintSource, printOutputName } from '@/lib/print-manifest'
import type { EnhancedPrintSource } from '@/lib/print-manifest'
import { validateEditedPhotoMetadata } from '@/lib/security/file-validation'
import { copyObject, getObjectMetadata, hashObjectSha256 } from '@/lib/storage/storage-service'
import { createStorageKey, parseStorageKey } from '@/lib/storage/storage-keys'

export async function loadBookingPrintManifest(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  const { data: selection, error } = await admin.from('photo_selections').select('id,status')
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId).maybeSingle()
  if (error) throw new Error('The print choices could not be loaded. Try: retry this client upload.')
  if (!selection) throw new Error('The client selection is missing. Try: ask the administrator to review this booking.')
  const { data: allocations, error: allocationError } = await admin.from('print_allocations').select('category,gallery_file_id,quantity')
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('selection_id', selection.id).order('category')
  if (allocationError) throw new Error('The print choices could not be loaded. Try: retry this client upload.')
  const ids = [...new Set((allocations || []).map(row => String(row.gallery_file_id)))]
  const { data: gallery, error: galleryError } = ids.length
    ? await admin.from('gallery_files').select('id,file_name').eq('workspace_id', workspaceId).eq('booking_id', bookingId).in('id', ids)
    : { data: [], error: null }
  if (galleryError) throw new Error('The print choices could not be loaded. Try: retry this client upload.')
  return { selectionStatus: String(selection.status), manifest: buildPrintManifest({
    bookingId, selectionId: String(selection.id), allocations: allocations || [], gallery: gallery || [],
  }) }
}

/** Run after every file has completed verification, but before a client is marked delivered. */
export async function fulfillBookingPrints(input: {
  admin: SupabaseClient
  workspaceId: string
  bookingId: string
  editingJobId: string
  uploadItemId: string
}) {
  const { admin, workspaceId, bookingId } = input
  const { manifest, selectionStatus } = await loadBookingPrintManifest(admin, workspaceId, bookingId)
  if (selectionStatus !== 'SUBMITTED') {
    throw new Error('The client selection is not locked yet. Try: have the client submit their selections before finishing the enhanced upload.')
  }
  if (!manifest.outputs.length) return manifest

  const [{ data: deliveries, error: deliveryError }, { data: uploads, error: uploadError }] = await Promise.all([
    admin.from('deliverable_files').select('storage_key,file_name,mime_type,file_size,checksum,relative_path')
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('editing_job_id', input.editingJobId)
      .eq('storage_status', 'available'),
    admin.from('batch_upload_files').select('storage_key,checksum,relative_path')
      .eq('upload_item_id', input.uploadItemId).in('status', ['UPLOADED', 'SKIPPED_DUPLICATE']),
  ])
  if (deliveryError || uploadError) throw new Error('The enhanced uploads could not be checked. Try: retry this client upload.')

  const sources: EnhancedPrintSource[] = (deliveries || []).filter(file => (uploads || []).some(upload =>
    upload.storage_key === file.storage_key && upload.checksum === file.checksum && upload.relative_path === file.relative_path,
  ))
  const plan = manifest.outputs.map(output => ({ output, source: matchEnhancedPrintSource(output, sources) }))
  const verifiedSources = new Map<string, Awaited<ReturnType<typeof getObjectMetadata>>>()

  for (const { source } of plan) {
    if (verifiedSources.has(source.storage_key)) continue
    const object = await getObjectMetadata(source.storage_key)
    const delivery = (deliveries || []).find((file) => file.storage_key === source.storage_key)
    if (!delivery) throw new Error('An enhanced photo is no longer available. Try: upload it again before making prints.')
    validateEditedPhotoMetadata(String(delivery.file_name), String(delivery.mime_type))
    const parsed = parseStorageKey(source.storage_key)
    if (parsed.workspaceId !== workspaceId || parsed.bookingId !== bookingId || parsed.category !== 'enhanced' ||
      object.contentLength !== Number(delivery.file_size) || String(delivery.checksum) !== source.checksum) {
      throw new Error('An enhanced photo no longer matches the verified upload. Try: upload it again before making prints.')
    }
    const actual = object.checksum || (await hashObjectSha256(source.storage_key, 500 * 1024 * 1024)).sha256
    if (actual !== source.checksum) {
      throw new Error('An enhanced photo changed after upload. Try: upload it again before making prints.')
    }
    verifiedSources.set(source.storage_key, object)
  }

  for (const { output, source } of plan) {
    const parsed = parseStorageKey(source.storage_key)
    const sourceDelivery = (deliveries || []).find((file) => file.storage_key === source.storage_key)!
    const outputName = printOutputName(output, enhancedPrintSourceName(source))
    const objectId = createHash('sha256').update(`${manifest.selection_id}:${output.key}`).digest('hex').slice(0, 40)
    const printKey = createStorageKey({
      workspaceId,
      bookingId,
      shootDate: parsed.shootDate,
      category: 'print',
      objectId,
      fileName: outputName,
    })
    await copyObject({
      sourceKey: source.storage_key,
      destinationKey: printKey,
      contentType: String(sourceDelivery.mime_type || 'application/octet-stream'),
      metadata: {
        bookingid: bookingId,
        selectionid: manifest.selection_id,
        printkey: output.key,
        sha256: source.checksum,
        filename: outputName,
      },
    })
    Object.assign(output, {
      status: 'ready',
      enhanced_storage_key: source.storage_key,
      enhanced_checksum: source.checksum,
      output_file_name: outputName,
      print_storage_key: printKey,
    })
  }

  for (const output of manifest.outputs.filter(row => row.copy_number === 1)) {
    const { error } = await admin.from('print_allocations').update({
      storage_provider: 'r2',
      print_storage_key: output.print_storage_key,
      enhanced_storage_key: output.enhanced_storage_key,
      storage_status: 'available',
    })
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId)
      .eq('selection_id', manifest.selection_id).eq('category', output.category)
    if (error) throw new Error('The print report could not be saved. Try: retry this client upload; existing verified copies will be reused.')
  }
  return manifest
}
