import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PORTAL_DEVICE_COOKIE, portalDeviceId, validPortalDeviceId } from '../lib/security/portal-device.ts'
import { loadTs } from './helpers/load-ts.ts'

test('portal device identity accepts only server-shaped UUIDs and keeps an IP fallback', () => {
  const id = '638f9fac-d56e-4abd-951a-c6e6d073527b'
  assert.equal(validPortalDeviceId(id), true)
  assert.equal(portalDeviceId(`other=1; ${PORTAL_DEVICE_COOKIE}=${id}; session=2`), id)
  assert.equal(portalDeviceId(`${PORTAL_DEVICE_COOKIE}=spoofed`), null)
  assert.equal(portalDeviceId(null), null)
  const proxy = readFileSync('proxy.ts', 'utf8')
  const limits = readFileSync('lib/security/api-rate-limit.ts', 'utf8')
  assert.match(proxy, /httpOnly:\s*true/)
  assert.match(proxy, /crypto\.randomUUID\(\)/)
  assert.match(limits, /portal-photo-read-aggregate|aggregateLimit:\s*1500/)
  assert.match(limits, /const principal = device \? `device:\$\{device\}` : `ip:\$\{requestClientIp\(request\)\}`/)
})

test('the portal page issues a private device cookie before photo requests begin', async () => {
  const written: Array<{ name: string; value: string; options: Record<string, unknown> }> = []
  const response = new Response(null, { headers: { 'x-middleware-next': '1' } }) as Response & { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } }
  response.cookies = { set: (name, value, options) => { written.push({ name, value, options }) } }
  const middleware = loadTs<typeof import('../proxy.ts')>('proxy.ts', {
    '@/lib/auth/admin': { isAdminHost: () => false, isEditorHost: () => false },
    '@/lib/new-admin/routing': { isNewAdminHost: () => false },
    '@/lib/public-page-policy': { isPrivatePagePath: () => true },
    '@/lib/supabase/middleware': { updateSession: async () => response },
  })
  const request = { method: 'GET', nextUrl: { pathname: '/portal/638f9fac-d56e-4abd-951a-c6e6d073527b' }, headers: new Headers(), cookies: { get: () => undefined } } as never
  await middleware.proxy(request)
  const issued = written[0]
  assert.ok(issued)
  assert.equal(issued.name, PORTAL_DEVICE_COOKIE)
  assert.equal(validPortalDeviceId(issued.value), true)
  assert.equal(issued.options.httpOnly, true)
  assert.equal(issued.options.sameSite, 'lax')
})
