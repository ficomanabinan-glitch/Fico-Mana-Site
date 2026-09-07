import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { copyEnhancedPrint, findOrCreateFolder, getDriveFile, hashDriveFileSha256, upsertDriveFile } from '@/lib/google-drive'
import { buildPrintManifest, matchEnhancedPrintSource, printOutputName } from '@/lib/print-manifest'
import type { EnhancedPrintSource, PrintManifest } from '@/lib/print-manifest'
import { validateEditedPhotoMetadata } from '@/lib/security/file-validation'

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

export async function savePrintManifest(selectedFolderId: string, manifest: PrintManifest) {
  const data = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  return upsertDriveFile({
    destinationFolderId: selectedFolderId,
    bookingId: manifest.booking_id,
    relativePath: 'SELECTED/manifest.json',
    fileName: 'manifest.json',
    mimeType: 'application/json',
    checksum: createHash('sha256').update(data).digest('hex'),
    purpose: 'print-manifest',
    data,
  })
}

/** Run after every file has completed verification, but before a client is marked delivered. */
export async function fulfillBookingPrints(input: {
  admin: SupabaseClient
  workspaceId: string
  bookingId: string
  editingJobId: string
  uploadItemId: string
  selectedFolderId: string
  editedFolderId: string
}) {
  const { admin, workspaceId, bookingId } = input
  const { manifest, selectionStatus } = await loadBookingPrintManifest(admin, workspaceId, bookingId)
  if (selectionStatus !== 'SUBMITTED') {
    throw new Error('The client selection is not locked yet. Try: have the client submit their selections before finishing the enhanced upload.')
  }
  if (!manifest.outputs.length) return manifest // Compatibility with older bookings without print choices.
  const [{ data: deliveries, error: deliveryError }, { data: uploads, error: uploadError }] = await Promise.all([
    admin.from('deliverable_files').select('drive_file_id,file_name,checksum,relative_path')
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('editing_job_id', input.editingJobId),
    admin.from('batch_upload_files').select('drive_file_id,checksum,relative_path')
      .eq('upload_item_id', input.uploadItemId).in('status', ['UPLOADED', 'SKIPPED_DUPLICATE']),
  ])
  if (deliveryError || uploadError) throw new Error('The enhanced uploads could not be checked. Try: retry this client upload.')
  // Ignore old or failed versions and every file that was not part of this verified upload run.
  const sources: EnhancedPrintSource[] = (deliveries || []).filter(file => (uploads || []).some(upload =>
    upload.drive_file_id === file.drive_file_id && upload.checksum === file.checksum && upload.relative_path === file.relative_path,
  ))
  const plan = manifest.outputs.map(output => ({ output, source: matchEnhancedPrintSource(output, sources) }))
  const verifiedSources = new Map<string, Awaited<ReturnType<typeof getDriveFile>>>()
  // Check every source before creating any print: missing/ambiguous names cannot produce partial wrong sets.
  for (const { source } of plan) {
    if (verifiedSources.has(source.drive_file_id)) continue
    const file = await getDriveFile(source.drive_file_id)
    validateEditedPhotoMetadata(file.name, file.mimeType)
    if (!file.parents?.includes(input.editedFolderId) || file.appProperties?.bookingId !== bookingId ||
      file.appProperties?.checksum !== source.checksum || file.name !== source.file_name ||
      !file.md5Checksum) {
      throw new Error('An enhanced photo no longer matches the verified upload. Try: upload that enhanced photo again before making prints.')
    }
    const verified = await hashDriveFileSha256(file.id, 500 * 1024 * 1024)
    if (verified.checksum !== source.checksum || verified.bytes !== Number(file.size)) {
      throw new Error('An enhanced photo changed after upload. Try: upload that enhanced photo again before making prints.')
    }
    verifiedSources.set(file.id, file)
  }
  const prints = await findOrCreateFolder(input.selectedFolderId, 'PRINTS')
  // Publish pending instructions before attempting copies, so a interrupted run cannot appear ready.
  await savePrintManifest(input.selectedFolderId, manifest)
  for (const { output, source } of plan) {
    const copy = await copyEnhancedPrint({
      source: verifiedSources.get(source.drive_file_id)!, destinationFolderId: prints.id,
      bookingId, selectionId: manifest.selection_id, printKey: output.key,
      checksum: source.checksum, fileName: printOutputName(output, source.file_name),
    })
    Object.assign(output, {
      status: 'ready', enhanced_file_id: source.drive_file_id, enhanced_checksum: source.checksum,
      output_file_name: copy.name, print_file_id: copy.id,
    })
  }
  await savePrintManifest(input.selectedFolderId, manifest)
  // Existing column remains a representative copy; the manifest records every individual wallet copy.
  for (const output of manifest.outputs.filter(row => row.copy_number === 1)) {
    const { error } = await admin.from('print_allocations').update({ drive_file_id: output.print_file_id })
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId)
      .eq('selection_id', manifest.selection_id).eq('category', output.category)
    if (error) throw new Error('The print report could not be saved. Try: retry this client upload; existing verified copies will be reused.')
  }
  return manifest
}
