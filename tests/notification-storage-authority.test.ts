import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'
import { getActiveEmailStorageReminder, opsNotificationId } from '../lib/ops-subscriptions.ts'

const nextResponse = {
  json(body: unknown, init?: ResponseInit) {
    return Response.json(body, init)
  },
}

test('booking notification dismissal never falls through to local files in production', async () => {
  let localCalls = 0
  const route = loadTs<typeof import('../app/api/notifications/dismiss/route.ts')>(
    'app/api/notifications/dismiss/route.ts',
    {
      'next/server': { NextResponse: nextResponse },
      '@/lib/auth-api': { requireStaffAuth: async () => ({ user: { id: 'staff' }, error: null }) },
      '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ online: true }) },
      '@/lib/supabase/env': { isSupabaseConfigured: () => true },
      '@/lib/supabase-store': { markBookingNotificationsReadInDb: async () => 2 },
      '@/lib/server-store': {
        markServerNotificationsReadForBooking: async () => {
          localCalls += 1
          throw new Error('local storage must not run')
        },
      },
    },
  )

  const response = await route.POST(new Request('https://admin.ficomana.com/api/notifications/dismiss', {
    method: 'POST',
    body: JSON.stringify({ bookingId: 'FM-132401' }),
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, dismissed: 2 })
  assert.equal(localCalls, 0)
})

test('an empty production notification table is authoritative and does not read local files', async () => {
  let localCalls = 0
  const route = loadTs<typeof import('../app/api/notifications/route.ts')>(
    'app/api/notifications/route.ts',
    {
      'next/server': { NextResponse: nextResponse },
      '@/lib/server-store': {
        listNotifications: async () => {
          localCalls += 1
          throw new Error('local storage must not run')
        },
        addServerNotification: async () => {
          localCalls += 1
          throw new Error('local storage must not run')
        },
      },
      '@/lib/auth-api': { requireStaffAuth: async () => ({ user: { id: 'staff' }, error: null }) },
      '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ online: true }) },
      '@/lib/supabase/env': { isSupabaseConfigured: () => true },
      '@/lib/supabase-store': {
        listNotificationsFromDb: async () => [],
        addNotificationToDb: async () => null,
        addSystemNotificationToDb: async () => null,
      },
      '@/lib/ops-subscriptions': { getActiveEmailStorageReminder: () => null },
      '@/lib/auth/workflow': { getWorkflowAccess: async () => null },
      '@/lib/shoot-reminder-settings': { canManageShootReminders: () => false },
      '@/lib/shoot-reminder-alerts': {
        getShootReminderHealth: async () => ({ available: false, issue: null }),
        notifyShootReminderIssue: async () => undefined,
      },
      '@/lib/shoot-reminder-issues': { SHOOT_REMINDER_NOTIFICATION_TYPE: 'SHOOT_REMINDER_ERROR' },
      '@/lib/security/request-security': { privateNoStoreHeaders: () => ({ 'Cache-Control': 'private, no-store' }) },
    },
  )

  const response = await route.GET()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [])
  assert.equal(localCalls, 0)
})

test('operations reminders use deterministic system IDs and no fake booking foreign key', () => {
  const reminder = getActiveEmailStorageReminder(new Date('2026-09-15T12:00:00+08:00'))
  assert.ok(reminder)
  assert.equal(reminder.id, opsNotificationId('2026-09', 'reminder'))
  assert.match(reminder.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.equal(reminder.bookingId, '')
})

test('system notification writes persist a null booking reference', async () => {
  let payload: Record<string, unknown> | undefined
  const db = loadTs<typeof import('../lib/supabase-store.ts')>('lib/supabase-store.ts', {
    '@/lib/booking-db': {},
    '@/lib/packages-seed': { PACKAGE_SEED_ROWS: [] },
    '@/lib/package-seed-sync': {},
    '@/lib/supabase/env': { isSupabaseConfigured: () => true },
  })
  const row = { id: opsNotificationId('2026-09', 'reminder'), message: 'Synthetic reminder' }
  const client = { from() { return { upsert(value: Record<string, unknown>) {
    payload = value
    return Promise.resolve({ error: null })
  } } } }

  const saved = await db.addSystemNotificationToDb(client as never, row.id, 'OPS_REMINDER', row.message)
  assert.equal(payload?.booking_id, null)
  assert.equal(saved?.bookingId, '')
})
