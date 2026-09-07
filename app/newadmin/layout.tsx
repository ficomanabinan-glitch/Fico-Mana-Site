import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getAdminAuthContext } from '@/lib/supabase/server'
import { NewAdminShell, NewAdminAccessDenied } from '@/components/new-admin/shell'
import { NewAdminThemeProvider } from '@/components/new-admin/theme-provider'
import { NEW_ADMIN_THEME_COOKIE, resolveNewAdminTheme } from '@/lib/new-admin/theme'

export const metadata: Metadata = { title: 'Studio Console Preview | FICO MANA', robots: { index: false, follow: false } }
export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#f5f6f8' }

export default async function NewAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, assurance } = await getAdminAuthContext()
  const theme = resolveNewAdminTheme((await cookies()).get(NEW_ADMIN_THEME_COOKIE)?.value)
  if (!user) return <NewAdminThemeProvider initialTheme={theme}><NewAdminAccessDenied /></NewAdminThemeProvider>
  if (assurance?.currentLevel !== 'aal2') redirect('/admin/mfa')
  return <NewAdminThemeProvider initialTheme={theme}><NewAdminShell userId={user.id} email={user.email ?? ''}>{children}</NewAdminShell></NewAdminThemeProvider>
}
