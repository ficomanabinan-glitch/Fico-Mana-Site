const SENSITIVE_METADATA_KEY = /(password|secret|token|authorization|cookie|signature|refresh|otp|receipt[_-]?hash|raw[_-]?ip)/i

function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]'
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactMetadata(item, depth + 1))
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') return value.replace(/[\r\n]/g, ' ').slice(0, 500)
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
