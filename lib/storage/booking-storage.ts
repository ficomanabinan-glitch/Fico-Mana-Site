import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bookingStoragePrefix } from '@/lib/storage/storage-keys'

export type BookingStorageNamespace = {
  prefix: string
  rawPrefix: string
  previewPrefix: string
  thumbnailPrefix: string
  enhancedPrefix: string
  deliverablesPrefix: string
  printsPrefix: string
  temporaryPrefix: string
}

export function storageNamespace(prefix: string): BookingStorageNamespace {
  return {
    prefix,
    rawPrefix: `${prefix}/raw/`,
    previewPrefix: `${prefix}/preview/`,
    thumbnailPrefix: `${prefix}/thumbnail/`,
    enhancedPrefix: `${prefix}/enhanced/`,
    deliverablesPrefix: `${prefix}/deliverable/`,
    printsPrefix: `${prefix}/print/`,
    temporaryPrefix: `${prefix}/temporary/`,
  }
}

export async function prepareBookingStorage(
  admin: SupabaseClient,
  workspaceId: string,
  bookingId: string,
) {
  let { data: booking, error } = await admin
    .from('bookings')
    .select('id,workspace_id,client_id,customer_name,booking_date,selection_limit')
    .eq('workspace_id', workspaceId)
    .eq('id', bookingId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!booking) throw new Error('Booking not found in this workspace.')

  let { data: batch, error: batchError } = await admin
    .from('editing_batches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('display_id', `FM-BATCH-${booking.booking_date}-MAIN`)
    .maybeSingle()
  if (batchError) throw new Error(batchError.message)

  if (!booking.client_id || !batch) {
    throw new Error('The booking workflow must be synchronized before storage can be prepared.')
  }

  const prefix = bookingStoragePrefix({
    workspaceId,
    bookingId,
    shootDate: String(booking.booking_date),
  })
  const namespace = storageNamespace(prefix)
  const timestamp = new Date().toISOString()

  // Preparing an R2 namespace is an internal staff operation. It must not make
  // a client portal visible before at least one onsite photo is verified and
  // indexed. A portal created by a completed upload is only linked here.
  const { data: portal, error: portalError } = await admin
    .from('client_portals')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (portalError) throw new Error(portalError.message)
  const { error: provisioningError } = await admin.from('booking_provisioning').upsert({
    booking_id: bookingId,
    workspace_id: workspaceId,
    status: portal ? 'ACTIVE' : 'PROVISIONING',
    storage_provider: 'r2',
    storage_prefix: prefix,
    storage_status: 'ready',
    client_portal_id: portal?.id || null,
    provisioned_at: timestamp,
    last_error: null,
    updated_at: timestamp,
  })
  if (provisioningError) throw new Error(provisioningError.message)

  if (batch.storage_prefix !== prefix.split('/').slice(0, 6).join('/')) {
    const batchPrefix = prefix.split('/').slice(0, 6).join('/')
    const { error: batchUpdateError } = await admin
      .from('editing_batches')
      .update({ storage_prefix: batchPrefix, updated_at: timestamp })
      .eq('id', batch.id)
      .eq('workspace_id', workspaceId)
    if (batchUpdateError) throw new Error(batchUpdateError.message)
    batch = { ...batch, storage_prefix: batchPrefix }
  }

  return { namespace, batch, portal, booking }
}
