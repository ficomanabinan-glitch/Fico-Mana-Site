import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('public booking creation has device and aggregate abuse limits', async () => {
  const [policy, middleware] = await Promise.all([
    readFile('lib/security/api-rate-limit.ts', 'utf8'),
    readFile('lib/supabase/middleware.ts', 'utf8'),
  ])

  assert.match(policy, /bookingCreate:\s*\{[^}]*limit:\s*10[^}]*aggregateLimit:\s*30[^}]*windowSeconds:\s*60\s*\*\s*60/)
  assert.match(middleware, /resolveBookingDeviceCookie/)
  assert.match(middleware, /p_limit:\s*INQUIRY_LIMIT/)
  assert.match(middleware, /p_window_seconds:\s*INQUIRY_WINDOW_SECONDS/)
  assert.match(middleware, /device has reached the limit of 10 reservation attempts per hour/)
})

test('isolated production-build QA bypass is restricted to loopback hosts', async () => {
  const middleware = await readFile('lib/supabase/middleware.ts', 'utf8')
  assert.match(middleware, /QA_ISOLATED_LOCAL === 'true'/)
  assert.match(middleware, /\['127\.0\.0\.1', 'localhost'\]\.includes\(request\.nextUrl\.hostname\)/)
  assert.doesNotMatch(middleware, /hostname\.(?:endsWith|startsWith)|host\.includes/)
})
