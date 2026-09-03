/**
 * Delete a single booking (and its notifications/receipts/email logs/payments)
 * from Supabase and the local JSON store.
 *
 * Usage: node scripts/delete-booking.mjs FM-370090
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const bookingId = process.argv[2]
if (!bookingId) {
  console.error('Usage: node scripts/delete-booking.mjs <BOOKING_ID>')
  process.exit(1)
}

// Load .env.local manually (no dotenv dependency)
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Delete children first in case FK cascade is not set up
for (const table of ['email_logs', 'notifications', 'receipts', 'payments']) {
  const { error } = await supabase.from(table).delete().eq('booking_id', bookingId)
  if (error) console.warn(`  ${table}: ${error.message}`)
  else console.log(`  ${table}: cleared for ${bookingId}`)
}

const { data, error } = await supabase.from('bookings').delete().eq('id', bookingId).select('id')
if (error) {
  console.error(`  bookings: FAILED — ${error.message}`)
  process.exit(1)
}
console.log(data?.length ? `  bookings: deleted ${bookingId}` : `  bookings: ${bookingId} not found in Supabase`)

// Clear from local JSON store too
const storePath = resolve(process.cwd(), 'data/ficomana-store.json')
if (existsSync(storePath)) {
  const store = JSON.parse(readFileSync(storePath, 'utf8'))
  const before = store.bookings.length
  store.bookings = store.bookings.filter((b) => b.id !== bookingId)
  store.notifications = (store.notifications || []).filter((n) => n.bookingId !== bookingId)
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`)
  console.log(`  local store: removed ${before - store.bookings.length} booking(s)`)
}

console.log('\nDone.')
