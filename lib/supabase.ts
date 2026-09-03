import { createClient } from '@supabase/supabase-js'
import { getSupabaseUrl, getSupabaseKey, isSupabaseConfigured } from './supabase/env'

export { isSupabaseConfigured, getSupabaseUrl, getSupabaseKey }

const supabaseUrl = getSupabaseUrl()
const supabaseKey = getSupabaseKey()

// Legacy singleton for client-side storage uploads and fallbacks.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co',
  supabaseKey || 'placeholder-key',
)
