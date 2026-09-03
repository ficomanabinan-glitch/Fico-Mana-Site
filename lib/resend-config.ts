import { Resend } from 'resend'

/** Server-only Resend configuration (never use NEXT_PUBLIC_ for the API key). */
export function getResendApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key || key === 're_placeholder') return undefined
  return key
}

export function isResendConfigured(): boolean {
  return !!getResendApiKey()
}

/** Verified sender in Resend — set RESEND_FROM_EMAIL on Vercel after domain verification. */
export function getResendFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (from) return from

  // Prefer sandbox only when explicitly requested (or in local development without RESEND_FROM_EMAIL).
  if (process.env.RESEND_SANDBOX === 'true' || process.env.NODE_ENV === 'development') {
    return 'FICO MANA Studio <onboarding@resend.dev>'
  }

  return 'FICO MANA Studio <bookings@ficomana.studio>'
}

/** Safe prefix for diagnostics (never log full key). */
export function getResendKeyFingerprint(): string | null {
  const key = getResendApiKey()
  if (!key) return null
  return `${key.slice(0, 8)}…`
}

let client: Resend | null = null

/** Lazy client so production env vars are read at request time, not build time. */
export function getResendClient(): Resend | null {
  const key = getResendApiKey()
  if (!key) return null
  if (!client) client = new Resend(key)
  return client
}

export type ResendDiagnostics = {
  configured: boolean
  fromAddress: string
  keyFingerprint: string | null
  nodeEnv: string
  vercelEnv: string | null
  hint: string
}

export function getResendDiagnostics(): ResendDiagnostics {
  const configured = isResendConfigured()
  const fromAddress = getResendFromAddress()
  const domain = fromAddress.match(/<([^>]+)>/)?.[1] ?? fromAddress

  let hint = 'Ready to send.'
  if (!configured) {
    hint = 'RESEND_API_KEY is missing or invalid at runtime — emails are not sent to Resend.'
  } else if (!domain.includes('resend.dev') && !process.env.RESEND_FROM_EMAIL) {
    hint = `Verify ${domain} in Resend Domains, then set RESEND_FROM_EMAIL on Vercel.`
  }

  return {
    configured,
    fromAddress,
    keyFingerprint: getResendKeyFingerprint(),
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    vercelEnv: process.env.VERCEL_ENV ?? null,
    hint,
  }
}
