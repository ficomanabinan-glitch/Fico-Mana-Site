import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const { isLoginRateLimitEnabled, loginRateLimitPolicy } = loadTs<typeof import('../lib/auth/login-rate-limit.ts')>(
  'lib/auth/login-rate-limit.ts',
  { '@/lib/supabase/admin': { getSupabaseAdmin: () => null } },
)

test('the 15-minute login limiter is retained behind a reversible server-only switch', () => {
  const original = process.env.ADMIN_LOGIN_RATE_LIMIT_ENABLED
  try {
    delete process.env.ADMIN_LOGIN_RATE_LIMIT_ENABLED
    assert.equal(isLoginRateLimitEnabled(), false)
    process.env.ADMIN_LOGIN_RATE_LIMIT_ENABLED = 'false'
    assert.equal(isLoginRateLimitEnabled(), false)
    process.env.ADMIN_LOGIN_RATE_LIMIT_ENABLED = 'true'
    assert.equal(isLoginRateLimitEnabled(), true)
    assert.deepEqual(loginRateLimitPolicy, { limit: 5, windowSeconds: 15 * 60 })
  } finally {
    if (original === undefined) delete process.env.ADMIN_LOGIN_RATE_LIMIT_ENABLED
    else process.env.ADMIN_LOGIN_RATE_LIMIT_ENABLED = original
  }
})

test('master-admin provisioning keeps the shared password server-only and grants all five accounts owner access', () => {
  const source = readFileSync('scripts/provision-master-admins.mjs', 'utf8')
  for (let index = 1; index <= 5; index += 1) {
    assert.match(source, new RegExp(`master${index}\\@ficomana\\.com`))
  }
  assert.match(source, /process\.env\.MASTER_ADMIN_SHARED_PASSWORD/)
  assert.match(source, /role: 'owner'/)
  assert.match(source, /roles: \['owner', 'admin'\]/)
  assert.match(source, /workspace_members/)
  assert.doesNotMatch(source, /NEXT_PUBLIC_MASTER_ADMIN|console\.log\([^\n]*password/)
})
