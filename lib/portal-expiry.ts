export function hasPortalExpired(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return false
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs
}
