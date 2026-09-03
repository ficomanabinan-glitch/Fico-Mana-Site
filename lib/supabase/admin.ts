import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from './env'

/** Server-only admin client (bypasses RLS). Requires SUPABASE_SERVICE_ROLE_KEY. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = getSupabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
