/**
 * Backfill slot_id (+ normalized booking_time) for MANA bookings so client
 * reservations occupy calendar capacity and prevent double booking.
 *
 * Usage: node scripts/backfill-slot-ids.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'module'

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
  console.error('Missing Supabase env in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Dynamic import of compiled helpers is awkward for .ts in plain node.
// Duplicate the minimal mapping inline to keep the script standalone.

const MAKEUP_PACKAGES = new Set(['mana-makeup', 'creative-package', 'creative-package-makeup'])

const SESSIONS = [
  { id: '0800-0930', label: '8:00 AM - 9:30 AM', start: 8 * 60, end: 9 * 60 + 30, arrival: '7:45 AM', shoot: '8:00 AM', endLabel: '9:30 AM' },
  { id: '0930-1100', label: '9:30 AM - 11:00 AM', start: 9 * 60 + 30, end: 11 * 60, arrival: '9:15 AM', shoot: '9:30 AM', endLabel: '11:00 AM' },
  { id: '1100-1230', label: '11:00 AM - 12:30 PM', start: 11 * 60, end: 12 * 60 + 30, arrival: '10:45 AM', shoot: '11:00 AM', endLabel: '12:30 PM' },
  { id: '1330-1500', label: '1:30 PM - 3:00 PM', start: 13 * 60 + 30, end: 15 * 60, arrival: '1:15 PM', shoot: '1:30 PM', endLabel: '3:00 PM' },
  { id: '1500-1630', label: '3:00 PM - 4:30 PM', start: 15 * 60, end: 16 * 60 + 30, arrival: '2:45 PM', shoot: '3:00 PM', endLabel: '4:30 PM' },
]

const LEGACY = {
  'm-08-10-s1': 'm-0800-0930-s1',
  'm-08-10-s2': 'm-0800-0930-s2',
  'm-10-12-s1': 'm-0930-1100-s1',
  'm-10-12-s2': 'm-0930-1100-s2',
  'm-13-15-s1': 'm-1330-1500-s1',
  'm-13-15-s2': 'm-1330-1500-s2',
  'm-15-17-s1': 'm-1500-1630-s1',
  'm-15-17-s2': 'm-1500-1630-s2',
}

const VALID = new Set(SESSIONS.flatMap((s) => [`m-${s.id}-s1`, `m-${s.id}-s2`]))
const BOOKINGS_PER_SLOT = 1

function parseMinutes(value) {
  const text = String(value || '').trim()
  const ampm = text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i)
  if (ampm) {
    let hour = parseInt(ampm[1], 10)
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0
    const period = ampm[3].toUpperCase()
    if (period === 'PM' && hour < 12) hour += 12
    if (period === 'AM' && hour === 12) hour = 0
    return hour * 60 + min
  }
  return null
}

function findSession(timeText) {
  const minutes = parseMinutes(timeText)
  if (minutes == null) return null
  for (const s of SESSIONS) {
    if (minutes >= s.start && minutes < s.end) return s
  }
  for (let i = 0; i < SESSIONS.length; i++) {
    if (minutes === SESSIONS[i].end && SESSIONS[i + 1]) return SESSIONS[i + 1]
  }
  let best = null
  let bestDist = Infinity
  for (const s of SESSIONS) {
    const dist = Math.abs(minutes - s.start)
    if (dist < bestDist) {
      bestDist = dist
      best = s
    }
  }
  return bestDist <= 90 ? best : null
}

function isActive(status) {
  return status !== 'Cancelled' && status !== 'Rejected'
}

async function main() {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, package_id, booking_date, booking_time, slot_id, booking_status, arrival_time, shoot_time')
    .order('booking_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  const mana = (data || []).filter((b) => MAKEUP_PACKAGES.has(b.package_id) && isActive(b.booking_status))
  console.log(`Active MANA-type bookings: ${mana.length}\n`)

  // Live fill counts while assigning (so Slot 1/2 balance)
  const fills = new Map() // key: date|slotId -> count

  // Seed fills from rows that already have valid slot ids
  for (const b of mana) {
    let slotId = b.slot_id
    if (slotId && LEGACY[slotId]) slotId = LEGACY[slotId]
    if (slotId && VALID.has(slotId)) {
      const key = `${b.booking_date}|${slotId}`
      fills.set(key, (fills.get(key) || 0) + 1)
    }
  }

  let updated = 0
  let skipped = 0

  for (const b of mana) {
    let slotId = b.slot_id
    if (slotId && LEGACY[slotId]) slotId = LEGACY[slotId]

    if (slotId && VALID.has(slotId)) {
      // Already valid — still normalize booking_time label if needed
      const session = SESSIONS.find((s) => slotId.startsWith(`m-${s.id}-`))
      const slotNum = slotId.endsWith('-s2') ? 2 : 1
      const formatted = session ? `${session.label} · SLOT ${slotNum}` : b.booking_time
      if (b.booking_time === formatted && b.slot_id === slotId) {
        skipped++
        continue
      }
      const patch = {
        slot_id: slotId,
        booking_time: formatted,
        arrival_time: session?.arrival ?? b.arrival_time,
        shoot_time: session ? `${session.shoot} - ${session.endLabel}` : b.shoot_time,
      }
      const { error: upErr } = await supabase.from('bookings').update(patch).eq('id', b.id)
      if (upErr) {
        console.error(`  ✗ ${b.id}: ${upErr.message}`)
      } else {
        console.log(`  ✓ ${b.id} normalize ${slotId}`)
        updated++
      }
      continue
    }

    const session = findSession(b.booking_time)
    if (!session) {
      console.log(`  ? ${b.id} — cannot map time "${b.booking_time}"`)
      skipped++
      continue
    }

    // Choose least-filled slot for that date/session
    let chosen = null
    let bestCount = Infinity
    for (const num of [1, 2]) {
      const id = `m-${session.id}-s${num}`
      const key = `${b.booking_date}|${id}`
      const count = fills.get(key) || 0
      if (count >= BOOKINGS_PER_SLOT) continue
      if (count < bestCount) {
        bestCount = count
        chosen = { id, num }
      }
    }

    if (!chosen) {
      console.log(`  ! ${b.id} — ${session.label} already full on ${b.booking_date}`)
      skipped++
      continue
    }

    const patch = {
      slot_id: chosen.id,
      booking_time: `${session.label} · SLOT ${chosen.num}`,
      arrival_time: session.arrival,
      shoot_time: `${session.shoot} - ${session.endLabel}`,
    }

    const { error: upErr } = await supabase.from('bookings').update(patch).eq('id', b.id)
    if (upErr) {
      console.error(`  ✗ ${b.id}: ${upErr.message}`)
      skipped++
    } else {
      const key = `${b.booking_date}|${chosen.id}`
      fills.set(key, (fills.get(key) || 0) + 1)
      console.log(`  ✓ ${b.id} ${b.booking_date} "${b.booking_time}" → ${chosen.id}`)
      updated++
    }
  }

  console.log(`\nUpdated: ${updated} · Skipped: ${skipped}`)
}

main().catch(console.error)
