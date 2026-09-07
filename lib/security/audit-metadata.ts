const SENSITIVE_METADATA_KEY = /(password|secret|token|authorization|cookie|signature|refresh|otp|receipt[_-]?hash|raw[_-]?ip)/i

export function redactDiagnostic(value: string) {
  return value
    .replace(/\b(password|secret|token|authorization|cookie|signature)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[A-Za-z]:[\\/][^\s<>"']+/g, '[PATH REDACTED]')
    .replace(/https?:\/\/[^\s<>"']+/gi, '[URL REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN REDACTED]')
    .replace(/\b(?:sb_secret_|re_|ghp_|github_pat_|ya29\.)[A-Za-z0-9_.-]+/g, '[SECRET REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL REDACTED]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[TOKEN REDACTED]')
    .replace(/[\r\n\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 500)
}

export function safeAuditRoute(value: string | null | undefined) {
  if (!value) return null
  return value.split(/[?#]/, 1)[0]
    .replace(/(\/shoot-response\/)[^/]+/g, '$1[token]')
    .replace(/(\/portal\/)[^/]+/g, '$1[id]')
    .slice(0, 300)
}

function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactMetadata(item, depth + 1))
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return redactDiagnostic(value)
    if (typeof value === 'bigint') return value.toString()
    return value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([key, item]) => [key, SENSITIVE_METADATA_KEY.test(key) ? '[REDACTED]' : redactMetadata(item, depth + 1)]),
  )
}

export function safeMetadata(value: Record<string, unknown> | undefined) {
  if (!value) return {}
  const redacted = redactMetadata(value) as Record<string, unknown>
  const serialized = JSON.stringify(redacted)
  if (serialized.length <= 4_000) return redacted
  return { truncated: true }
}
