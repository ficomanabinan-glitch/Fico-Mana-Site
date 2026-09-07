import type { SupabaseClient } from '@supabase/supabase-js'
import { RawUploadError } from '@/lib/raw-upload-contract'

export async function rawUploadGeneration(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  const { data, error } = await admin.from('photo_selections').select('raw_upload_generation,raw_reset_id')
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId).single()
  if (error || !data) throw new RawUploadError('Upload settings could not be loaded. Try: ask the administrator to finish the photo-reset setup, then refresh.', 503)
  if (data.raw_reset_id) throw new RawUploadError('This client’s photos are being cleared. Try: finish or retry Delete Uploaded Photos before uploading again.', 409)
  const generation = Number(data.raw_upload_generation)
  if (!Number.isSafeInteger(generation) || generation < 0) throw new RawUploadError('Upload settings are incomplete. Try: ask the administrator to finish the photo-reset setup.', 503)
  return generation
}
