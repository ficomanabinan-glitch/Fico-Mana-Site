import type { SupabaseClient } from '@supabase/supabase-js'
import type { Booking, PaymentRecord } from '@/lib/data-store'
import { mapDbBookingToModel } from '@/lib/booking-db'
import { portalUrl } from '@/lib/client-portal'
import { hasPortalExpired } from '@/lib/portal-expiry'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { assertGraduationBooking, packageUsesGraduationWorkflow } from '@/lib/package-workflow-server'
import { bookingStoragePrefix } from '@/lib/storage/storage-keys'

export type ProvisioningStatus = 'NOT_STARTED' | 'PROVISIONING' | 'ACTIVE' | 'PARTIAL_FAILURE' | 'FAILED'

export type ProvisioningSnapshot = {
  bookingId: string
  required?: boolean
  status: ProvisioningStatus
  storageProvider?: 'r2' | 'legacy_external'
  storagePrefix?: string
  storageStatus?: 'ready' | 'migration_required' | 'error' | 'archived'
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
  const [confirmedPayments, usesWorkflow] = await Promise.all([
    totalConfirmedPayments(admin, booking),
    packageUsesGraduationWorkflow(admin, booking.packageId),
  ])
  if (!usesWorkflow) return {
    bookingId, required: false, status: 'NOT_STARTED', confirmedPayments,
    requiredDeposit: Number(booking.depositAmount || 0),
  }
  const [row, { data: portal }] = await Promise.all([getProvisioningRow(admin, bookingId), admin
    .from('client_portals')
    .select('id,public_id,status,expires_at')
    .eq('booking_id', bookingId)
    .maybeSingle()])
  const portalExpired = hasPortalExpired(portal?.expires_at)
  const portalActive = portal?.status === 'active' && !portalExpired

  return {
    bookingId,
    status: row.status as ProvisioningStatus,
    storageProvider: row.storage_provider || undefined,
    storagePrefix: row.storage_prefix || undefined,
    storageStatus: row.storage_status || undefined,
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
  const [requiresPhotoWorkflow, confirmedPayments] = await Promise.all([
    packageUsesGraduationWorkflow(admin, booking.packageId),
    totalConfirmedPayments(admin, booking),
  ])
  const row = requiresPhotoWorkflow ? await getProvisioningRow(admin, bookingId) : null
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
  // photo production is skipped, before any storage or portal initialization.
  if (!requiresPhotoWorkflow || !row) return null

  await updateProvisioning(admin, bookingId, {
    status: 'PROVISIONING',
    last_error: null,
    last_retry_at: row.status === 'NOT_STARTED' ? row.last_retry_at : now,
  })
  await audit(admin, bookingId, row.status === 'NOT_STARTED' ? 'provisioning_started' : 'provisioning_retried', actor)

  let storagePrefix: string | null = null
  const errors: string[] = []

  try {
    storagePrefix = bookingStoragePrefix({
      workspaceId: String(row.workspace_id),
      bookingId,
      shootDate: booking.bookingDate,
    })
    await updateProvisioning(admin, bookingId, {
      storage_provider: 'r2',
      storage_prefix: storagePrefix,
      storage_status: 'ready',
    })
    await audit(admin, bookingId, row.storage_prefix ? 'storage_namespace_reconciled' : 'storage_namespace_prepared', actor, {
      externalResourceId: storagePrefix,
      metadata: { storageProvider: 'r2', storagePrefix },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Storage initialization failed.'
    const message = /\bTry:/i.test(detail) ? detail : `${detail} Try: verify the booking date and storage configuration, then click Retry.`
    errors.push(message)
    await audit(admin, bookingId, 'storage_initialization_failed', actor, { error: message })
  }

  // Booking confirmation prepares only the private storage namespace. The
  // first completed onsite upload activates the portal and client selection.
  const complete = !!storagePrefix
  const status: ProvisioningStatus = complete ? 'PROVISIONING' : 'FAILED'
  await updateProvisioning(admin, bookingId, {
    status,
    provisioned_at: null,
    last_error: errors.length ? errors.join(' · ') : null,
  })
  if (complete) await audit(admin, bookingId, 'storage_ready_for_onsite_upload', actor)

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
    .select('id,status,expires_at,deliverables_uploaded_at')
    .eq('booking_id', bookingId)
    .maybeSingle()
  if (portalError) throw new Error(portalError.message)
  if (!portal) throw new Error('Client Portal not found.')
  const patch: Record<string, unknown> = { status: 'active', updated_at: now.toISOString() }
  if (portal.status === 'expired' || hasPortalExpired(portal.expires_at)) {
    const { data: settings } = await admin
      .from('storage_settings')
      .select('portal_expiry_days')
      .eq('id', 1)
      .maybeSingle()
    const days = Math.max(1, Number(settings?.portal_expiry_days || 30))
    const renewedUntil = new Date(now)
    renewedUntil.setUTCDate(renewedUntil.getUTCDate() + days)
    // An explicit renewal grants a new admin-controlled period. Before the
    // first final delivery, the portal continues to wait for its timer.
    patch.expires_at = portal.deliverables_uploaded_at ? renewedUntil.toISOString() : null
  }
  const { data, error } = await admin
    .from('client_portals')
    .update(patch)
    .eq('booking_id', bookingId)
    .select('id')
  if (error) throw new Error(error.message)
  if (data?.length) await audit(admin, bookingId, 'portal_enabled', actor, {
    metadata: { expiresAt: 'expires_at' in patch ? patch.expires_at : portal.expires_at },
  })
}
