import assert from 'node:assert/strict'
import test from 'node:test'
import { access, readFile } from 'node:fs/promises'

test('staff sign-in and protected routes no longer require or route through MFA', async () => {
  const [auth, middleware, action, adminLayout, newAdminLayout, config] = await Promise.all([
    readFile('lib/auth-api.ts', 'utf8'),
    readFile('lib/supabase/middleware.ts', 'utf8'),
    readFile('app/admin/actions.ts', 'utf8'),
    readFile('app/admin/layout.tsx', 'utf8'),
    readFile('app/newadmin/layout.tsx', 'utf8'),
    readFile('supabase/config.toml', 'utf8'),
  ])
  for (const source of [auth, middleware, action, adminLayout, newAdminLayout]) {
    assert.doesNotMatch(source, /getAuthenticatorAssuranceLevel|MFA_REQUIRED|\/admin\/mfa|aal2/i)
  }
  assert.match(config, /\[auth\.mfa\.totp\][\s\S]*enroll_enabled = false[\s\S]*verify_enabled = false/)
  await assert.rejects(access('app/admin/mfa/page.tsx'))
  await assert.rejects(access('app/api/security/mfa-event/route.ts'))
})
