import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server.js'
import { z } from 'zod'
import { loadTs } from './helpers/load-ts.ts'
import * as hosts from '../lib/auth/admin.ts'

const endpoint = 'https://editor.ficomana.com/api/storage/settings'

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

test('editor-host storage settings GET and PUT reach their API rather than a page alias', async () => {
  for (const method of ['GET', 'PUT']) {
    const response = await middleware().updateSession(new NextRequest(endpoint, {
      method, headers: { host: 'editor.ficomana.com' },
    }))
    assert.equal(response.headers.get('location'), null)
    assert.equal(response.headers.get('x-middleware-next'), '1')
  }
})

test('storage settings exception does not broaden editor-host access to other storage APIs', async () => {
  for (const path of ['/api/storage', '/api/storage/settings/extra', '/api/storage/delete']) {
    const response = await middleware().updateSession(new NextRequest(`https://editor.ficomana.com${path}`, {
      headers: { host: 'editor.ficomana.com' },
    }))
    assert.equal(response.status, 307)
    assert.equal(new URL(response.headers.get('location')!).pathname, `/editor${path}`)
  }
})

function settingsRoute(options: { authenticated?: boolean; administrator?: boolean; writeError?: boolean } = {}) {
  const writes: unknown[] = []
  const route = loadTs<typeof import('../app/api/storage/settings/route.ts')>('app/api/storage/settings/route.ts', {
    'next/server': { NextResponse }, zod: { z },
    '@/lib/auth-api': { requireStaffAuth: async () => options.authenticated === false
      ? { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
      : { user: { id: 'owner' }, error: null } },
    '@/lib/auth/workflow': {
      getWorkflowAccess: async () => ({ workspaceId: 'studio' }),
      canUseWorkflow: (_access: unknown, capability: string) => capability === 'admin' && options.administrator !== false,
    },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => ({ from: (table: string) => {
      assert.equal(table, 'storage_settings')
      return { upsert: async (value: unknown) => {
        writes.push(value)
        return { error: options.writeError ? { message: 'private database detail' } : null }
      } }
    } }) },
    '@/lib/security/request-security': { privateNoStoreHeaders: () => ({ 'Cache-Control': 'private, no-store' }) },
    '@/lib/storage/r2-client': { isR2Configured: () => true },
  })
  return { route, writes }
}

function put(value: unknown) {
  return new Request(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
}

async function savedResponse(fixture: ReturnType<typeof settingsRoute>, value: unknown) {
  const response = await fixture.route.PUT(put(value))
  assert.ok(response, 'The settings handler must return a response')
  return response
}

test('authorized administrator saves the expiry through the unchanged protected handler', async () => {
  const fixture = settingsRoute()
  const response = await savedResponse(fixture, { portalExpiryDays: 45 })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, portalExpiryDays: 45 })
  assert.equal(fixture.writes.length, 1)
  assert.equal((fixture.writes[0] as { portal_expiry_days: number }).portal_expiry_days, 45)
  assert.match(response.headers.get('cache-control') || '', /private.*no-store/)
})

test('editor and unauthenticated callers cannot write storage settings after the routing repair', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ administrator: false }, 403]] as const) {
    const fixture = settingsRoute(options)
    assert.equal((await savedResponse(fixture, { portalExpiryDays: 45 })).status, status)
    assert.equal(fixture.writes.length, 0)
  }
})

test('invalid expiry values and extra fields are rejected without database writes', async () => {
  for (const value of [0, 3651, 1.5, '45', null]) {
    const fixture = settingsRoute()
    assert.equal((await savedResponse(fixture, { portalExpiryDays: value })).status, 400)
    assert.equal(fixture.writes.length, 0)
  }
  const fixture = settingsRoute()
  assert.equal((await savedResponse(fixture, { portalExpiryDays: 45, workspaceId: 'another' })).status, 400)
  assert.equal(fixture.writes.length, 0)
})

test('database write errors are not reported as successful saves or leaked to clients', async () => {
  const fixture = settingsRoute({ writeError: true })
  const response = await savedResponse(fixture, { portalExpiryDays: 45 })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'Storage settings could not be saved.' })
})
