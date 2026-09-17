import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

test('provisioning reads only displayed status fields and keeps responses private', async () => {
  const projections = new Map<string, string>()
  let failedTable = ''
  const admin = { from(table: string) {
    const result = { data: table === 'storage_settings' ? {} : [], error: table === failedTable ? { message: 'Database unavailable' } : null }
    const query = {
      select(fields: string) { projections.set(table, fields); return query },
      in() { return query }, order() { return query }, eq() { return query }, maybeSingle() { return query },
      then(resolve: (value: typeof result) => unknown) { return Promise.resolve(result).then(resolve) },
    }
    return query
  } }
  const route = loadTs<{ GET: () => Promise<Response> }>('app/api/provisioning/route.ts', {
    'next/server': { NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) } },
    '@/lib/auth-api': { requireWorkflowAuth: async () => ({ access: { workspaceId: 'workspace-1' }, error: null }) },
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin },
    '@/lib/portal-expiry': { hasPortalExpired: () => false },
    '@/lib/security/error-response': { secureErrorResponse: () => Response.json({ error: 'Could not load provisioning overview.' }, { status: 503 }) },
    '@/lib/package-workflow-server': { graduationPackageIds: async () => ['graduation'] },
    '@/lib/storage/r2-client': { isR2Configured: () => true },
  })
  const successful = await route.GET()
  assert.equal(successful.status, 200)
  assert.equal(successful.headers.get('cache-control'), 'private, no-store')
  assert.equal(projections.get('booking_provisioning')?.includes('*'), false)
  for (const table of ['booking_provisioning', 'client_portals', 'storage_settings']) {
    failedTable = table
    const failed = await route.GET()
    assert.equal(failed.status, 503, `${table} failure cannot become a successful empty overview`)
  }
})
