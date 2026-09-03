/** Supabase project URL from .env.local */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || ''
}

/**
 * Client key — supports both legacy anon key and new publishable key names.
 * .env.local may use either:
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 */
export function getSupabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  )
}

export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseKey())
}
