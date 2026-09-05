import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseKey, getSupabaseUrl } from '@/lib/supabase/env'

export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseKey())
}
