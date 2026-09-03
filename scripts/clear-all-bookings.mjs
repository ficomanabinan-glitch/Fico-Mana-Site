/**
 * Clear local transactional data for client handoff.
 * Supabase must be cleared manually in the SQL Editor (see output below).
 *
 * Usage: node scripts/clear-all-bookings.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

function clearLocalJson(relativePath, value) {
  const filePath = resolve(process.cwd(), relativePath)
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
  console.log(`  ${relativePath}: cleared`)
}

const MANUAL_SUPABASE_SQL = `
-- Run in Supabase Dashboard → SQL Editor
DELETE FROM email_logs;
DELETE FROM notifications;
DELETE FROM receipts;
DELETE FROM payments;
DELETE FROM bookings;
DELETE FROM blocked_slots;
DELETE FROM fico_spot_blocks;
DELETE FROM blocked_days;

-- Optional: clear uploaded receipt files
-- Storage → receipts bucket → delete all files
`.trim()

console.log('IMPORTANT: Stop the dev server (pnpm dev) before clearing Supabase.')
console.log('The admin console auto-syncs every 8s and the old code re-inserted')
console.log('bookings from data/ficomana-store.json after a TRUNCATE.\n')

console.log('Clearing local JSON (prevents stale cache)…')
clearLocalJson('data/ficomana-store.json', { bookings: [], notifications: [] })
clearLocalJson('data/email-logs.json', [])
clearLocalJson('data/blocked-slots.json', [])
clearLocalJson('data/fico-spot-blocks.json', [])

console.log('\nLocal data cleared.')
console.log('Supabase was NOT touched by this script.')
console.log('\nClear Supabase manually:\n')
console.log(MANUAL_SUPABASE_SQL)
console.log('\nKept: packages catalog, staff auth accounts')
