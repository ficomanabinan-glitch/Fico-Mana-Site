import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isAdminUser } from '@/lib/auth/admin'
import { getSupabaseUrl, getSupabaseKey } from '@/lib/supabase/env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(getSupabaseUrl(), getSupabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot mutate response cookies; middleware refreshes them.
        }
      },
    },
  })
}

/** Returns a server-validated authenticated user, or null. */
export async function getStaffUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/** Returns a server-validated administrator, never trusting user_metadata. */
export async function getAdminUser() {
  const user = await getStaffUser()
  return isAdminUser(user) ? user : null
}
