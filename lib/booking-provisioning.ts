import type { SupabaseClient } from '@supabase/supabase-js'
import type { Booking, PaymentRecord } from '@/lib/data-store'
import { mapDbBookingToModel } from '@/lib/booking-db'
import { ensureShootHierarchy } from '@/lib/google-drive'
import { portalUrl } from '@/lib/client-portal'
import { hasPortalExpired } from '@/lib/portal-expiry'
import { sendPortalAccessIfNeeded } from '@/lib/portal-email'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertGraduationBooking, packageUsesGraduationWorkflow } from '@/lib/package-workflow-server'
import { saveShootFolderMappings } from '@/lib/drive-folder-mappings'

export type ProvisioningStatus = 'NOT_STARTED' | 'PROVISIONING' | 'ACTIVE' | 'PARTIAL_FAILURE' | 'FAILED'

export type ProvisioningSnapshot = {
  bookingId: string
  required?: boolean
  status: ProvisioningStatus
  driveRootFolderId?: string
  driveMonthFolderId?: string
  driveDayFolderId?: string
  driveClientFolderId?: string
  driveClientFolderUrl?: string
  clientPortalId?: string
  clientPortalPublicId?: string
  clientPortalStatus?: 'active' | 'disabled' | 'expired'
  clientPortalUrl?: string
  provisionedAt?: string
  lastError?: string
  lastRetryAt?: string
  confirmedPayments: number
  requiredDeposit: number
}

type Actor = { type?: 'system' | 'staff' | 'webhook'; id?: string | null }

async function audit(
  admin: SupabaseClient,
  bookingId: string,
  action: string,
  actor: Actor,
  extra?: { externalResourceId?: string; metadata?: Record<string, unknown>; error?: string },
) {
  await admin.from('provisioning_audit').insert({
    booking_id: bookingId,
    action,
    actor_type: actor.type || 'system',
    actor_id: actor.id || null,
    external_resource_id: extra?.externalResourceId || null,
    metadata: extra?.metadata || {},
    error: extra?.error || null,
  })
}

export async function totalConfirmedPayments(admin: SupabaseClient, booking: Booking) {
  const { data, error } = await admin
    .from('payments')
    .select('amount,status')
    .eq('booking_id', booking.id)
    .eq('status', 'confirmed')
  if (!error && data && data.length > 0) {
    return data.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  }

  if (booking.paymentStatus === 'Paid Deposit' || booking.paymentStatus === 'Paid Full') {
    return (booking.paymentHistory || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  }
  return 0
}

export async function recordConfirmedPayment(
  admin: SupabaseClient,
  booking: Booking,
  payment: PaymentRecord,
  actor: Actor = {},
  providerEventId?: string,
) {
  const row = {
    id: payment.id,
    booking_id: booking.id,
    amount: Number(payment.amount || 0),
    method: payment.method,
    payment_type: payment.type,
    transaction_ref: payment.transactionRef?.trim() || null,
    created_at: payment.date || new Date().toISOString(),
    status: 'confirmed',
    verified_at: new Date().toISOString(),
    provider_event_id: providerEventId || null,
  }
  const { error } = await admin.from('payments').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`Could not record confirmed payment: ${error.message}`)
  await audit(admin, booking.id, 'payment_confirmed', actor, {
    externalResourceId: providerEventId,
    metadata: { paymentId: payment.id, amount: row.amount, method: payment.method },
  })
}

async function loadBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (error || !data) throw new Error('Booking not found.')
  return mapDbBookingToModel(data)
}

async function ensurePortal(admin: SupabaseClient, bookingId: string, actor: Actor) {
  await assertGraduationBooking(admin, bookingId)
  const { data: existing } = await admin
    .from('client_portals')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (existing) return existing

  const { data: booking } = await admin.from('bookings').select('workspace_id').eq('id', bookingId).single()
  const { data, error } = await admin
    .from('client_portals')
    .insert({ booking_id: bookingId, workspace_id: booking?.workspace_id, status: 'active' })
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'Client Portal creation failed.')
  await audit(admin, bookingId, 'portal_created', actor, { externalResourceId: String(data.id) })
  return data
}

async function getProvisioningRow(admin: SupabaseClient, bookingId: string) {
  const { data } = await admin.from('booking_provisioning').select('*').eq('booking_id', bookingId).maybeSingle()
  if (data) return data
  const { data: booking } = await admin.from('bookings').select('workspace_id').eq('id', bookingId).single()
  const { data: created, error } = await admin
    .from('booking_provisioning')
    .insert({ booking_id: bookingId, workspace_id: booking?.workspace_id, status: 'NOT_STARTED' })
    .select('*')
    .single()
  if (error || !created) throw new Error(error?.message || 'Could not initialize provisioning state.')
  return created
}

async function updateProvisioning(admin: SupabaseClient, bookingId: string, patch: Record<string, unknown>) {
  const { data, error } = await admin
    .from('booking_provisioning')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message || 'Could not update provisioning state.')
  return data
}

export async function getProvisioningSnapshot(bookingId: string): Promise<ProvisioningSnapshot | null> {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const booking = await loadBooking(admin, bookingId)
  const confirmedPayments = await totalConfirmedPayments(admin, booking)
  if (!await packageUsesGraduationWorkflow(admin, booking.packageId)) return {
    bookingId, required: false, status: 'NOT_STARTED', confirmedPayments,
    requiredDeposit: Number(booking.depositAmount || 0),
  }
  const row = await getProvisioningRow(admin, bookingId)
  const { data: portal } = await admin
    .from('client_portals')
    .select('id,public_id,status,expires_at')
    .eq('booking_id', bookingId)
    .maybeSingle()
  const portalExpired = hasPortalExpired(portal?.expires_at)
  const portalActive = portal?.status === 'active' && !portalExpired

  return {
    bookingId,
    status: row.status as ProvisioningStatus,
    driveRootFolderId: row.drive_root_folder_id || undefined,
    driveMonthFolderId: row.drive_month_folder_id || undefined,
    driveDayFolderId: row.drive_day_folder_id || undefined,
    driveClientFolderId: row.drive_client_folder_id || undefined,
    driveClientFolderUrl: row.drive_client_folder_url || undefined,
    clientPortalId: portal?.id ? String(portal.id) : undefined,
    clientPortalPublicId: portal?.public_id ? String(portal.public_id) : undefined,
    clientPortalStatus: portalExpired ? 'expired' : portal?.status || undefined,
    clientPortalUrl: portal?.public_id && portalActive ? portalUrl(String(portal.public_id)) : undefined,
    provisionedAt: row.provisioned_at || undefined,
    lastError: row.last_error || undefined,
    lastRetryAt: row.last_retry_at || undefined,
    confirmedPayments,
    requiredDeposit: Number(booking.depositAmount || 0),
  }
}

export async function provisionBookingResources(bookingId: string, actor: Actor = {}) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable. Try: refresh the page, or contact your administrator.')

  const booking = await loadBooking(admin, bookingId)
  const requiresPhotoWorkflow = await packageUsesGraduationWorkflow(admin, booking.packageId)
  const row = requiresPhotoWorkflow ? await getProvisioningRow(admin, bookingId) : null
  const confirmedPayments = await totalConfirmedPayments(admin, booking)
  const requiredDeposit = Math.max(0, Number(booking.depositAmount || 0))

  if (requiredDeposit > 0 && confirmedPayments < requiredDeposit) {
    if (!requiresPhotoWorkflow) return null
    await updateProvisioning(admin, bookingId, { status: 'NOT_STARTED', last_error: null })
    await audit(admin, bookingId, 'deposit_threshold_not_reached', actor, {
      metadata: { confirmedPayments, requiredDeposit },
    })
    return getProvisioningSnapshot(bookingId)
  }

  if (booking.bookingStatus === 'Cancelled' || booking.bookingStatus === 'Rejected') {
    await disableClientPortal(bookingId, actor)
    return getProvisioningSnapshot(bookingId)
  }

  const now = new Date().toISOString()
  if (booking.bookingStatus !== 'Confirmed' && booking.bookingStatus !== 'Completed') {
    const paymentStatus = confirmedPayments >= Number(booking.price || 0) && Number(booking.price || 0) > 0
      ? 'Paid Full'
      : confirmedPayments > 0
        ? 'Paid Deposit'
        : booking.paymentStatus
    await admin
      .from('bookings')
      .update({ booking_status: 'Confirmed', payment_status: paymentStatus, confirmed_at: now })
      .eq('id', bookingId)
    await audit(admin, bookingId, 'booking_confirmed', actor, {
      metadata: { confirmedPayments, requiredDeposit },
    })
  } else {
    await admin.from('bookings').update({ confirmed_at: now }).eq('id', bookingId).is('confirmed_at', null)
  }

  // Payment and booking confirmation still apply to onsite packages. Only remote
  // photo production is skipped, before any provisioning/portal/folder creation.
  if (!requiresPhotoWorkflow || !row) return null

  await updateProvisioning(admin, bookingId, {
    status: 'PROVISIONING',
    last_error: null,
    last_retry_at: row.status === 'NOT_STARTED' ? row.last_retry_at : now,
  })
  await audit(admin, bookingId, row.status === 'NOT_STARTED' ? 'provisioning_started' : 'provisioning_retried', actor)

  let driveResult: Awaited<ReturnType<typeof ensureShootHierarchy>> | null = null
  let portal: Record<string, any> | null = null
  const errors: string[] = []

  try {
    const hierarchy = await ensureShootHierarchy({
      admin,
      bookingId,
      shootDate: booking.bookingDate,
      clientName: booking.customerName,
      selectionLimit: Number(booking.selectionLimit || 5),
      existingClientFolderId: row.drive_client_folder_id,
      existingRootFolderId: row.drive_root_folder_id,
    })
    await saveShootFolderMappings(admin, String(row.workspace_id || ''), bookingId, hierarchy)
    await updateProvisioning(admin, bookingId, {
      drive_root_folder_id: hierarchy.root.id,
      drive_month_folder_id: hierarchy.month.id,
      drive_day_folder_id: hierarchy.day.id,
      drive_client_folder_id: hierarchy.client.id,
      drive_client_folder_url: hierarchy.clientUrl,
    })
    driveResult = hierarchy
    await audit(admin, bookingId, row.drive_client_folder_id ? 'drive_folder_reconciled' : 'drive_client_folder_created', actor, {
      externalResourceId: driveResult.client.id,
      metadata: {
        rootId: driveResult.root.id,
        monthId: driveResult.month.id,
        dayId: driveResult.day.id,
        url: driveResult.clientUrl,
        previousRootId: row.drive_root_folder_id || null,
        previousClientFolderId: row.drive_client_folder_id || null,
        rootChanged: Boolean(row.drive_root_folder_id && row.drive_root_folder_id !== driveResult.root.id),
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Google Drive provisioning failed.'
    const message = /\bTry:/i.test(detail) ? detail : `${detail} Try: verify the current root and connected Drive account in Production storage, then click Retry.`
    errors.push(message)
    await audit(admin, bookingId, 'drive_provisioning_failed', actor, { error: message })
  }

  try {
    const ensuredPortal = await ensurePortal(admin, bookingId, actor)
    portal = ensuredPortal
    await updateProvisioning(admin, bookingId, { client_portal_id: ensuredPortal.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Client Portal provisioning failed.'
    errors.push(message)
    await audit(admin, bookingId, 'portal_provisioning_failed', actor, { error: message })
  }

  const complete = !!driveResult && !!portal
  const partial = (!!driveResult || !!portal) && !complete
  const status: ProvisioningStatus = complete ? 'ACTIVE' : partial ? 'PARTIAL_FAILURE' : 'FAILED'
  await updateProvisioning(admin, bookingId, {
    status,
    provisioned_at: complete ? now : null,
    last_error: errors.length ? errors.join(' · ') : null,
  })
  if (complete) await audit(admin, bookingId, 'provisioning_completed', actor)

  if (portal) {
    try {
      const emailResult = await sendPortalAccessIfNeeded(admin, bookingId, actor)
      if (emailResult && 'error' in emailResult && emailResult.error) {
        await audit(admin, bookingId, 'portal_access_email_failed', actor, { error: emailResult.error })
      }
    } catch (error) {
      await audit(admin, bookingId, 'portal_access_email_failed', actor, {
        error: error instanceof Error ? error.message : 'Portal access email failed.',
      })
    }
  }

  return getProvisioningSnapshot(bookingId)
}

export async function disableClientPortal(bookingId: string, actor: Actor = {}) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable. Try: refresh the page, or contact your administrator.')
  const { data } = await admin
    .from('client_portals')
    .update({ status: 'disabled', updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .select('id')
  if (data?.length) await audit(admin, bookingId, 'portal_disabled', actor)
}

export async function enableClientPortal(bookingId: string, actor: Actor = {}) {
  const admin = getSupabaseAdmin()
  if (!admin) throw new Error('This service is temporarily unavailable. Try: refresh the page, or contact your administrator.')
  await assertGraduationBooking(admin, bookingId)
  const now = new Date()
  const { data: portal, error: portalError } = await admin
    .from('client_portals')
    .select('id,status,expires_at')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (portalError) throw new Error(portalError.message)
  if (!portal) throw new Error('Client Portal not found.')
  const patch: Record<string, unknown> = { status: 'active', updated_at: now.toISOString() }
  if (portal.status === 'expired' || hasPortalExpired(portal.expires_at)) {
    const { data: settings } = await admin
      .from('google_drive_settings')
      .select('portal_expiry_days')
      .eq('id', 1)
      .maybeSingle()
    const days = Math.max(1, Number(settings?.portal_expiry_days || 30))
    const renewedUntil = new Date(now)
    renewedUntil.setUTCDate(renewedUntil.getUTCDate() + days)
    patch.expires_at = renewedUntil.toISOString()
  }
  const { data, error } = await admin
    .from('client_portals')
    .update(patch)
    .eq('booking_id', bookingId)
    .select('id')
  if (error) throw new Error(error.message)
  if (data?.length) await audit(admin, bookingId, 'portal_enabled', actor, {
    metadata: { expiresAt: typeof patch.expires_at === 'string' ? patch.expires_at : portal.expires_at },
  })
}

export async function setPortalExpiryFromDelivery(bookingId: string, deliveredAt: string) {
  const admin = getSupabaseAdmin()
  if (!admin) return
  const { data: settings } = await admin.from('google_drive_settings').select('portal_expiry_days').eq('id', 1).maybeSingle()
  const days = Math.max(1, Number(settings?.portal_expiry_days || 30))
  const expires = new Date(deliveredAt)
  expires.setUTCDate(expires.getUTCDate() + days)
  await admin
    .from('client_portals')
    .update({ expires_at: expires.toISOString(), updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
  await audit(admin, bookingId, 'portal_expiration_scheduled', { type: 'system' }, { metadata: { expiresAt: expires.toISOString(), days } })
}
