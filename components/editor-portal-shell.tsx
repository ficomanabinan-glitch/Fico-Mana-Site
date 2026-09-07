'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  CloudUpload,
  FolderUp,
  LayoutDashboard,
  ListFilter,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react'
import { AdminToastProvider } from '@/components/admin-toast-provider'
import { WorkspaceRefreshProvider, WorkspaceRefreshTarget } from '@/components/workspace-refresh'
import {
  DashboardSidebarNavigation,
  DashboardSidebarProfile,
  type DashboardNavigationSection,
} from '@/components/dashboard-sidebar'
import EditorLoadingSkeleton from '@/components/editor-page-skeleton'
import { invalidateEditorBatchCache } from '@/lib/editor-read-cache'

export type EditorSession = {
  user: { id: string; email: string; displayName: string }
  workspace: { name: string }
  role: 'owner' | 'admin' | 'editor' | 'onsite' | 'staff'
  capabilities: { onsite: boolean; edit: boolean; admin: boolean }
}

const EditorSessionContext = createContext<EditorSession | null>(null)

export function useEditorSession() {
  return useContext(EditorSessionContext)
}

export default function EditorPortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [session, setSession] = useState<EditorSession | null>(null)
  const [loading, setLoading] = useState(pathname !== '/editor/login')
  const [menu, setMenu] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const previousPathRef = useRef(pathname)
  const scrollPositionsRef = useRef(new Map<string, number>())
  const loginPage = pathname === '/editor/login'

  useEffect(() => {
    if (loginPage) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    fetch('/api/editor-workflow/session', { cache: 'no-store', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          invalidateEditorBatchCache()
          const { createSupabaseBrowserClient } = await import('@/lib/supabase/browser')
          await createSupabaseBrowserClient().auth.signOut()
          router.replace('/editor/login')
          return
        }
        const body = (await response.json()) as EditorSession
        if (!cancelled) setSession(body)
      })
      .catch(() => router.replace('/editor/login'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // The editor layout persists between protected routes. Re-check only when
    // crossing the login boundary; Proxy and every API retain server-side auth.
  }, [loginPage, router])

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    const previousPath = previousPathRef.current
    if (previousPath !== pathname) {
      scrollPositionsRef.current.set(previousPath, main.scrollTop)
    }
    previousPathRef.current = pathname
    const frame = window.requestAnimationFrame(() => {
      main.scrollTo({ top: scrollPositionsRef.current.get(pathname) ?? 0 })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  const navigation = useMemo<DashboardNavigationSection[]>(() => {
    if (!session) return []
    const items = [
      { label: 'Dashboard', href: '/editor', icon: LayoutDashboard, show: true, exact: true },
      { label: 'Editing Queue', href: '/editor/queue', icon: ListFilter, show: session.capabilities.edit },
      { label: 'Upload Photos', href: '/editor/upload', icon: FolderUp, show: session.capabilities.edit },
      { label: 'Onsite Upload', href: '/editor/onsite', icon: CloudUpload, show: session.capabilities.onsite },
    ]
    return [
      {
        label: 'Editor Workflow',
        items: items
          .filter((item) => item.show)
          .map((item) => ({
            label: item.label,
            href: item.href,
            icon: item.icon,
            exact: item.exact,
          })),
      },
    ]
  }, [session])

  const navigate = useCallback((href: string, mobile: boolean) => {
    setPendingHref(href)
    if (mobile) setMenu(false)
  }, [])

  const pageTitle = useMemo(() => {
    const activePath = pendingHref ?? pathname
    return (
      navigation
        .flatMap((section) => section.items)
        .find(
          (item) =>
            activePath === item.href ||
            (!item.exact && activePath.startsWith(`${item.href}/`)),
        )?.label ?? 'Editor Portal'
    )
  }, [navigation, pathname, pendingHref])

  const logout = async () => {
    invalidateEditorBatchCache()
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/browser')
    await createSupabaseBrowserClient().auth.signOut()
    router.push('/editor/login')
    router.refresh()
  }

  if (loginPage) return <>{children}</>
  if (loading || !session) {
    return (
      <div className="admin-console min-h-screen bg-[#222222] p-6 text-white">
        <EditorLoadingSkeleton />
      </div>
    )
  }

  return (
    <EditorSessionContext.Provider value={session}>
      <AdminToastProvider>
        <WorkspaceRefreshProvider>
        <div className="admin-console flex h-dvh overflow-hidden bg-[#222222] text-white">
          <aside className="hidden h-dvh w-[260px] shrink-0 flex-col overflow-hidden border-r border-white/[0.08] md:flex">
            <div className="shrink-0 border-b border-white/[0.08] p-6">
              <Link href="/editor" prefetch onClick={() => navigate('/editor', false)}>
                <h1 className="font-serif text-xl font-bold">FICO MANA</h1>
                <p className="mt-1 text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">
                  Editor Workspace
                </p>
              </Link>
            </div>

            <DashboardSidebarNavigation
              sections={navigation}
              activePath={pendingHref ?? pathname}
              onNavigate={navigate}
            />

            <DashboardSidebarProfile
              label={session.user.displayName}
              detail={`${session.role} · ${session.user.email}`}
              onLogout={logout}
            >
              {session.capabilities.admin ? (
                <a
                  href="https://admin.ficomana.com/admin/dashboard"
                  className="mt-3 flex items-center gap-1.5 border-t border-white/[0.07] pt-3 text-caption font-semibold uppercase text-white/35 hover:text-white"
                >
                  <ShieldCheck className="size-3" />
                  Open Admin Console
                </a>
              ) : null}
            </DashboardSidebarProfile>
          </aside>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#222222]/90 px-5 backdrop-blur-xl md:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMenu((value) => !value)}
                  className="rounded-lg p-1.5 text-white/60 hover:bg-white/5 md:hidden"
                  aria-label="Toggle navigation"
                >
                  {menu ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white/55">{pageTitle}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3"><WorkspaceRefreshTarget /><p className="hidden text-caption text-white/35 sm:block">{session.workspace.name}</p></div>
            </header>

            {menu ? (
              <div className="relative z-10 max-h-[65dvh] shrink-0 overflow-y-auto border-b border-white/[0.08] bg-[#222222] p-3 md:hidden">
                <DashboardSidebarNavigation
                  sections={navigation}
                  activePath={pendingHref ?? pathname}
                  mobile
                  onNavigate={navigate}
                />
              </div>
            ) : null}

            <main ref={mainRef} className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto p-5 md:p-8">
              {children}
            </main>
          </div>
        </div>
        </WorkspaceRefreshProvider>
      </AdminToastProvider>
    </EditorSessionContext.Provider>
  )
}
