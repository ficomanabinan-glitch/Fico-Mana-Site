import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from './env'

/**
 * Server-only admin client (bypasses RLS).
 *
 * Prefer the modern SUPABASE_SECRET_KEY (sb_secret_...) and keep
 * SUPABASE_SERVICE_ROLE_KEY support for legacy deployments.
 * Never expose either value to client-side code or NEXT_PUBLIC_* variables.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = getSupabaseUrl()
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
