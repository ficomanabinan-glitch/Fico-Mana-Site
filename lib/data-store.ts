import type { BookingPackage } from './booking-packages'
import { bookingPackages } from './booking-packages'
import type { BlockedSlot } from './blocked-slots'
import type { FicoSpotBlock } from './fico-spot-blocks'

export interface PaymentRecord {
  id: string
  amount: number
  method: 'GCash' | 'Cash' | 'Card' | 'Maya' | 'Bank Transfer' | 'BPI'
  type: 'Deposit' | 'Balance Payment'
  transactionRef?: string
  date: string
}

export interface Booking {
  id: string
  customerName: string
  customerEmail: string
  customerPhone: string
  customerFbLink: string
  customerFbName: string
  packageId: string
  packageName: string
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
  rawPhotoStatus?: 'Pending Review' | 'Approved' | 'Rejected'
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
const NOTIFS_KEY = 'ficomana_notifications'

export function dispatchAdminRefresh() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('admin:db-synced'))
  }
}

function cacheBookings(bookings: Booking[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings))
  }
}

function cacheNotifications(notifs: Notification[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifs))
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

/** Staff: all bookings from API (Supabase is source of truth). */
export async function getBookings(): Promise<Booking[]> {
  try {
    const res = await fetch('/api/bookings', { cache: 'no-store', credentials: 'include' })
    if (res.ok) {
      const data = (await res.json()) as Booking[]
      cacheBookings(data)
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
  // Never fall back to localStorage for admin — stale cache shows ghost verification items.
  return []
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

/** Public: admin-held FICO spots per day. */
export async function getFicoSpotBlocks(): Promise<FicoSpotBlock[]> {
  try {
    const res = await fetch('/api/fico-spot-blocks', { cache: 'no-store' })
    if (res.ok) return (await res.json()) as FicoSpotBlock[]
  } catch (error) {
    console.error('getFicoSpotBlocks failed:', error)
  }
  return []
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

/** Public: admin-blocked session slots (studio can still operate other slots). */
export async function getBlockedSlots(): Promise<BlockedSlot[]> {
  try {
    const res = await fetch('/api/blocked-slots', { cache: 'no-store' })
    if (res.ok) return (await res.json()) as BlockedSlot[]
  } catch (error) {
    console.error('getBlockedSlots failed:', error)
  }
  return []
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
    if (res.ok) return (await res.json()) as BlockedSlot
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
    return res.ok
  } catch (error) {
    console.error('unblockSlot failed:', error)
    return false
  }
}

export async function getBooking(id: string): Promise<Booking | null> {
  try {
    const res = await fetch(`/api/bookings/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      credentials: 'include',
    })
    if (res.ok) return (await res.json()) as Booking
  } catch (error) {
    console.error(`getBooking failed for ${id}:`, error)
  }
  return getCachedBookings().find((b) => b.id === id) ?? null
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

  // Fallback to client-side upload when service role storage is unavailable
  if (res.status === 503) {
    return uploadReceipt(bookingId, file)
  }

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
  message?: string
}> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, message: 'Sync failed' }
    return (await res.json()) as {
      ok: boolean
      bookingsPushed?: number
      bookingsUpdated?: number
      notificationsPushed?: number
      message?: string
    }
  } catch (error) {
    console.error('syncAdminDatabase failed:', error)
    return { ok: false, message: 'Sync failed' }
  }
}

export async function saveBooking(booking: Booking): Promise<{ booking: Booking; emailErrors: string[] }> {
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
  const cached = getCachedBookings()
  const idx = cached.findIndex((b) => b.id === saved.id)
  if (idx >= 0) cached[idx] = saved
  else cached.unshift(saved)
  cacheBookings(cached)
  return { booking: saved, emailErrors }
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const res = await fetch('/api/notifications', { cache: 'no-store', credentials: 'include' })
    if (res.ok) {
      const data = (await res.json()) as Notification[]
      cacheNotifications(data)
      return data
    }
  } catch (error) {
    console.error('getNotifications failed:', error)
  }
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(NOTIFS_KEY)
    return raw ? (JSON.parse(raw) as Notification[]) : []
  } catch {
    return []
  }
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
    const notifs = await getNotifications()
    cacheNotifications(notifs.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    dispatchAdminRefresh()
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

export async function getEmailLogs(): Promise<EmailLog[]> {
  try {
    const res = await fetch('/api/emails/logs', { cache: 'no-store', credentials: 'include' })
    if (res.ok) return (await res.json()) as EmailLog[]
  } catch (error) {
    console.error('getEmailLogs failed:', error)
  }
  return []
}

export async function uploadReceipt(bookingId: string, file: File, email?: string): Promise<string> {
  if (email) {
    try {
      const form = new FormData()
      form.append('bookingId', bookingId)
      form.append('email', email)
      form.append('file', file)
      const res = await fetch('/api/receipts/upload', { method: 'POST', body: form })
      const data = (await res.json().catch(() => ({}))) as { receiptUrl?: string; error?: string }
      if (res.ok && data.receiptUrl) return data.receiptUrl
      if (res.status !== 503) {
        console.warn('Server receipt upload failed:', data.error)
      }
    } catch (error) {
      console.warn('Server receipt upload unavailable:', error)
    }
  }

  const { supabase, isSupabaseConfigured } = await import('./supabase')
  const fileName = `${bookingId}-${Date.now()}-${file.name.replace(/\s+/g, '-')}`

  if (isSupabaseConfigured()) {
    const { error } = await supabase.storage.from('receipts').upload(fileName, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName)
      return publicUrl
    }
    console.error('Supabase storage upload error:', error)
  }

  return mockUploadFile(file)
}

function mockUploadFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (file.size > 500000) resolve('/model/model_3.jpg')
      else resolve(reader.result as string)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export { mapDbBookingToModel, mapModelBookingToDb } from './booking-db'
