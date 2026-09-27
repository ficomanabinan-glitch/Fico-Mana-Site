import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server.js'
import { loadTs } from './helpers/load-ts.ts'
import * as hosts from '../lib/auth/admin.ts'

function middleware() {
  return loadTs<typeof import('../lib/supabase/middleware.ts')>('lib/supabase/middleware.ts', {
    'next/server': { NextResponse },
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) },
    '@/lib/auth/admin': hosts,
    '@/lib/supabase/env': { getSupabaseUrl: () => 'https://example.test', getSupabaseKey: () => 'test' },
    '@/lib/new-admin/routing': { isNewAdminHost: () => false, newAdminAlias: () => null },
    '@/lib/inquiry-rate-limit': {},
  })
}

test('editor queue requests reach the API without an /editor/api redirect', async () => {
  for (let iteration = 0; iteration < 10; iteration++) {
    for (const method of ['GET', 'PATCH']) {
      const response = await middleware().updateSession(new NextRequest('https://editor.ficomana.com/api/bookings/client-priorities', {
        method, headers: { host: 'editor.ficomana.com' },
      }))
      assert.equal(response.headers.get('location'), null)
      assert.equal(response.headers.get('x-middleware-next'), '1')
    }
  }
})

test('editor aliases still redirect non-API pages and do not expose other booking APIs', async () => {
  for (const path of ['/files', '/api/bookings']) {
    const response = await middleware().updateSession(new NextRequest(`https://editor.ficomana.com${path}`, { headers: { host: 'editor.ficomana.com' } }))
    assert.equal(response.status, 307)
    assert.equal(new URL(response.headers.get('location')!).pathname, `/editor${path}`)
  }
})

function queueRoute(allowed = true) {
  let reads = 0
  let workspace = ''
  let capability = ''
  const rows = [
    { id: 'my-booking', workspace_id: 'studio', booking_date: '2026-09-27', client_priority: 2 },
    { id: 'other-booking', workspace_id: 'another', booking_date: '2026-09-27', client_priority: 1 },
  ]
  const query = {
    select: () => query, not: () => query, order: () => query,
    eq: (key: string, value: string) => { assert.equal(key, 'workspace_id'); workspace = value; return query },
    range: async () => { reads++; return { data: rows.filter(row => !workspace || row.workspace_id === workspace), error: null } },
  }
  const route = loadTs<typeof import('../app/api/bookings/client-priorities/route.ts')>('app/api/bookings/client-priorities/route.ts', {
    'next/server': { NextResponse },
    '@/lib/auth-api': {
      requireStaffAuth: async () => ({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }),
      requireWorkflowAuth: async (requested: string) => {
        capability = requested
        return allowed ? { access: { workspaceId: 'studio' }, error: null } : { access: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
      },
    },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ from: () => query }) },
    '@/lib/security/error-response': {},
  })
  return { route, state: () => ({ reads, workspace, capability }) }
}

test('authorized editors can read queue positions only within their workspace', async () => {
  const fixture = queueRoute()
  const response = await fixture.route.GET(new Request('https://editor.ficomana.com/api/bookings/client-priorities'))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [{ bookingId: 'my-booking', bookingDate: '2026-09-27', clientPriority: 2 }])
  assert.deepEqual(fixture.state(), { reads: 1, workspace: 'studio', capability: 'edit' })
  assert.match(response.headers.get('cache-control') || '', /private.*no-store/)
})

test('queue reads reject unauthorized roles before accessing any booking records', async () => {
  const fixture = queueRoute(false)
  assert.equal((await fixture.route.GET(new Request('https://editor.ficomana.com/api/bookings/client-priorities'))).status, 403)
  assert.equal(fixture.state().reads, 0)
})

test('queue mutations remain administrator-only for editor accounts', async () => {
  const fixture = queueRoute()
  assert.equal((await fixture.route.PATCH(new Request('https://editor.ficomana.com/api/bookings/client-priorities', { method: 'PATCH' }))).status, 401)
  assert.equal(fixture.state().reads, 0)
})
