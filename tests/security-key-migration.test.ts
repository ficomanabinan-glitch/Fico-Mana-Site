import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const site = { getSiteUrl: () => 'https://example.test' }
const google = loadTs<typeof import('../lib/google-oauth.ts')>('lib/google-oauth.ts', {
  '@/lib/site-url': site,
  '@/lib/google-drive-scopes': { GOOGLE_DRIVE_SCOPES: [] },
})
const portal = loadTs<typeof import('../lib/client-portal.ts')>('lib/client-portal.ts', { '@/lib/site-url': site })

function withProductionKeys(run: () => void) {
  const names = ['NODE_ENV', 'GOOGLE_TOKEN_ENCRYPTION_KEY', 'PORTAL_SIGNING_SECRET', 'GOOGLE_OAUTH_STATE_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']
  const previous = names.map(name => process.env[name])
  try {
    Object.assign(process.env, { NODE_ENV: 'production' })
    for (const name of names.slice(1)) process.env[name] = randomBytes(32).toString('base64url')
    run()
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]
      else process.env[name] = previous[index]
    })
  }
}

test('dedicated Drive key round-trips tokens, rejects tampering and rejects a previous key', () => withProductionKeys(() => {
  const encrypted = google.encryptGoogleRefreshToken('synthetic-refresh-token')
  assert.equal(google.decryptGoogleRefreshToken(encrypted), 'synthetic-refresh-token')
  assert.notEqual(encrypted, google.encryptGoogleRefreshToken('synthetic-refresh-token'))
  const parts = encrypted.split('.')
  const ciphertext = Buffer.from(parts[3], 'base64url')
  ciphertext[0] ^= 1
  parts[3] = ciphertext.toString('base64url')
  assert.throws(() => google.decryptGoogleRefreshToken(parts.join('.')))
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64url')
  assert.throws(() => google.decryptGoogleRefreshToken(encrypted))
}))

test('production signing and encryption never silently fall back to a service credential', () => withProductionKeys(() => {
  delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  assert.throws(() => google.encryptGoogleRefreshToken('synthetic'), /setup is incomplete/)
  delete process.env.PORTAL_SIGNING_SECRET
  assert.throws(() => portal.signPortalPublicId('synthetic-portal'), /not configured/)
}))

test('rotating the portal key invalidates old links and cookies while renewed ones verify', () => withProductionKeys(() => {
  const id = 'synthetic-portal'
  const signature = portal.signPortalPublicId(id)
  const cookie = portal.createPortalCookieValue(id)
  assert.equal(portal.verifyPortalSignature(id, signature), true)
  process.env.PORTAL_SIGNING_SECRET = randomBytes(32).toString('base64url')
  assert.equal(portal.verifyPortalSignature(id, signature), false)
  assert.equal(portal.verifyPortalCookie(cookie, id), false)
  const renewed = new URL(portal.portalUrl(id))
  assert.equal(portal.verifyPortalSignature(id, renewed.searchParams.get('sig')), true)
  assert.equal(portal.verifyPortalCookie(portal.createPortalCookieValue(id), id), true)
  assert.equal(portal.verifyPortalCookie(portal.createPortalCookieValue(id), 'other-portal'), false)
}))

test('Drive and portal key changes do not invalidate separately signed OAuth state', () => withProductionKeys(() => {
  const state = google.createGoogleOAuthState()
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64url')
  process.env.PORTAL_SIGNING_SECRET = randomBytes(32).toString('base64url')
  assert.equal(google.verifyGoogleOAuthState(state)?.returnTo, '/admin/provisioning')
  process.env.GOOGLE_OAUTH_STATE_SECRET = randomBytes(32).toString('base64url')
  assert.equal(google.verifyGoogleOAuthState(state), null)
}))
