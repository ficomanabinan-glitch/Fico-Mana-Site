'use client'

import { useState } from 'react'
import { WorkspaceRefreshProvider } from '@/components/workspace-refresh'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Aperture, ArrowUpRight, CalendarDays, ChevronRight, FolderOpen, Images, LayoutDashboard, ListFilter, LogOut, Menu, PenTool, ReceiptText, Search, Settings, ShieldCheck, TrendingUp } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { newAdminSections, type NewAdminSection } from '@/lib/new-admin/routing'
import { Button } from './ui'
import { NewAdminDataProvider } from './data-provider'
import { ThemeToggle, useNewAdminTheme } from './theme-provider'
import styles from './new-admin.module.css'

const navigation = [
  { label: 'Workspace', items: [['dashboard', LayoutDashboard], ['bookings', CalendarDays], ['filtering', ListFilter], ['editor', PenTool], ['selections', Images]] },
  { label: 'Business', items: [['payments', ReceiptText], ['storage', FolderOpen], ['reports', TrendingUp], ['settings', Settings]] },
] as const

function Brand() { return <Link href="/newadmin" className={styles.brand}><span className={styles.brandMark}><Aperture size={24} aria-hidden="true" /></span><span><strong>FICO MANA</strong><small>Studio workspace</small></span></Link> }
function Nav({ close }: { close?: () => void }) {
  const pathname = usePathname()
  return <nav className={styles.nav} aria-label="Preview console navigation">{navigation.map(group => <div className={styles.navGroup} key={group.label}><p>{group.label}</p>{group.items.map(([key, Icon]) => {
    const href = key === 'dashboard' ? '/newadmin' : `/newadmin/${key}`
    const active = key === 'dashboard' ? pathname === href : pathname.startsWith(href)
    return <Link key={key} href={href} onClick={close} aria-current={active ? 'page' : undefined}><Icon size={18} aria-hidden="true" />{key === 'dashboard' ? 'Dashboard' : newAdminSections[key].title}</Link>
  })}</div>)}</nav>
}
export function NewAdminAccessDenied() {
  const [error, setError] = useState('')
  const router = useRouter()
  async function reset() { const { error } = await createSupabaseBrowserClient().auth.signOut({ scope: 'local' }); if (error) setError('Could not sign out. Try: refresh the page.'); else { router.replace('/admin'); router.refresh() } }
  return <div className={styles.access}><ShieldCheck size={40} className="mx-auto" aria-hidden="true" /><h1>Administrator access required</h1><p>This preview uses the same secure staff access as the existing console.</p><div className={styles.actions}><Link href="/admin" className={styles.action}>Sign in</Link><Button onClick={() => void reset()}>Use another account</Button></div>{error && <p role="alert">{error}</p>}</div>
}
export function NewAdminShell({ userId, email, children }: { userId: string; email: string; children: React.ReactNode }) {
  const { theme } = useNewAdminTheme()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const section = pathname.split('/')[2] as NewAdminSection
  const title = newAdminSections[section]?.title ?? 'Dashboard'
  async function signOut() {
    setSigningOut(true); setError('')
    const { error } = await createSupabaseBrowserClient().auth.signOut({ scope: 'local' })
    if (error) { setError('Could not sign out. Try: refresh and try again.'); setSigningOut(false) }
    else { router.replace('/admin'); router.refresh() }
  }
  return <WorkspaceRefreshProvider><NewAdminDataProvider key={userId} userId={userId}><a href="#newadmin-content" className={styles.skip}>Skip to main content</a><div className={styles.shell}>
    <aside className={styles.sidebar}><Brand /><Nav /><div className={styles.profile}><p className={styles.muted}>Studio administrator<br />{email}</p><Button disabled={signingOut} onClick={() => void signOut()}><LogOut size={16} aria-hidden="true" />{signingOut ? 'Signing out…' : 'Sign out'}</Button><a className={styles.textLink} href="https://admin.ficomana.com/admin/dashboard" target="_blank" rel="noopener noreferrer">Original console <ArrowUpRight size={14} className="inline" aria-hidden="true" /></a></div></aside>
    <div className={styles.workspace}><header className={styles.topbar}>
      <div className={styles.mobileMenu}><Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button aria-label="Open navigation" />}><Menu size={20} aria-hidden="true" /></SheetTrigger><SheetContent side="left" data-theme={theme} className={`${styles.theme} ${styles.drawer}`}><SheetTitle>FICO MANA</SheetTitle><SheetDescription>Studio console preview</SheetDescription><Nav close={() => setOpen(false)} /><Button disabled={signingOut} onClick={() => void signOut()}><LogOut size={16} aria-hidden="true" />Sign out</Button></SheetContent></Sheet></div>
      <div className={styles.breadcrumb}><span className={styles.muted}>Workspace</span><ChevronRight size={14} aria-hidden="true" /><span>{title}</span></div>
      <form role="search" onSubmit={event => { event.preventDefault(); const term = new FormData(event.currentTarget).get('search'); router.push(`/newadmin/bookings?search=${encodeURIComponent(String(term ?? ''))}`) }}><input name="search" aria-label="Search clients and bookings" placeholder="Search clients or bookings…" /><Button type="submit" aria-label="Search"><Search size={18} aria-hidden="true" /></Button></form><div className={styles.topbarActions}><span className={`${styles.muted} ${styles.previewLabel}`}>Design preview</span><ThemeToggle /></div>
    </header><main id="newadmin-content" tabIndex={-1} className={styles.content}>{error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}{children}</main></div>
  </div></NewAdminDataProvider></WorkspaceRefreshProvider>
}
