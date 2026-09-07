type EnvironmentIssue = { name: string; reason: string }

function value(name: string) {
  return process.env[name]?.trim() || ''
}

function requireValue(issues: EnvironmentIssue[], name: string, minimumLength = 1) {
  const current = value(name)
  if (!current) issues.push({ name, reason: 'is missing' })
  else if (current.length < minimumLength) issues.push({ name, reason: `must be at least ${minimumLength} characters` })
}

/**
 * Validate names and strength only. Values are never included in thrown errors
 * or logs. This runs at the Node server boundary, not in a client component.
 */
export function validateProductionSecurityEnvironment() {
  if (process.env.NODE_ENV !== 'production') return

  const issues: EnvironmentIssue[] = []
  const serviceSecret = value('SUPABASE_SECRET_KEY') || value('SUPABASE_SERVICE_ROLE_KEY')
  const portalSecret = value('PORTAL_SIGNING_SECRET')
  requireValue(issues, 'NEXT_PUBLIC_SUPABASE_URL')
  requireValue(issues, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  if (!serviceSecret) {
    issues.push({ name: 'SUPABASE_SECRET_KEY', reason: 'is missing' })
  }
  if (!portalSecret) issues.push({ name: 'PORTAL_SIGNING_SECRET', reason: 'is missing' })
  else if (portalSecret.length < 32) issues.push({ name: 'PORTAL_SIGNING_SECRET', reason: 'effective value must be at least 32 characters' })
  requireValue(issues, 'SECURITY_HASH_SECRET', 32)
  requireValue(issues, 'GOOGLE_CLIENT_ID')
  requireValue(issues, 'GOOGLE_CLIENT_SECRET')
  const googleTokenKey = value('GOOGLE_TOKEN_ENCRYPTION_KEY')
  if (!googleTokenKey) issues.push({ name: 'GOOGLE_TOKEN_ENCRYPTION_KEY', reason: 'is missing' })
  else if (googleTokenKey.length < 32) issues.push({ name: 'GOOGLE_TOKEN_ENCRYPTION_KEY', reason: 'effective value must be at least 32 characters' })
  requireValue(issues, 'GOOGLE_OAUTH_STATE_SECRET', 32)
  requireValue(issues, 'GOOGLE_DRIVE_ALLOWED_EMAIL')
  requireValue(issues, 'RESEND_API_KEY')

  const independentKeys = [
    ['SUPABASE_SECRET_KEY', serviceSecret],
    ['PORTAL_SIGNING_SECRET', portalSecret],
    ['GOOGLE_TOKEN_ENCRYPTION_KEY', googleTokenKey],
    ['GOOGLE_OAUTH_STATE_SECRET', value('GOOGLE_OAUTH_STATE_SECRET')],
    ['SECURITY_HASH_SECRET', value('SECURITY_HASH_SECRET')],
  ]
  const seen = new Set<string>()
  for (const [name, secret] of independentKeys) {
    if (secret && seen.has(secret)) issues.push({ name, reason: 'must be independent of other security keys' })
    if (secret) seen.add(secret)
  }

  try {
    const url = new URL(value('NEXT_PUBLIC_SUPABASE_URL'))
    if (url.protocol !== 'https:') issues.push({ name: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'must use HTTPS' })
  } catch {
    issues.push({ name: 'NEXT_PUBLIC_SUPABASE_URL', reason: 'must be a valid URL' })
  }

  for (const name of Object.keys(process.env)) {
    if (
      value(name) &&
      name.startsWith('NEXT_PUBLIC_') &&
      /(PASSWORD|SECRET|SERVICE_ROLE|PRIVATE_KEY|ENCRYPTION_KEY)/.test(name)
    ) {
      issues.push({ name, reason: 'must never be browser-exposed' })
    }
  }

  if (issues.length > 0) {
    const details = issues.map(({ name, reason }) => `${name} ${reason}`).join('; ')
    throw new Error(`Production security environment validation failed: ${details}. Secret values were not logged.`)
  }
}
