import { promises as fs } from 'fs'
import path from 'path'
import type { Booking, Notification } from '@/lib/data-store'
import { isValidBookingId } from '@/lib/booking-id'
import { assertLocalFileStoreAllowed } from '@/lib/security/local-file-store'
import { isSupabaseConfigured } from '@/lib/supabase/env'

type StoreData = {
  bookings: Booking[]
  notifications: Notification[]
}

const STORE_PATH = path.join(process.cwd(), 'data', 'ficomana-store.json')

const emptyStore = (): StoreData => ({
  bookings: [],
  notifications: [],
})

async function readStore(): Promise<StoreData> {
  assertLocalFileStoreAllowed()
  if (isSupabaseConfigured()) throw new Error('Online booking records are authoritative.')
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as StoreData
    return {
      bookings: parsed.bookings ?? [],
      notifications: parsed.notifications ?? [],
    }
  } catch {
    return emptyStore()
  }
}

async function writeStore(data: StoreData): Promise<boolean> {
  assertLocalFileStoreAllowed()
  if (isSupabaseConfigured()) throw new Error('Online booking records are authoritative.')
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
    await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.warn('File store write skipped:', error instanceof Error ? error.message : error)
    return false
  }
}

export async function listBookings(): Promise<Booking[]> {
  const store = await readStore()
  return store.bookings.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const store = await readStore()
  return store.bookings.find((b) => b.id === id) ?? null
}

export async function upsertBooking(booking: Booking): Promise<Booking> {
  if (!isValidBookingId(booking.id) && !booking.id.startsWith('FM-W')) {
    throw new Error('Invalid booking reference format')
  }
  const store = await readStore()
  const idx = store.bookings.findIndex((b) => b.id === booking.id)
  if (idx >= 0) store.bookings[idx] = booking
  else store.bookings.unshift(booking)
  await writeStore(store)
  return booking
}

export async function deleteBookingFromStore(id: string): Promise<boolean> {
  const store = await readStore()
  const before = store.bookings.length
  store.bookings = store.bookings.filter((b) => b.id !== id)
  store.notifications = store.notifications.filter((n) => n.bookingId !== id)
  if (store.bookings.length === before) return false
  await writeStore(store)
  return true
}

export async function listNotifications(): Promise<Notification[]> {
  const store = await readStore()
  return store.notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export async function addServerNotification(
  bookingId: string,
  type: Notification['type'],
  message: string,
): Promise<Notification> {
  const store = await readStore()
  const notification: Notification = {
    id: 'notif-' + Math.floor(1000 + Math.random() * 9000),
    bookingId,
    type,
    message,
    isRead: false,
    createdAt: new Date().toISOString(),
  }
  store.notifications.unshift(notification)
  await writeStore(store)
  return notification
}

export async function markServerNotificationRead(id: string): Promise<void> {
  const store = await readStore()
  const idx = store.notifications.findIndex((n) => n.id === id)
  if (idx >= 0) {
    store.notifications[idx].isRead = true
    await writeStore(store)
  }
}

export async function markServerNotificationIdsRead(ids: string[]): Promise<void> {
  const store = await readStore()
  const readIds = new Set(ids)
  let changed = false
  for (const notification of store.notifications) {
    if (readIds.has(notification.id) && !notification.isRead) {
      notification.isRead = true
      changed = true
    }
  }
  if (changed) await writeStore(store)
}

export async function markServerNotificationsReadForBooking(bookingId: string): Promise<number> {
  const store = await readStore()
  let count = 0
  for (const notif of store.notifications) {
    if (notif.bookingId === bookingId && !notif.isRead) {
      notif.isRead = true
      count++
    }
  }
  if (count > 0) await writeStore(store)
  return count
}
