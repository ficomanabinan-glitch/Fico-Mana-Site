import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseUrl, getSupabaseKey } from '@/lib/supabase/env'

export function createSupabaseBrowserClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseKey())
}
