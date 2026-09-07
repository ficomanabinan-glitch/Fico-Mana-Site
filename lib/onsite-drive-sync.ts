import type { SupabaseClient } from '@supabase/supabase-js'
import { getDriveFile, listDriveFiles, GoogleDriveRequestError } from '@/lib/google-drive'
import { assertGraduationBooking } from '@/lib/package-workflow-server'
import { RawUploadError } from '@/lib/raw-upload-contract'

type FolderContext = { rawFolderId: string; clientId: string; batchId: string }
const folderMime = 'application/vnd.google-apps.folder'
const fail = (message: string) => new RawUploadError(`${message} Try: ask the administrator to check this client’s Drive connection and folder settings, then click Sync Drive again.`, 409)

/** Healthy syncs never reconcile folders. Recovery is limited to a verified missing/stale mapping. */
export async function readOnsiteDrivePhotos(admin: SupabaseClient, workspaceId: string, bookingId: string, recover: () => Promise<FolderContext>) {
  await assertGraduationBooking(admin, bookingId, workspaceId)
  const [booking, job, mappings, provisioning, settings] = await Promise.all([
    admin.from('bookings').select('client_id').eq('workspace_id', workspaceId).eq('id', bookingId).single(),
    admin.from('editing_jobs').select('batch_id').eq('workspace_id', workspaceId).eq('booking_id', bookingId).single(),
    admin.from('drive_folders').select('folder_type,drive_folder_id').eq('workspace_id', workspaceId).eq('booking_id', bookingId).in('folder_type', ['CLIENT', 'RAW']),
    admin.from('booking_provisioning').select('drive_root_folder_id,drive_client_folder_id,drive_day_folder_id').eq('workspace_id', workspaceId).eq('booking_id', bookingId).maybeSingle(),
    admin.from('google_drive_settings').select('root_folder_id').eq('workspace_id', workspaceId).eq('id', 1).single(),
  ])
  if ([booking, job, mappings, provisioning, settings].some(result => result.error) || !booking.data || !job.data || !settings.data?.root_folder_id) throw fail('Sync settings could not be checked.')
  const raw = mappings.data?.filter(row => row.folder_type === 'RAW') || []
  const clients = mappings.data?.filter(row => row.folder_type === 'CLIENT') || []
  if (raw.length > 1 || clients.length > 1) throw fail('More than one folder is linked to this client.')
  let needsRecovery = !raw.length || !clients.length || !booking.data.client_id ||
    provisioning.data?.drive_root_folder_id !== settings.data.root_folder_id ||
    provisioning.data?.drive_client_folder_id !== clients[0]?.drive_folder_id
  let folder: FolderContext = { rawFolderId: String(raw[0]?.drive_folder_id || ''), clientId: String(booking.data.client_id || ''), batchId: String(job.data.batch_id) }
  if (!needsRecovery) {
    try {
      const [rawFolder, clientFolder] = await Promise.all([getDriveFile(folder.rawFolderId), getDriveFile(String(clients[0].drive_folder_id))])
      if ([rawFolder, clientFolder].some(file => file.mimeType !== folderMime || file.appProperties?.bookingId && file.appProperties.bookingId !== bookingId)) throw fail('The saved folder is not a verified folder for this client.')
      needsRecovery = Boolean(rawFolder.trashed || clientFolder.trashed || rawFolder.parents?.length !== 1 || rawFolder.parents[0] !== clientFolder.id ||
        clientFolder.parents?.length !== 1 || clientFolder.parents[0] !== provisioning.data?.drive_day_folder_id)
    } catch (error) {
      if (error instanceof GoogleDriveRequestError && error.status === 404) needsRecovery = true
      else throw fail('Drive could not verify the existing folders. No repair was attempted.')
    }
  }
  let recovered = false
  const recoverOnce = async () => {
    if (recovered) throw fail('The folder changed again during sync.')
    folder = await recover()
    recovered = true
  }
  if (needsRecovery) await recoverOnce()
  try {
    return { ...folder, files: await listDriveFiles(folder.rawFolderId), recovered }
  } catch (error) {
    if (!(error instanceof GoogleDriveRequestError) || error.status !== 404 || recovered) throw fail('Drive could not list the photos. No files or indexed records were removed.')
    await recoverOnce()
    try { return { ...folder, files: await listDriveFiles(folder.rawFolderId), recovered } }
    catch { throw fail('Drive could not list the repaired folder. No indexed records were removed.') }
  }
}
