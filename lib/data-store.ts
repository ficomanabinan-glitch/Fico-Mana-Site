import type { BookingPackage } from './booking-packages'
import { bookingPackages } from './booking-packages'
import type { BlockedSlot } from './blocked-slots'
import type { FicoSpotBlock } from './fico-spot-blocks'
import { signalSalesDataChanged } from './sales-read-cache'
import { STAFF_READ_FRESH_MS } from './admin-cache-policy.ts'

export interface PaymentRecord {
  id: string
  amount: number
  method: 'GCash' | 'Cash' | 'Card' | 'Maya' | 'Bank Transfer' | 'BPI'
  type: 'Deposit' | 'Balance Payment'
  transactionRef?: string
  date: string
}

export interface Booking extends Record<string, unknown> {
  id: string
  customerName: string
  customerEmail: string
  customerPhone: string
  customerFbLink: string
  customerFbName: string
  packageId: string
  packageName: string
  packageSlotType?: 'makeup' | 'standard'
  selectionLimit?: number
  bookingDate: string
  bookingTime: string
  slotId?: string
  arrivalTime?: string
  shootTime?: string
  isWalkIn?: boolean
  note?: string
  staffNotes?: string
  schoolName?: string
  course?: string
  hoodColor?: string
  togaColor?: string
  tasselColor?: string
  backgroundColor?: string
  depositAmount: number
  price: number
  transactionRef?: string
  bookingStatus: 'Pending Payment' | 'Pending Verification' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Completed' | 'No Show'
  paymentStatus: 'Unpaid' | 'Pending Verification' | 'Paid Deposit' | 'Paid Full' | 'Refunded'
  rejectionReason?: string
  /** Transient — used when staff rejects a receipt; not stored in DB. */
  rejectionReasonId?: string
  createdAt: string
  receiptUrl?: string
  paymentHistory: PaymentRecord[]
  driveLink?: string
  rawPhotoLink?: string
  rawPhotoStatus?: 'Pending Review' | 'Approved' | 'Rejected' | 'Reopened'
  rawPhotoNotes?: string
  rawPhotoSubmittedAt?: string
  /** When editors approved the 5-pick — starts the 12-day edit window. */
  rawPhotoApprovedAt?: string
  /** Final edited photos Drive folder — sent to client by editor. */
  editedPhotoLink?: string
  editedPhotoDeliveredAt?: string
}

export interface Notification {
  id: string
  bookingId: string
  type:
    | 'NEW_BOOKING'
    | 'RECEIPT_UPLOAD'
    | 'CANCELLED'
    | 'RESUBMITTED'
    | 'PAYMENT_REJECTED'
    | 'RAW_PHOTO_UPLOAD'
    | 'RAW_PHOTO_APPROVED'
    | 'RAW_PHOTO_REJECTED'
    | 'EDITED_PHOTOS_READY'
    | 'OPS_REMINDER'
    | 'OPS_PAID'
    | 'SHOOT_REMINDER_ERROR'
  message: string
  isRead: boolean
  createdAt: string
}

export interface EmailLog {
  id: string
  bookingId: string
  recipientEmail: string
  subject: string
  body: string
  status: 'SENT' | 'FAILED'
  sentAt: string
}

const BOOKINGS_KEY = 'ficomana_bookings'
const BOOKINGS_AT_KEY = 'ficomana_bookings_cached_at'
const NOTIFS_KEY = 'ficomana_notifications'
const NOTIFS_AT_KEY = 'ficomana_notifications_cached_at'

let bookingsInFlight: Promise<Booking[]> | null = null
let bookingsGeneration = 0
let notificationsInFlight: Promise<Notification[]> | null = null
let blockedSlotsMemory: { data: BlockedSlot[]; at: number } | null = null
let blockedSlotsInFlight: Promise<BlockedSlot[]> | null = null
let ficoSpotBlocksMemory: { data: FicoSpotBlock[]; at: number } | null = null
let ficoSpotBlocksInFlight: Promise<FicoSpotBlock[]> | null = null
let emailLogsMemory: { data: EmailLog[]; at: number } | null = null
let emailLogsInFlight: Promise<EmailLog[]> | null = null
let readSessionGeneration = 0

/** Also discard legacy persisted reads when entering/leaving a staff session. */
export function clearAdminReadCaches() {
  readSessionGeneration += 1
  bookingsGeneration += 1
  bookingsInFlight = null
  notificationsInFlight = null
  blockedSlotsMemory = null
  blockedSlotsInFlight = null
  ficoSpotBlocksMemory = null
  ficoSpotBlocksInFlight = null
  emailLogsMemory = null
  emailLogsInFlight = null
  if (typeof window !== 'undefined') {
    try {
      for (const key of [BOOKINGS_KEY, BOOKINGS_AT_KEY, NOTIFS_KEY, NOTIFS_AT_KEY]) localStorage.removeItem(key)
    } catch { /* Storage can be disabled; the in-memory caches are still cleared. */ }
  }
}

/** undefined means not loaded; an empty list is a successful cached result. */
export function peekBookings(): Booking[] | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY)
    if (!raw) return undefined
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : undefined
  } catch { return undefined }
}

export function peekBlockedSlots() { return blockedSlotsMemory?.data }
export function peekFicoSpotBlocks() { return ficoSpotBlocksMemory?.data }
export function peekEmailLogs() { return emailLogsMemory?.data }

function cacheIsFresh(at: number | null | undefined) {
  return !!at && Date.now() - at < STAFF_READ_FRESH_MS
}

function cachedAt(key: string) {
  if (typeof window === 'undefined') return 0
  return Number(localStorage.getItem(key) || 0)
}

function invalidateAdminReadCaches() {
  bookingsGeneration += 1
  bookingsInFlight = null
  if (typeof window !== 'undefined') {
    localStorage.setItem(BOOKINGS_AT_KEY, '0')
    localStorage.setItem(NOTIFS_AT_KEY, '0')
  }
  blockedSlotsMemory = blockedSlotsMemory ? { ...blockedSlotsMemory, at: 0 } : null
  ficoSpotBlocksMemory = ficoSpotBlocksMemory ? { ...ficoSpotBlocksMemory, at: 0 } : null
  emailLogsMemory = emailLogsMemory ? { ...emailLogsMemory, at: 0 } : null
}

function signalAdminCacheUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('admin:db-synced'))
  }
}

export function dispatchAdminRefresh() {
  invalidateAdminReadCaches()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('admin:db-synced'))
  }
}

function cacheBookings(bookings: Booking[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings))
    localStorage.setItem(BOOKINGS_AT_KEY, String(Date.now()))
  }
}

function cacheNotifications(notifs: Notification[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifs))
    localStorage.setItem(NOTIFS_AT_KEY, String(Date.now()))
  }
}

function getCachedBookings(): Booking[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(BOOKINGS_KEY)
    return data ? (JSON.parse(data) as Booking[]) : []
  } catch {
    return []
  }
}

function getCachedNotifications(): Notification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(NOTIFS_KEY)
    return raw ? (JSON.parse(raw) as Notification[]) : []
  } catch {
    return []
  }
}

/** Load bookable packages from API (falls back to code catalog). */
export async function getBookingPackages(category?: string): Promise<BookingPackage[]> {
  try {
    const url = category ? `/api/packages?category=${encodeURIComponent(category)}` : '/api/packages'
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) return (await res.json()) as BookingPackage[]
  } catch (error) {
    console.error('getBookingPackages failed:', error)
  }
  return category ? bookingPackages.filter((p) => p.category === category) : bookingPackages
}

async function fetchBookingsFresh(signalUpdate = false): Promise<Booking[]> {
  if (bookingsInFlight) return bookingsInFlight
  const generation = bookingsGeneration
  const work = (async () => {
    try {
      const res = await fetch('/api/bookings', { cache: 'no-store', credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as Booking[]
        // A read started before a mutation must never restore an old row.
        if (generation !== bookingsGeneration) return getCachedBookings()
        cacheBookings(data)
        if (signalUpdate) queueMicrotask(signalAdminCacheUpdated)
        return data
      }
      if (res.status === 401) {
        console.error('getBookings: staff login required')
        return []
      }
      console.error('getBookings failed:', res.status)
    } catch (error) {
      console.error('getBookings failed:', error)
    }
    return getCachedBookings()
  })()
  bookingsInFlight = work
  try {
    return await work
  } finally {
    if (bookingsInFlight === work) bookingsInFlight = null
  }
}

/** Staff: all bookings from API. Recent cached data renders immediately while stale data refreshes quietly. */
export async function getBookings(options: { force?: boolean } = {}): Promise<Booking[]> {
  const cached = peekBookings()
  if (options.force) {
    if (cached !== undefined) {
      void fetchBookingsFresh(true)
      return cached
    }
    return fetchBookingsFresh(false)
  }
  // An authoritative empty list is cached too (including after the last deletion).
  if (cached !== undefined && cacheIsFresh(cachedAt(BOOKINGS_AT_KEY))) return cached
  if (cached !== undefined) {
    void fetchBookingsFresh(true)
    return cached
  }
  return fetchBookingsFresh(false)
}

/** undefined means not loaded; an empty notification list is still authoritative. */
export function peekNotifications(): Notification[] | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(NOTIFS_KEY)
    if (!raw) return undefined
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : undefined
  } catch {
    return undefined
  }
}

/** Drop only a server-confirmed missing/deleted booking, then notify mounted views. */
function forgetBooking(id: string) {
  invalidateAdminReadCaches()
  cacheBookings(getCachedBookings().filter(booking => booking.id !== id))
  signalSalesDataChanged()
  signalAdminCacheUpdated()
}

/** Same-origin tabs share localStorage, but not in-flight requests or React state. */
export function receiveBookingCacheChange(event: StorageEvent) {
  if (event.storageArea !== localStorage || (event.key !== BOOKINGS_KEY && event.key !== null)) return
  bookingsGeneration += 1
  bookingsInFlight = null
  // Do not write storage here: that would create a cross-tab refresh loop.
  signalSalesDataChanged()
  signalAdminCacheUpdated()
}

export async function deleteBooking(
  id: string,
  reason: 'admin_error' | 'client_error',
  notes?: string,
): Promise<{ alreadyDeleted: boolean }> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, notes: notes?.trim() || undefined }),
  })
  const data = await res.json().catch(() => ({})) as { error?: string }
  // Only the authenticated route's exact not-found response is a safe no-op.
  // Network failures, login failures, other 404s and server errors retain the row.
  const alreadyDeleted = res.status === 404 && data.error === 'Booking not found.'
  if (!res.ok && !alreadyDeleted) {
    throw new Error(data.error || 'Could not delete the booking. Try: refresh the list and try again.')
  }
  forgetBooking(id)
  return { alreadyDeleted }
}

/** Public availability for booking calendar (no PII). */
export async function getBookingsForAvailability(): Promise<Booking[]> {
  try {
    const res = await fetch('/api/bookings/availability', { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as Array<{
        id: string
        bookingDate: string
        slotId?: string
        bookingTime?: string
        packageId: string
        packageSlotType?: 'makeup' | 'standard'
        bookingStatus: Booking['bookingStatus']
      }>
      return data.map((a) => ({
        id: a.id,
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        customerFbLink: '',
        customerFbName: '',
        packageId: a.packageId,
        packageSlotType: a.packageSlotType,
        packageName: '',
        bookingDate: a.bookingDate,
        bookingTime: a.bookingTime || '',
        slotId: a.slotId,
        depositAmount: 0,
        price: 0,
        bookingStatus: a.bookingStatus,
        paymentStatus: 'Unpaid',
        createdAt: '',
        paymentHistory: [],
      }))
    }
  } catch (error) {
    console.error('getBookingsForAvailability failed:', error)
  }
  return []
}

async function fetchFicoSpotBlocksFresh(signalUpdate = false): Promise<FicoSpotBlock[]> {
  if (ficoSpotBlocksInFlight) return ficoSpotBlocksInFlight
  const generation = readSessionGeneration
  ficoSpotBlocksInFlight = (async () => {
    try {
      const res = await fetch('/api/fico-spot-blocks', { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as FicoSpotBlock[]
        if (generation !== readSessionGeneration) return []
        ficoSpotBlocksMemory = { data, at: Date.now() }
        if (signalUpdate) queueMicrotask(signalAdminCacheUpdated)
        return data
      }
    } catch (error) {
      console.error('getFicoSpotBlocks failed:', error)
    }
    return ficoSpotBlocksMemory?.data ?? []
  })()
  try {
    return await ficoSpotBlocksInFlight
  } finally {
    if (generation === readSessionGeneration) ficoSpotBlocksInFlight = null
  }
}

/** Public: admin-held FICO spots per day. */
export async function getFicoSpotBlocks(): Promise<FicoSpotBlock[]> {
  if (ficoSpotBlocksMemory && cacheIsFresh(ficoSpotBlocksMemory.at)) return ficoSpotBlocksMemory.data
  if (ficoSpotBlocksMemory) {
    void fetchFicoSpotBlocksFresh(true)
    return ficoSpotBlocksMemory.data
  }
  return fetchFicoSpotBlocksFresh(false)
}

/** Staff: hold N FICO spots on a date (0 clears the hold). */
export async function setFicoSpotBlock(
  date: string,
  spotsBlocked: number,
  reason: string,
): Promise<FicoSpotBlock | null> {
  try {
    const res = await fetch('/api/fico-spot-blocks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, spotsBlocked, reason }),
    })
    if (res.ok) {
      ficoSpotBlocksMemory = ficoSpotBlocksMemory ? { ...ficoSpotBlocksMemory, at: 0 } : null
      const data = await res.json()
      if (data?.cleared) return null
      return data as FicoSpotBlock
    }
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to update FICO spots')
  } catch (error) {
    console.error('setFicoSpotBlock failed:', error)
    throw error
  }
}

async function fetchBlockedSlotsFresh(signalUpdate = false): Promise<BlockedSlot[]> {
  if (blockedSlotsInFlight) return blockedSlotsInFlight
  const generation = readSessionGeneration
  blockedSlotsInFlight = (async () => {
    try {
      const res = await fetch('/api/blocked-slots', { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as BlockedSlot[]
        if (generation !== readSessionGeneration) return []
        blockedSlotsMemory = { data, at: Date.now() }
        if (signalUpdate) queueMicrotask(signalAdminCacheUpdated)
        return data
      }
    } catch (error) {
      console.error('getBlockedSlots failed:', error)
    }
    return blockedSlotsMemory?.data ?? []
  })()
  try {
    return await blockedSlotsInFlight
  } finally {
    if (generation === readSessionGeneration) blockedSlotsInFlight = null
  }
}

/** Public: admin-blocked session slots (studio can still operate other slots). */
export async function getBlockedSlots(): Promise<BlockedSlot[]> {
  if (blockedSlotsMemory && cacheIsFresh(blockedSlotsMemory.at)) return blockedSlotsMemory.data
  if (blockedSlotsMemory) {
    void fetchBlockedSlotsFresh(true)
    return blockedSlotsMemory.data
  }
  return fetchBlockedSlotsFresh(false)
}

/** Staff: block a session slot on a date. */
export async function blockSlot(date: string, slotId: string, reason: string): Promise<BlockedSlot | null> {
  try {
    const res = await fetch('/api/blocked-slots', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, slotId, reason }),
    })
    if (res.ok) {
      blockedSlotsMemory = blockedSlotsMemory ? { ...blockedSlotsMemory, at: 0 } : null
      return (await res.json()) as BlockedSlot
    }
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to block slot')
  } catch (error) {
    console.error('blockSlot failed:', error)
    throw error
  }
}

/** Staff: reopen a blocked session slot. */
export async function unblockSlot(date: string, slotId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/blocked-slots?date=${encodeURIComponent(date)}&slotId=${encodeURIComponent(slotId)}`,
      { method: 'DELETE', credentials: 'include' },
    )
    if (res.ok) blockedSlotsMemory = blockedSlotsMemory ? { ...blockedSlotsMemory, at: 0 } : null
    return res.ok
  } catch (error) {
    console.error('unblockSlot failed:', error)
    return false
  }
}

export async function getBooking(id: string): Promise<Booking | null> {
  const cached = getCachedBookings().find((b) => b.id === id)
  if (cached && cacheIsFresh(cachedAt(BOOKINGS_AT_KEY))) return cached
  try {
    const res = await fetch(`/api/bookings/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      credentials: 'include',
    })
    if (res.ok) return (await res.json()) as Booking
    if (res.status === 404) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (data.error === 'Not found') {
        forgetBooking(id)
        return null
      }
    }
  } catch (error) {
    console.error(`getBooking failed for ${id}:`, error)
  }
  return cached ?? null
}

export type PublicResubmitBooking = {
  id: string
  customerName: string
  packageName: string
  bookingDate: string
  bookingTime: string
  depositAmount: number
  bookingStatus: Booking['bookingStatus']
  rejectionReason?: string
}

export async function lookupBookingForResubmit(
  id: string,
  email: string,
): Promise<PublicResubmitBooking> {
  const res = await fetch('/api/bookings/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, email }),
  })
  const data = (await res.json().catch(() => ({}))) as PublicResubmitBooking & { error?: string }
  if (!res.ok) throw new Error(data.error || 'Booking not found.')
  return data
}

export async function uploadReceiptForResubmit(
  bookingId: string,
  email: string,
  file: File,
): Promise<string> {
  const form = new FormData()
  form.append('bookingId', bookingId)
  form.append('email', email)
  form.append('file', file)

  const res = await fetch('/api/receipts/upload', { method: 'POST', body: form })
  const data = (await res.json().catch(() => ({}))) as { receiptUrl?: string; error?: string }
  if (res.ok && data.receiptUrl) return data.receiptUrl

  throw new Error(data.error || 'Failed to upload receipt.')
}

export async function resubmitReceipt(payload: {
  id: string
  email: string
  receiptUrl: string
  transactionRef?: string
  paymentMethod?: 'GCash' | 'BPI'
}): Promise<{ message: string }> {
  const res = await fetch(`/api/bookings/${encodeURIComponent(payload.id)}/resubmit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: payload.email,
      receiptUrl: payload.receiptUrl,
      transactionRef: payload.transactionRef,
      paymentMethod: payload.paymentMethod,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
  if (!res.ok) throw new Error(data.error || 'Failed to resubmit receipt.')
  return { message: data.message || 'Receipt submitted.' }
}

export async function syncAdminDatabase(): Promise<{
  ok: boolean
  bookingsPushed?: number
  bookingsUpdated?: number
  notificationsPushed?: number
  packagesSynced?: boolean
  message?: string
}> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, message: 'Sync failed' }
    const result = (await res.json()) as {
      ok: boolean
      bookingsPushed?: number
      bookingsUpdated?: number
      notificationsPushed?: number
      packagesSynced?: boolean
      message?: string
    }
    const dataChanged = (result.bookingsPushed ?? 0) > 0
      || (result.bookingsUpdated ?? 0) > 0
      || (result.notificationsPushed ?? 0) > 0
      || result.packagesSynced === true
    if (result.ok && dataChanged) invalidateAdminReadCaches()
    return result
  } catch (error) {
    console.error('syncAdminDatabase failed:', error)
    return { ok: false, message: 'Sync failed' }
  }
}

export async function saveBooking(booking: Booking): Promise<{ booking: Booking; emailErrors: string[] }> {
  const generation = readSessionGeneration
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(booking),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || 'Failed to save booking')
  }

  const data = (await res.json()) as Booking & { emailErrors?: string[] }
  const { emailErrors = [], ...saved } = data
  if (generation !== readSessionGeneration) return { booking: saved, emailErrors }
  // Do not let a list fetched before this save overwrite the saved record.
  bookingsGeneration += 1
  bookingsInFlight = null
  const cached = getCachedBookings()
  const idx = cached.findIndex((b) => b.id === saved.id)
  if (idx >= 0) cached[idx] = saved
  else cached.unshift(saved)
  cacheBookings(cached)
  signalSalesDataChanged()
  return { booking: saved, emailErrors }
}

async function fetchNotificationsFresh(signalUpdate = false): Promise<Notification[]> {
  if (notificationsInFlight) return notificationsInFlight
  const generation = readSessionGeneration
  notificationsInFlight = (async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store', credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as Notification[]
        if (generation !== readSessionGeneration) return []
        cacheNotifications(data)
        if (signalUpdate) queueMicrotask(signalAdminCacheUpdated)
        return data
      }
    } catch (error) {
      console.error('getNotifications failed:', error)
    }
    return getCachedNotifications()
  })()
  try {
    return await notificationsInFlight
  } finally {
    if (generation === readSessionGeneration) notificationsInFlight = null
  }
}

export async function getNotifications(options: { force?: boolean } = {}): Promise<Notification[]> {
  const cached = peekNotifications()
  if (options.force) {
    if (cached !== undefined) {
      void fetchNotificationsFresh(true)
      return cached
    }
    return fetchNotificationsFresh(false)
  }
  if (cached !== undefined && cacheIsFresh(cachedAt(NOTIFS_AT_KEY))) return cached
  if (cached !== undefined) {
    void fetchNotificationsFresh(true)
    return cached
  }
  return fetchNotificationsFresh(false)
}

export async function addNotification(
  bookingId: string,
  type: Notification['type'],
  message: string,
): Promise<void> {
  const res = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ bookingId, type, message }),
  })
  if (!res.ok) throw new Error('Failed to add notification')
  dispatchAdminRefresh()
}

export async function dismissBookingNotifications(bookingId: string): Promise<void> {
  const res = await fetch('/api/notifications/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ bookingId }),
  })
  if (!res.ok) throw new Error('Failed to dismiss notifications')
  dispatchAdminRefresh()
}

export async function markNotificationRead(id: string): Promise<void> {
  const res = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
  })
  if (!res.ok) return

  if (typeof window !== 'undefined') {
    const notifs = getCachedNotifications().map((n) => (n.id === id ? { ...n, isRead: true } : n))
    cacheNotifications(notifs)
  }
}

export type OpsSubscriptionStatus = {
  period: {
    cycleKey: string
    periodEnd: string
    daysLeft: number
    shouldNotify: boolean
    isOverdue: boolean
  }
  isPaid: boolean
}

export async function getOpsSubscriptionStatus(): Promise<OpsSubscriptionStatus | null> {
  try {
    const res = await fetch('/api/ops-subscriptions', { cache: 'no-store', credentials: 'include' })
    if (res.ok) return (await res.json()) as OpsSubscriptionStatus
  } catch (error) {
    console.error('getOpsSubscriptionStatus failed:', error)
  }
  return null
}

export async function markOpsSubscriptionPaid(): Promise<boolean> {
  try {
    const res = await fetch('/api/ops-subscriptions', {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return false
    dispatchAdminRefresh()
    return true
  } catch (error) {
    console.error('markOpsSubscriptionPaid failed:', error)
    return false
  }
}

async function fetchEmailLogsFresh(signalUpdate = false): Promise<EmailLog[]> {
  if (emailLogsInFlight) return emailLogsInFlight
  const generation = readSessionGeneration
  emailLogsInFlight = (async () => {
    try {
      const res = await fetch('/api/emails/logs', { cache: 'no-store', credentials: 'include' })
      if (res.ok) {
        const data = (await res.json()) as EmailLog[]
        if (generation !== readSessionGeneration) return []
        emailLogsMemory = { data, at: Date.now() }
        if (signalUpdate) queueMicrotask(signalAdminCacheUpdated)
        return data
      }
    } catch (error) {
      console.error('getEmailLogs failed:', error)
    }
    return emailLogsMemory?.data ?? []
  })()
  try {
    return await emailLogsInFlight
  } finally {
    if (generation === readSessionGeneration) emailLogsInFlight = null
  }
}

export async function getEmailLogs(): Promise<EmailLog[]> {
  if (emailLogsMemory && cacheIsFresh(emailLogsMemory.at)) return emailLogsMemory.data
  if (emailLogsMemory) {
    void fetchEmailLogsFresh(true)
    return emailLogsMemory.data
  }
  return fetchEmailLogsFresh(false)
}

export async function uploadReceipt(bookingId: string, file: File, email?: string): Promise<string> {
  const form = new FormData()
  form.append('bookingId', bookingId)
  if (email) form.append('email', email)
  form.append('file', file)
  const res = await fetch('/api/receipts/upload', {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const data = (await res.json().catch(() => ({}))) as { receiptUrl?: string; error?: string }
  if (res.ok && data.receiptUrl) return data.receiptUrl
  throw new Error(data.error || 'Failed to upload receipt.')
}

export { mapDbBookingToModel, mapModelBookingToDb } from './booking-db'
