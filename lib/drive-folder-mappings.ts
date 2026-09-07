import type { SupabaseClient } from '@supabase/supabase-js'
import type { ensureShootHierarchy } from '@/lib/google-drive'

type Hierarchy = Awaited<ReturnType<typeof ensureShootHierarchy>>
/** Publish verified folders first, then retire only obsolete index links. Drive contents are untouched. */
export async function saveShootFolderMappings(admin: SupabaseClient, workspaceId: string, bookingId: string, hierarchy: Hierarchy, batchId?: string) {
  if (!workspaceId || !bookingId) throw new Error('The booking workspace is missing. Try: refresh and retry provisioning.')
  const { data: current, error: readError } = await admin.from('drive_folders')
    .select('id,drive_folder_id,folder_type,batch_id,parent_drive_folder_id').eq('workspace_id', workspaceId).eq('booking_id', bookingId)
  if (readError) throw new Error('The saved folder links could not be loaded. Try: retry provisioning.')
  let resolvedBatchId = batchId || current?.find(row => row.batch_id)?.batch_id || null
  if (!resolvedBatchId) {
    // A newly provisioned client may share an already-indexed day with other clients.
    // Do not clear that shared day's batch link when this booking has no mappings yet.
    const { data: dayMapping, error: dayError } = await admin.from('drive_folders')
      .select('batch_id').eq('workspace_id', workspaceId).eq('drive_folder_id', hierarchy.day.id).maybeSingle()
    if (dayError) throw new Error('The day folder link could not be loaded. Try: retry provisioning.')
    resolvedBatchId = dayMapping?.batch_id || null
  }
  const { data: settings, error: settingsError } = await admin.from('google_drive_settings')
    .select('root_folder_id').eq('workspace_id', workspaceId).eq('id', 1).single()
  if (settingsError || settings?.root_folder_id !== hierarchy.root.id) {
    throw new Error('The storage root changed while folders were being prepared. Try: click Retry to use the latest root.')
  }
  const timestamp = new Date().toISOString()
  const records = [
    { folder_type: 'ROOT', folder: hierarchy.root, booking_id: null, batch_id: null },
    { folder_type: 'MONTH', folder: hierarchy.month, booking_id: null, batch_id: null },
    { folder_type: 'DAY', folder: hierarchy.day, booking_id: null, batch_id: resolvedBatchId },
    { folder_type: 'CLIENT', folder: hierarchy.client, booking_id: bookingId, batch_id: resolvedBatchId },
    { folder_type: 'RAW', folder: hierarchy.raw, booking_id: bookingId, batch_id: resolvedBatchId },
    { folder_type: 'SELECTED', folder: hierarchy.selected, booking_id: bookingId, batch_id: resolvedBatchId },
    { folder_type: 'EDITED', folder: hierarchy.edited, booking_id: bookingId, batch_id: resolvedBatchId },
  ]
  const { error } = await admin.from('drive_folders').upsert(records.map(record => ({
    workspace_id: workspaceId, booking_id: record.booking_id, batch_id: record.batch_id, folder_type: record.folder_type,
    drive_folder_id: record.folder.id, name: record.folder.name, parent_drive_folder_id: record.folder.parents?.[0] || null,
    web_view_url: record.folder.webViewLink || `https://drive.google.com/drive/folders/${record.folder.id}`, updated_at: timestamp,
  })), { onConflict: 'workspace_id,drive_folder_id' })
  if (error) throw new Error('The new folder links could not be saved. Try: retry provisioning; the folders will be reused.')
  const ids = new Set(records.map(record => record.folder.id))
  const obsolete = (current || []).filter(row => !ids.has(String(row.drive_folder_id)) &&
    // Preserve same-client legacy folders for recovery/cleanup without recreating them.
    !(row.folder_type === 'DELIVERABLES' && row.parent_drive_folder_id === hierarchy.client.id))
  // Retain old index records for recovery but remove stale destinations from current-client reads.
  for (const row of obsolete) {
    const { error: retireError } = await admin.from('drive_folders')
      .update({ booking_id: null, batch_id: null, updated_at: timestamp })
      .eq('workspace_id', workspaceId).eq('booking_id', bookingId).eq('id', row.id).eq('drive_folder_id', row.drive_folder_id)
    if (retireError) throw new Error('Some old folder links could not be refreshed. Try: retry provisioning before uploading photos.')
  }
  if (resolvedBatchId) {
    const { error: batchError } = await admin.from('editing_batches').update({
      drive_day_folder_id: hierarchy.day.id,
      drive_day_folder_url: hierarchy.day.webViewLink || `https://drive.google.com/drive/folders/${hierarchy.day.id}`, updated_at: timestamp,
    }).eq('workspace_id', workspaceId).eq('id', resolvedBatchId)
    if (batchError) throw new Error('The batch folder link could not be saved. Try: retry provisioning.')
  }
}
