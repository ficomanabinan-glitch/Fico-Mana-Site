import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

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
      },
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

test('system notification writes persist a null booking reference', async () => {
  let payload: Record<string, unknown> | undefined
  const db = loadTs<typeof import('../lib/supabase-store.ts')>('lib/supabase-store.ts', {
    '@/lib/booking-db': {},
    '@/lib/packages-seed': { PACKAGE_SEED_ROWS: [] },
    '@/lib/package-seed-sync': {},
    '@/lib/supabase/env': { isSupabaseConfigured: () => true },
  })
  const row = { id: '19d887f5-4c22-4aca-8490-e240c5a701c3', message: 'Synthetic reminder' }
  const client = { from() { return { upsert(value: Record<string, unknown>) {
    payload = value
    return Promise.resolve({ error: null })
  } } } }

  const saved = await db.addSystemNotificationToDb(client as never, row.id, 'OPS_REMINDER', row.message)
  assert.equal(payload?.booking_id, null)
  assert.equal(saved?.bookingId, '')
})
