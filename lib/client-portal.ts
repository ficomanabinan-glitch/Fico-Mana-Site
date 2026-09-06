import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSiteUrl } from '@/lib/site-url'

const PORTAL_COOKIE = 'ficomana_portal_session'

function signingSecret() {
  const dedicated = process.env.PORTAL_SIGNING_SECRET?.trim()
  // Preserve signatures created before the dedicated secret was introduced.
  // Operators can rotate to PORTAL_SIGNING_SECRET later with a planned link migration.
  const secret = dedicated || process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret) throw new Error('Portal signing secret is not configured.')
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('Portal signing secret is too short.')
  }
  return secret
}

export function signPortalPublicId(publicId: string) {
  return createHmac('sha256', signingSecret()).update(`ficomana-portal:${publicId}`).digest('hex')
}

export function verifyPortalSignature(publicId: string, signature: string | null | undefined) {
  if (!signature) return false
  const expected = signPortalPublicId(publicId)
  const left = Buffer.from(expected)
  const right = Buffer.from(signature)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function portalUrl(publicId: string) {
  const signature = signPortalPublicId(publicId)
  return `${getSiteUrl()}/portal/${encodeURIComponent(publicId)}?sig=${encodeURIComponent(signature)}`
}

export function createPortalCookieValue(publicId: string) {
  return `${publicId}.${signPortalPublicId(publicId)}`
}

export function verifyPortalCookie(value: string | null | undefined, publicId: string) {
  if (!value) return false
  const splitAt = value.lastIndexOf('.')
  if (splitAt <= 0) return false
  const cookiePublicId = value.slice(0, splitAt)
  const signature = value.slice(splitAt + 1)
  return cookiePublicId === publicId && verifyPortalSignature(publicId, signature)
}

export const PORTAL_SESSION_COOKIE = PORTAL_COOKIE
