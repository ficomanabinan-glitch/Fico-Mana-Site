import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ADMIN_BACKGROUND_SYNC_MIN_MS,
  ADMIN_QUERY_GC_MS,
  ADMIN_QUERY_STALE_MS,
} from '../lib/admin-cache-policy.ts'

test('admin query policy keeps recently visited data warm', () => {
  assert.equal(ADMIN_QUERY_STALE_MS, 5 * 60_000)
  assert.equal(ADMIN_QUERY_GC_MS, 60 * 60_000)
  assert.equal(ADMIN_BACKGROUND_SYNC_MIN_MS, 15_000)
})

test('bookings and notifications revalidate cached snapshots without blocking navigation', () => {
  const source = readFileSync('lib/data-store.ts', 'utf8')
  assert.match(source, /hasCachedValue\(BOOKINGS_KEY\)/)
  assert.match(source, /void fetchBookingsFresh\(true\)/)
  assert.match(source, /hasCachedValue\(NOTIFS_KEY\)/)
  assert.match(source, /void fetchNotificationsFresh\(true\)/)
})

test('editor invalidation preserves stale data except on an authentication boundary', () => {
  const editor = readFileSync('lib/editor-read-cache.ts', 'utf8')
  const session = readFileSync('lib/staff-cache-session.ts', 'utf8')
  assert.match(editor, /invalidateEditorBatchCache\(preserveUi = false, discardData = false\)/)
  assert.match(editor, /if \(discardData\) batchCache = null/)
  assert.match(session, /invalidateEditorBatchCache\(false, true\)/)
})
