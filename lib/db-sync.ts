import type { SupabaseClient } from '@supabase/supabase-js'
import type { Booking } from '@/lib/data-store'
import { listBookings } from '@/lib/server-store'
import { listBookingsFromDb, syncPackagesToDb } from '@/lib/supabase-store'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export type DbSyncResult = {
  ok: boolean
  bookingsPushed: number
  bookingsUpdated: number
  notificationsPushed: number
  packagesSynced: boolean
  message?: string
}

/** Sync package catalog only — Supabase is the source of truth for bookings. */
export async function syncStoreToDatabase(client?: SupabaseClient | null): Promise<DbSyncResult> {
  const empty: DbSyncResult = {
    ok: false,
    bookingsPushed: 0,
    bookingsUpdated: 0,
    notificationsPushed: 0,
    packagesSynced: false,
  }

  if (!isSupabaseConfigured()) {
    return { ...empty, ok: true, message: 'Supabase not configured — file store only.' }
  }

  const db = client ?? getSupabaseAdmin()
  if (!db) {
    return { ...empty, message: 'SUPABASE_SERVICE_ROLE_KEY required for automatic DB sync.' }
  }

  const packagesSynced = await syncPackagesToDb(db)

  return {
    ok: true,
    bookingsPushed: 0,
    bookingsUpdated: 0,
    notificationsPushed: 0,
    packagesSynced,
    message: packagesSynced ? 'Package catalog synced.' : 'Database is up to date.',
  }
}

/** Load bookings — Supabase is source of truth when configured. */
export async function loadSyncedBookings(client?: SupabaseClient | null): Promise<Booking[]> {
  if (!isSupabaseConfigured()) {
    return listBookings()
  }

  const db = client ?? getSupabaseAdmin()
  if (!db) {
    return []
  }

  return (await listBookingsFromDb(db)) ?? []
}
