/** Validate the metadata consumed by staff views before caching it as authoritative. */
type Row = Record<string, unknown>
function row(value: unknown): value is Row { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function strings(value: Row, keys: string[]) { return keys.every(key => typeof value[key] === 'string') }
function numbers(value: Row, keys: string[]) { return keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) >= 0) }
function rows(value: unknown, check: (value: Row) => boolean) { return Array.isArray(value) && value.every(item => row(item) && check(item)) }
function counts(value: unknown) {
  return row(value) && numbers(value, ['waitingForSelection', 'readyForEditing', 'downloaded', 'editing', 'readyToUpload', 'uploading', 'delivered', 'failed'])
}
function onsiteJob(value: Row) { return strings(value, ['bookingId', 'customerName', 'packageName', 'bookingTime']) && numbers(value, ['galleryCount']) }
function batchSummary(value: Row) {
  return strings(value, ['id', 'shootDate']) && numbers(value, ['totalClients', 'totalSelectedPhotos']) && counts(value.counts)
    && rows(value.clients, client => strings(client, ['bookingId', 'clientId', 'clientName', 'packageName']))
}
function uploadReport(value: Row) {
  return strings(value, ['id', 'batchId', 'shootDate', 'status', 'createdAt'])
    && numbers(value, ['totalClients', 'completedClients', 'failedClients', 'photosUploaded'])
    && (value.completedAt === null || typeof value.completedAt === 'string')
    && rows(value.clients, client => strings(client, ['bookingId', 'customerName', 'packageName', 'status'])
      && numbers(client, ['expectedFiles', 'uploadedFiles']))
}
function editingJob(value: Row) {
  return onsiteJob(value) && strings(value, ['id', 'status', 'selectionStatus', 'selectionClientStatus'])
    && numbers(value, ['selectedCount', 'expectedOutputCount', 'selectionRequiredCount', 'totalAddonAmount', 'deliverableCount'])
    && rows(value.enhancementPreferences, preference => strings(preference, ['fileId', 'fileName', 'preference']))
    && rows(value.printAllocations, print => strings(print, ['category', 'label', 'fileId', 'fileName']) && numbers(print, ['quantity']))
    && rows(value.addonOrders, addon => strings(addon, ['name']) && numbers(addon, ['quantity', 'total']))
}

export function assertEditorReadMetadata(value: unknown, kind: 'onsite' | 'batches' | 'uploads' | 'batch'): void {
  const valid = kind === 'batches' ? rows(value, batchSummary)
    : kind === 'uploads' ? rows(value, uploadReport)
      : kind === 'onsite' ? row(value) && typeof value.shootDate === 'string'
        && (value.batch === null || row(value.batch) && typeof value.batch.id === 'string' && rows(value.batch.jobs, onsiteJob))
        : row(value) && strings(value, ['id', 'shootDate']) && numbers(value, ['totalClients', 'totalSelectedPhotos'])
          && counts(value.counts) && rows(value.jobs, editingJob)
          && rows(value.auditLogs, log => strings(log, ['id', 'action', 'timestamp']))
          // getBatchDetail legitimately omits needsReview on its empty-jobs fast path.
          && (value.needsReview === undefined || rows(value.needsReview, item => strings(item, ['id', 'status', 'sourceFolderName', 'reason', 'createdAt'])))
  if (!valid) throw new Error('This information could not be loaded because the server returned incomplete data. Try again.')
}
