import type { User } from '@supabase/supabase-js'

const DEFAULT_ADMIN_HOSTNAME = 'admin.ficomana.com'
const DEFAULT_EDITOR_HOSTNAME = 'editor.ficomana.com'

function normalizeHost(host: string | null | undefined) {
  return (host ?? '').split(':')[0]?.trim().toLowerCase() || ''
}

export function isAdminHost(host: string | null | undefined) {
  const normalized = normalizeHost(host)
  const configured =
    process.env.ADMIN_HOSTNAME?.trim().toLowerCase() || DEFAULT_ADMIN_HOSTNAME

  return normalized === configured || normalized === 'admin.localhost'
}

export function isEditorHost(host: string | null | undefined) {
  const normalized = normalizeHost(host)
  const configured =
    process.env.EDITOR_HOSTNAME?.trim().toLowerCase() || DEFAULT_EDITOR_HOSTNAME

  return normalized === configured || normalized === 'editor.localhost'
}

function adminEmailAllowlist() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Authorization must come from server-controlled claims. Supabase app_metadata
 * is admin-controlled; user_metadata is intentionally never trusted here.
 * ADMIN_EMAILS is a server-only bootstrap allowlist for deployments that have
 * not yet populated app_metadata.role.
 */
export function isAdminUser(user: User | null | undefined) {
  if (!user) return false

  const role = typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : ''
  const roles = Array.isArray(user.app_metadata?.roles)
    ? user.app_metadata.roles.filter((value): value is string => typeof value === 'string')
    : []

  if (role === 'owner' || role === 'admin' || roles.includes('owner') || roles.includes('admin')) return true

  const email = user.email?.trim().toLowerCase()
  return !!email && adminEmailAllowlist().has(email)
}
