import type { SupabaseClient } from '@supabase/supabase-js'
import type { Booking, Notification } from '@/lib/data-store'
import { mapDbBookingToModel, mapModelBookingToDb, mapModelBookingToDbCore, mapDbPackageRow, type DbPackageRow } from '@/lib/booking-db'
import { PACKAGE_SEED_ROWS } from '@/lib/packages-seed'
import { filterMissingPackageRows } from '@/lib/package-seed-sync'
import { isSupabaseConfigured } from '@/lib/supabase/env'

function mergeBookingsById(...lists: Booking[][]): Booking[] {
  const map = new Map<string, Booking>()
  for (const list of lists) for (const b of list) {
    const existing = map.get(b.id)
    if (!existing || new Date(b.createdAt).getTime() >= new Date(existing.createdAt).getTime()) map.set(b.id, b)
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
export function mergeBookingsLists(primary: Booking[], secondary: Booking[]): Booking[] { return mergeBookingsById(primary, secondary) }
export async function listBookingsFromDb(client: SupabaseClient): Promise<Booking[] | null> {
  if (!isSupabaseConfigured()) return null
  const { data, error } = await client.from('bookings').select('*').order('created_at', { ascending: false })
  if (error) { console.error('listBookingsFromDb:', error.message); return null }
  return data.map((row) => mapDbBookingToModel(row))
}
export async function getBookingFromDb(client: SupabaseClient, id: string): Promise<Booking | null> {
  if (!isSupabaseConfigured()) return null
  const { data, error } = await client.from('bookings').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return mapDbBookingToModel(data)
}
export async function deleteBookingFromDb(client: SupabaseClient, id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  const { error } = await client.from('bookings').delete().eq('id', id)
  if (error) { console.error('deleteBookingFromDb:', error.message); return false }
  return true
}
export async function saveBookingToDb(client: SupabaseClient, booking: Booking): Promise<Booking | null> {
  if (!isSupabaseConfigured()) return null
  const attempt = async (payload: Record<string, unknown>) => client.from('bookings').upsert(payload).select().single()
  let { data, error } = await attempt(mapModelBookingToDb(booking))
  if (error) {
    const retry = await attempt(mapModelBookingToDbCore(booking))
    if (retry.error) {
      console.error('saveBookingToDb:', { initialError: error.message, retryError: retry.error.message })
      throw new Error('Your booking could not be saved. Try: refresh the page, or contact the studio if the problem continues.')
    }
    data = retry.data
  }
  const fromDb = mapDbBookingToModel(data)
  return {
    ...fromDb, ...booking,
    customerName: booking.customerName || fromDb.customerName,
    customerEmail: booking.customerEmail || fromDb.customerEmail,
    customerPhone: booking.customerPhone || fromDb.customerPhone,
    customerFbLink: booking.customerFbLink || fromDb.customerFbLink,
    customerFbName: booking.customerFbName || fromDb.customerFbName,
    schoolName: booking.schoolName ?? fromDb.schoolName,
    course: booking.course ?? fromDb.course,
    hoodColor: booking.hoodColor ?? fromDb.hoodColor,
    togaColor: booking.togaColor ?? fromDb.togaColor,
    tasselColor: booking.tasselColor ?? fromDb.tasselColor,
    backgroundColor: booking.backgroundColor ?? fromDb.backgroundColor,
    slotId: booking.slotId ?? fromDb.slotId,
    receiptUrl: Object.prototype.hasOwnProperty.call(booking, 'receiptUrl') && !booking.receiptUrl ? undefined : booking.receiptUrl ?? fromDb.receiptUrl,
    transactionRef: Object.prototype.hasOwnProperty.call(booking, 'transactionRef') && !booking.transactionRef ? undefined : booking.transactionRef?.trim() || fromDb.transactionRef,
    paymentHistory: Array.isArray(booking.paymentHistory) ? booking.paymentHistory : fromDb.paymentHistory,
  }
}
export async function listNotificationsFromDb(client: SupabaseClient): Promise<Notification[] | null> {
  if (!isSupabaseConfigured()) return null
  const { data, error } = await client.from('notifications').select('*').order('created_at', { ascending: false })
  if (error) return null
  return data.map((n) => ({ id: String(n.id), bookingId: String(n.booking_id), type: n.type as Notification['type'], message: String(n.message), isRead: Boolean(n.is_read), createdAt: String(n.created_at) }))
}
export async function addNotificationToDb(client: SupabaseClient, bookingId: string, type: Notification['type'], message: string): Promise<Notification | null> {
  if (!isSupabaseConfigured()) return null
  const { data, error } = await client.from('notifications').insert({ booking_id: bookingId, type, message }).select().single()
  if (error) { console.error('addNotificationToDb:', error.message); return null }
  return { id: String(data.id), bookingId: String(data.booking_id), type: data.type as Notification['type'], message: String(data.message), isRead: Boolean(data.is_read), createdAt: String(data.created_at) }
}
export async function markBookingNotificationsReadInDb(client: SupabaseClient, bookingId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0
  const { data, error } = await client.from('notifications').update({ is_read: true }).eq('booking_id', bookingId).eq('is_read', false).select('id')
  if (error) { console.error('markBookingNotificationsReadInDb:', error.message); return 0 }
  return data?.length ?? 0
}
export async function listPackagesFromDb(client: SupabaseClient, category?: string) {
  if (!isSupabaseConfigured()) return null
  let query = client.from('packages').select('*').eq('is_active', true).order('sort_order', { ascending: true })
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) { console.error('listPackagesFromDb:', error.message); return null }
  return (data as DbPackageRow[]).map((row) => mapDbPackageRow(row))
}
export async function syncPackagesToDb(client: SupabaseClient): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  const rows = PACKAGE_SEED_ROWS.map((p) => ({
    id: p.id, category: p.category, title: p.title, price_display: p.price_display, price_amount: p.price_amount,
    duration: p.duration, description: p.description, features: p.features, slot_type: p.slot_type,
    secondary_price_display: p.secondary_price_display ?? null, secondary_price_amount: p.secondary_price_amount ?? null,
    secondary_price_label: p.secondary_price_label ?? null, book_variants: p.book_variants ?? null, note: p.note ?? null,
    is_active: true, selection_limit: p.selection_limit, sort_order: p.sort_order,
  }))
  const { data: existing, error: readError } = await client
    .from('packages')
    .select('id')
    .in('id', rows.map((row) => row.id))
  if (readError) { console.error('syncPackagesToDb:', readError.message); return false }

  // The Admin Package Manager is the source of truth. Seed data may fill missing
  // defaults, but must never overwrite a package an administrator has edited.
  const missingRows = filterMissingPackageRows(rows, (existing ?? []).map((row) => String(row.id)))
  if (missingRows.length === 0) return false

  const { error: insertError } = await client.from('packages').insert(missingRows)
  if (insertError) { console.error('syncPackagesToDb:', insertError.message); return false }
  return true
}
