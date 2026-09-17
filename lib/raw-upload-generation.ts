import type { SupabaseClient } from '@supabase/supabase-js'
import { RawUploadError } from '@/lib/raw-upload-contract'

const settingsUnavailable = () => new RawUploadError(
  'Upload settings could not be loaded. Try: ask the administrator to finish the photo-reset setup, then refresh.',
  503,
)

async function selectionState(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  return admin.from('photo_selections').select('raw_upload_generation,raw_reset_id')
    .eq('workspace_id', workspaceId).eq('booking_id', bookingId).maybeSingle()
}

export async function rawUploadGeneration(admin: SupabaseClient, workspaceId: string, bookingId: string) {
  let { data, error } = await selectionState(admin, workspaceId, bookingId)
  if (error) throw settingsUnavailable()

  // The portal is intentionally created only after the first verified upload,
  // but upload-generation guards need their selection row before that upload.
  // Create only this internal control row and tolerate another session winning
  // the same booking-level race.
  if (!data) {
    const booking = await admin.from('bookings').select('selection_limit')
      .eq('workspace_id', workspaceId).eq('id', bookingId).maybeSingle()
    if (booking.error || !booking.data) throw settingsUnavailable()
    const requiredCount = Math.max(0, Number(booking.data.selection_limit || 5))
    const created = await admin.from('photo_selections').insert({
      workspace_id: workspaceId,
      booking_id: bookingId,
      status: 'OPEN',
      client_status: 'Not Started',
      required_count: requiredCount,
      included_limit: Math.min(5, requiredCount),
    })
    if (created.error && created.error.code !== '23505') throw settingsUnavailable()
    const reread = await selectionState(admin, workspaceId, bookingId)
    data = reread.data
    error = reread.error
  }

  if (error || !data) throw settingsUnavailable()
  if (data.raw_reset_id) throw new RawUploadError('This client’s photos are being cleared. Try: finish or retry Delete Uploaded Photos before uploading again.', 409)
  const generation = Number(data.raw_upload_generation)
  if (!Number.isSafeInteger(generation) || generation < 0) throw new RawUploadError('Upload settings are incomplete. Try: ask the administrator to finish the photo-reset setup.', 503)
  return generation
}
