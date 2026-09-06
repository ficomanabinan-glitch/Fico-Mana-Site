const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const DEFAULT_PRODUCTION_ORIGINS = [
  'https://ficomana.com',
  'https://www.ficomana.com',
  'https://admin.ficomana.com',
  'https://editor.ficomana.com',
]

function normalizedOrigin(value: string | null | undefined) {
  if (!value) return null
  try {
    return new URL(value).origin.toLowerCase()
  } catch {
    return null
  }
}

function configuredOrigins() {
  const values = [
    ...DEFAULT_PRODUCTION_ORIGINS,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.ADMIN_HOSTNAME ? `https://${process.env.ADMIN_HOSTNAME}` : null,
    process.env.EDITOR_HOSTNAME ? `https://${process.env.EDITOR_HOSTNAME}` : null,
    ...(process.env.SECURITY_ALLOWED_ORIGINS ?? '').split(','),
  ]
  return new Set(
    values
      .map((value) => normalizedOrigin(value?.trim()))
      .filter((value): value is string => Boolean(value)),
  )
}

function isLocalDevelopmentOrigin(origin: string) {
  if (process.env.NODE_ENV === 'production') return false
  try {
    const url = new URL(origin)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost'))
    )
  } catch {
    return false
  }
}

export function isAllowedRequestOrigin(request: Request) {
  const method = request.method.toUpperCase()
  if (SAFE_METHODS.has(method)) return true

  const origin = normalizedOrigin(request.headers.get('origin'))
  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase()
  if (origin && (configuredOrigins().has(origin) || isLocalDevelopmentOrigin(origin))) return true
  if (!origin && (fetchSite === 'same-origin' || fetchSite === 'same-site')) return true

  return process.env.NODE_ENV !== 'production' && !origin
}
