import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getSiteUrl } from '@/lib/site-url'
import { GOOGLE_DRIVE_SCOPES } from '@/lib/google-drive-scopes'

// Fico Mana creates and updates only app-managed files through drive.file.
// Read-only Drive access is also required so staff can add photos directly in
// Google Drive and then index those files into the private client gallery.
const PROFILE_SCOPES = ['openid', 'email']

function env(name: string) {
  return process.env[name]?.trim() || ''
}

function encryptionKey() {
  const dedicated = env('GOOGLE_TOKEN_ENCRYPTION_KEY')
  // Keep existing refresh tokens decryptable until they can be deliberately
  // re-encrypted with a dedicated key during a planned Drive reconnection.
  const material = dedicated || env('PORTAL_SIGNING_SECRET') || env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
  if (!material) throw new Error('Server encryption key is unavailable.')
  if (process.env.NODE_ENV === 'production' && material.length < 32) {
    throw new Error('Google token encryption key is too short.')
  }
  return createHash('sha256').update(`ficomana-google-drive:${material}`).digest()
}

function stateKey() {
  const dedicated = env('GOOGLE_OAUTH_STATE_SECRET')
  const material = process.env.NODE_ENV === 'production'
    ? dedicated
    : dedicated || env('PORTAL_SIGNING_SECRET') || env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
  if (!material) throw new Error('OAuth state signing secret is unavailable.')
  if (process.env.NODE_ENV === 'production' && material.length < 32) {
    throw new Error('OAuth state signing secret is too short.')
  }
  return createHash('sha256').update(`ficomana-google-oauth-state:${material}`).digest()
}

export function googleOAuthAppConfigured() {
  return Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'))
}

export function googleOAuthSiteUrl() {
  if (process.env.NODE_ENV !== 'production') return getSiteUrl()

  const adminHostname = env('ADMIN_HOSTNAME') || 'admin.ficomana.com'
  return new URL(`https://${adminHostname}`).origin
}

export function googleOAuthRedirectUri() {
  return `${googleOAuthSiteUrl()}/api/integrations/google-drive/callback`
}

export function encryptGoogleRefreshToken(token: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptGoogleRefreshToken(value: string) {
  const [version, ivPart, tagPart, encryptedPart] = value.split('.')
  if (version !== 'v1' || !ivPart || !tagPart || !encryptedPart) throw new Error('Stored Google token is invalid.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

type OAuthState = { exp: number; nonce: string; returnTo: string }

export function createGoogleOAuthState(returnTo = '/admin/provisioning') {
  const payload: OAuthState = {
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    nonce: randomBytes(16).toString('base64url'),
    returnTo: returnTo.startsWith('/admin/') ? returnTo : '/admin/provisioning',
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', stateKey()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyGoogleOAuthState(value: string | null | undefined): OAuthState | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const encoded = value.slice(0, dot)
  const signature = value.slice(dot + 1)
  const expected = createHmac('sha256', stateKey()).update(encoded).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthState
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.returnTo?.startsWith('/admin/')) return null
    return payload
  } catch {
    return null
  }
}

export function buildGoogleAuthorizationUrl(loginHint?: string) {
  const clientId = env('GOOGLE_CLIENT_ID')
  if (!clientId || !env('GOOGLE_CLIENT_SECRET')) {
    throw new Error('Google OAuth app credentials are not configured on the server.')
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleOAuthRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    scope: [...PROFILE_SCOPES, ...GOOGLE_DRIVE_SCOPES].join(' '),
    state: createGoogleOAuthState(),
  })
  if (loginHint?.trim()) params.set('login_hint', loginHint.trim())
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleAuthorizationCode(code: string) {
  const clientId = env('GOOGLE_CLIENT_ID')
  const clientSecret = env('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Google OAuth app credentials are not configured.')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleOAuthRedirectUri(),
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  })
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    scope?: string
    error_description?: string
  }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Google OAuth connection failed.')
  if (!data.refresh_token) throw new Error('Google did not return an offline refresh token. Reconnect and approve Drive access.')

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
    cache: 'no-store',
  })
  const profile = (await profileResponse.json().catch(() => ({}))) as { email?: string; sub?: string }
  if (!profileResponse.ok || !profile.email) throw new Error('Could not read the connected Google account email.')

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scopes: data.scope || [...PROFILE_SCOPES, ...GOOGLE_DRIVE_SCOPES].join(' '),
    email: profile.email,
    subject: profile.sub || null,
  }
}

export function googleOAuthClientCredentials() {
  const clientId = env('GOOGLE_CLIENT_ID')
  const clientSecret = env('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Google OAuth app credentials are not configured.')
  return { clientId, clientSecret }
}
