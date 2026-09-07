import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { getAdminAuthContext } from '@/lib/supabase/server'
import { NewAdminShell, NewAdminAccessDenied } from '@/components/new-admin/shell'
import styles from '@/components/new-admin/new-admin.module.css'

export const metadata: Metadata = { title: 'Studio Console Preview | FICO MANA', robots: { index: false, follow: false } }
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#f5f6f8' }

export default async function NewAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, assurance } = await getAdminAuthContext()
  if (!user) return <div className={styles.theme}><NewAdminAccessDenied /></div>
  if (assurance?.currentLevel !== 'aal2') redirect('/admin/mfa')
  return <div className={styles.theme}><NewAdminShell userId={user.id} email={user.email ?? ''}>{children}</NewAdminShell></div>
}
