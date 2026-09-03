'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { LayoutDashboard, LogOut, RefreshCw } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { AdminToastProvider } from '@/components/admin-toast-provider'
import { AdminAutoSyncProvider } from '@/components/admin-auto-sync'
import AdminSyncStatus from '@/components/admin-sync-status'
import FilteringDashboard, { type FilteringDashTab } from '@/components/filtering-dashboard'

const VALID_TABS = new Set<FilteringDashTab>(['overview', 'queue', 'calendar', 'editor'])

/** Standalone filtering ops dashboard — connected to bookings, with review / calendar / editor. */
export default function FilteringDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#222222] flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
        </div>
      }
    >
      <FilteringDashboardShell />
    </Suspense>
  )
}

function FilteringDashboardShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialSearch = searchParams.get('search')?.trim() ?? ''
  const tabParam = searchParams.get('tab')?.trim() as FilteringDashTab | null
  const initialTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : undefined
  const [loading, setLoading] = useState(true)
  const [staffUser, setStaffUser] = useState<SupabaseUser | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/admin?redirect=/filtering')
        return
      }
      setStaffUser(session.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/admin?redirect=/filtering')
        return
      }
      setStaffUser(session.user)
    })

    return () => subscription.unsubscribe()
  }, [router])

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/admin')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#222222] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
      </div>
    )
  }

  const staffLabel = staffUser?.email?.split('@')[0] ?? 'Staff'
  const staffInitial = staffLabel.charAt(0).toUpperCase()

  return (
    <AdminToastProvider>
      <AdminAutoSyncProvider enabled>
        <div className="admin-console min-h-screen bg-[#222222] text-white flex flex-col">
          <header className="bg-[#222222]/80 backdrop-blur-xl border-b border-white/[0.08] h-16 flex items-center justify-between px-5 md:px-8 sticky top-0 z-20">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="font-serif text-lg font-bold tracking-tight text-white leading-none">FICO MANA</h1>
                <p className="text-[8px] font-semibold tracking-[0.28em] text-[#C4CEFF] uppercase mt-1">
                  Filtering Dashboard
                </p>
              </div>
              <Link
                href="/admin/dashboard"
                className="hidden sm:inline-flex items-center gap-1.5 border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" /> Admin Console
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <AdminSyncStatus />
              <div className="flex items-center gap-2.5 border-l border-white/10 pl-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 text-[#C4CEFF] font-bold flex items-center justify-center text-xs">
                  {staffInitial}
                </div>
                <span className="text-xs font-medium text-white/60 hidden lg:block truncate max-w-[160px]">
                  {staffUser?.email ?? 'Staff'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-white/5 text-white/45 hover:text-white transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="relative flex-1 p-5 md:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(5,0,208,0.12),transparent)]" />
            <div className="relative max-w-7xl mx-auto">
              <FilteringDashboard initialSearch={initialSearch} initialTab={initialTab} />
            </div>
          </main>
        </div>
      </AdminAutoSyncProvider>
    </AdminToastProvider>
  )
}
