import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const port = 4100 + (process.pid % 1000)
const baseUrl = `http://127.0.0.1:${port}`
const nextBin = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url))
const child = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://127.0.0.1:1',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_runtime_check',
    SUPABASE_SECRET_KEY: 'sb_secret_runtime_check',
    PORTAL_SIGNING_SECRET: 'runtime-check-portal-signing-secret-00000000',
    SECURITY_HASH_SECRET: 'runtime-check-security-hash-secret-000000000',
    GOOGLE_CLIENT_ID: 'runtime-check.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'runtime-check-client-secret',
    GOOGLE_TOKEN_ENCRYPTION_KEY: '0000000000000000000000000000000000000000000000000000000000000000',
    GOOGLE_OAUTH_STATE_SECRET: 'runtime-check-google-oauth-state-secret-000000',
    GOOGLE_DRIVE_ALLOWED_EMAIL: 'runtime-check@example.com',
    RESEND_API_KEY: 're_runtime_check_not_a_real_key',
    NEXT_PUBLIC_STAGING_ADMIN_EMAIL: '',
    NEXT_PUBLIC_STAGING_ADMIN_PASSWORD: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before the HTTP checks started.\n${output}`)
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for the production server.\n${output}`)
}

function assertPrivateResponse(response, label) {
  assert.match(response.headers.get('cache-control') || '', /private.*no-store/i, `${label} must be private/no-store`)
  assert.equal(response.headers.get('access-control-allow-origin'), null, `${label} must not reflect CORS`)
  assert.ok(response.headers.get('x-request-id'), `${label} must include a request ID`)
}

try {
  await waitForServer()

  const home = await fetch(baseUrl)
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-security-policy') || '', /frame-ancestors 'none'/)
  assert.equal(home.headers.get('strict-transport-security'), 'max-age=63072000; includeSubDomains; preload')
  assert.equal(home.headers.get('x-frame-options'), 'DENY')
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(home.headers.get('x-xss-protection'), '0')

  const hostilePortalMutation = await fetch(`${baseUrl}/api/portal/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify({ publicId: 'not-authorized', signature: '0'.repeat(64) }),
  })
  assert.equal(hostilePortalMutation.status, 403)
  assertPrivateResponse(hostilePortalMutation, 'hostile portal mutation')

  const hostileAdminMutation = await fetch(`${baseUrl}/api/integrations/google-drive/disconnect`, {
    method: 'POST',
    headers: { origin: 'https://attacker.example' },
  })
  assert.equal(hostileAdminMutation.status, 403)
  assertPrivateResponse(hostileAdminMutation, 'hostile admin mutation')

  const hostileStorageCleanup = await fetch(`${baseUrl}/api/admin/shoot-storage`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify({ token: 'not-a-review', confirmation: 'DELETE SHOOT FILES' }),
  })
  assert.equal(hostileStorageCleanup.status, 403)
  assertPrivateResponse(hostileStorageCleanup, 'hostile storage cleanup')

  const anonymousStorageReview = await fetch(`${baseUrl}/api/admin/shoot-storage?range=all`)
  assert.equal(anonymousStorageReview.status, 401)
  assertPrivateResponse(anonymousStorageReview, 'anonymous storage review')

  for (const action of ['upload-session', 'complete-file']) {
    const endpoint = `${baseUrl}/api/editor-workflow/raw/FM-SYNTHETIC/${action}`
    const anonymous = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://admin.ficomana.com' }, body: '{}',
    })
    assert.equal(anonymous.status, 401)
    assertPrivateResponse(anonymous, `anonymous raw ${action}`)
    const hostile = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example' }, body: '{}',
    })
    assert.equal(hostile.status, 403)
    assertPrivateResponse(hostile, `hostile raw ${action}`)
  }
  assert.match(home.headers.get('content-security-policy') || '', /https:\/\/www\.googleapis\.com\/upload\/drive\/v3\//)

  console.log('Production HTTP security checks passed.')
} finally {
  child.kill()
}
