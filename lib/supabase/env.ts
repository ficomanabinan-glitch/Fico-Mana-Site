/**
 * Public Supabase client configuration.
 *
 * NEXT_PUBLIC_* values are intentionally public and may be embedded in the
 * browser bundle. Environment variables take precedence, while these defaults
 * keep middleware/auth working on deployments where Vercel env vars have not
 * been configured yet.
 *
 * Never place SUPABASE_SERVICE_ROLE_KEY here — that key must remain server-only.
 */
const DEFAULT_SUPABASE_URL = 'https://hrvyxxamxacosmbnkxwd.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Q8uGzQXq_ZYQ2J84UFsrkg_pL1ttUVu'

/** Supabase project URL. */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
}

/**
 * Client key — supports both legacy anon key and new publishable key names.
 */
export function getSupabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY
  )
}

export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseKey())
}
