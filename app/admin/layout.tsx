'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  Clapperboard,
  FileText,
  FolderHeart,
  LayoutDashboard,
  List,
  Menu,
  PackageOpen,
  PenTool,
  ReceiptText,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { getBookings, getNotifications, markNotificationRead, type Notification } from '@/lib/data-store'
import { AdminToastProvider } from '@/components/admin-toast-provider'
import { AdminAutoSyncProvider } from '@/components/admin-auto-sync'
import AdminSyncStatus from '@/components/admin-sync-status'
import { WorkspaceRefreshProvider } from '@/components/workspace-refresh'
import AdminLoadingSkeleton from '@/components/admin-loading-skeleton'
import { notificationTypeBadge } from '@/lib/admin-ui'
import { clearSalesReadCache } from '@/lib/sales-read-cache'
import { clearManagedPackageCache } from '@/lib/package-manager-cache'
import { bindStaffReadCache } from '@/lib/staff-cache-session'
import { SHOOT_REMINDER_NOTIFICATION_TYPE } from '@/lib/shoot-reminder-issues'
import StaffQueryProvider from '@/components/staff-query-provider'
import {
  DashboardSidebarNavigation,
  DashboardSidebarProfile,
  type DashboardNavigationSection,
} from '@/components/dashboard-sidebar'

type StaffUser = { id: string; email?: string | null }

const navigationSections = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Client Management',
    items: [
      { label: 'Bookings', href: '/admin/bookings', icon: List },
      { label: 'Clients', href: '/admin/clients', icon: Users },
      { label: 'Client Portals', href: '/admin/provisioning', icon: FolderHeart },
      { label: 'Verification Queue', href: '/admin/verification', icon: CheckSquare, badgeKey: 'verification' },
      { label: 'Editor Portal', href: 'https://editor.ficomana.com', icon: PenTool },
      { label: 'Session Calendar', href: '/admin/calendar', icon: CalendarDays },
      { label: 'Shoot Reminders', href: '/admin/shoot-reminders', icon: Bell },
    ],
  },
  {
    label: 'Sales & Finance',
    items: [
      { label: 'Sales Management', href: '/admin/sales', icon: BarChart3 },
      { label: 'Business Expenses', href: '/admin/expenses', icon: ReceiptText },
      { label: 'Reports', href: '/admin/reports', icon: FileText },
    ],
  },
  {
    label: 'System Management',
    items: [
      { label: 'Package Manager', href: '/admin/packages', icon: PackageOpen },
      { label: 'Website Media', href: '/admin/media', icon: Clapperboard },
      { label: 'Email Logs', href: '/admin/emails', icon: FileText },
      { label: 'System Settings', href: '/admin/system', icon: Settings },
    ],
  },
] as const

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifDrawer, setShowNotifDrawer] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [pendingVerifications, setPendingVerifications] = useState(0)
  const [pendingRawPhotoReviews, setPendingRawPhotoReviews] = useState(0)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const previousPathRef = useRef(pathname)
  const scrollPositionsRef = useRef(new Map<string, number>())

  const isLoginPage = pathname === '/admin'
  const isMfaPage = pathname === '/admin/mfa'
  const isAuthPage = isLoginPage || isMfaPage

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    let authEventSeen = false
    let disposed = false
    client.auth.getSession().then(({ data: { session } }) => {
      if (disposed || authEventSeen) return
      bindStaffReadCache(session?.user.id ?? null)
      setIsLoggedIn(Boolean(session))
      setStaffUser((session?.user as StaffUser | undefined) ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true
      if (bindStaffReadCache(session?.user.id ?? null)) {
        setNotifications([])
        setShowNotifDrawer(false)
        setPendingVerifications(0)
        setPendingRawPhotoReviews(0)
      }
      setIsLoggedIn(Boolean(session))
      setStaffUser((session?.user as StaffUser | undefined) ?? null)
      setLoading(false)
      if (!session) {
        clearSalesReadCache()
        clearManagedPackageCache()
      }
    })

    return () => { disposed = true; subscription.unsubscribe() }
  }, [])

  const refreshConsoleData = useCallback(async () => {
    if (!isLoggedIn || isMfaPage) return
    try {
      const [notifs, bookings] = await Promise.all([getNotifications(), getBookings()])
      setNotifications(notifs)
      setPendingVerifications(
        bookings.filter((booking) => booking.bookingStatus === 'Pending Verification').length,
      )
      setPendingRawPhotoReviews(
        bookings.filter(
          (booking) =>
            Boolean(booking.rawPhotoLink) &&
            (booking.rawPhotoStatus || 'Pending Review') === 'Pending Review',
        ).length,
      )
    } catch (error) {
      console.error('Navigation refresh failed:', error)
    }
  }, [isLoggedIn, isMfaPage])

  useEffect(() => {
    if (!isLoggedIn) return
    void refreshConsoleData()

    const onSync = () => void refreshConsoleData()
    window.addEventListener('admin:db-synced', onSync)
    return () => window.removeEventListener('admin:db-synced', onSync)
  }, [isLoggedIn, refreshConsoleData])

  useEffect(() => {
    if (!isLoggedIn || isAuthPage) return
    let disposed = false
    const refreshNotifications = async () => {
      if (document.visibilityState !== 'visible') return
      const notifs = await getNotifications({ force: true })
      if (!disposed) setNotifications(notifs)
    }
    // Lightweight notification refresh only; do not reload bookings or the page.
    const timer = setInterval(() => void refreshNotifications(), 3 * 60_000)
    document.addEventListener('visibilitychange', refreshNotifications)
    return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', refreshNotifications) }
  }, [isLoggedIn, isAuthPage])

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

  useEffect(() => {
    if (!loading && !isLoggedIn && !isAuthPage) router.replace('/admin')
  }, [isAuthPage, isLoggedIn, loading, router])

  const unreadCount = notifications.filter((notification) => !notification.isRead).length
  const staffLabel = staffUser?.email?.split('@')[0] || 'Staff'

  const navigation = useMemo<DashboardNavigationSection[]>(
    () =>
      navigationSections.map((section) => ({
        label: section.label,
        items: section.items.map((item) => ({
          label: item.label,
          href: item.href,
          icon: item.icon,
          badge:
            'badgeKey' in item
              ? item.badgeKey === 'verification'
                ? pendingVerifications
                : pendingRawPhotoReviews
              : undefined,
        })),
      })),
    [pendingRawPhotoReviews, pendingVerifications],
  )

  const handleNavigate = useCallback((href: string, mobile: boolean) => {
    setPendingHref(href)
    if (mobile) setMobileMenuOpen(false)
  }, [])

  const pageTitle = useMemo(() => {
    const activePath = pendingHref ?? pathname
    for (const section of navigationSections) {
      const item = section.items.find((entry) => entry.href === activePath)
      if (item) return item.label
    }
    return 'Console'
  }, [pathname, pendingHref])

  const handleLogout = async () => {
    bindStaffReadCache(null)
    const client = createSupabaseBrowserClient()
    await client.auth.signOut()
    clearSalesReadCache()
    clearManagedPackageCache()
    setIsLoggedIn(false)
    setStaffUser(null)
    router.push('/admin')
    router.refresh()
  }

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id)
    setNotifications((previous) =>
      previous.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification,
      ),
    )
  }

  if (isAuthPage) return <>{children}</>

  if (loading) {
    return (
      <div className="admin-console min-h-screen bg-[#222222] text-white p-6">
        <AdminLoadingSkeleton />
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="admin-console min-h-screen bg-[#222222] text-white p-6">
        <AdminLoadingSkeleton />
      </div>
    )
  }

  return (
    <StaffQueryProvider key={staffUser?.id}>
      <AdminToastProvider>
        <AdminAutoSyncProvider enabled={isLoggedIn}>
          <WorkspaceRefreshProvider>
        <div className="admin-console flex h-dvh overflow-hidden bg-[#222222] text-white">
          <aside className="hidden h-dvh w-[260px] shrink-0 flex-col overflow-hidden border-r border-white/[0.08] md:flex">
            <div className="shrink-0 border-b border-white/[0.08] p-6">
              <Link href="/admin/dashboard" prefetch onClick={() => setPendingHref('/admin/dashboard')}>
                <h1 className="font-serif text-xl font-bold">FICO MANA</h1>
                <p className="mt-1 text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">
                  Studio Console
                </p>
              </Link>
            </div>

            <DashboardSidebarNavigation
              sections={navigation}
              activePath={pendingHref ?? pathname}
              onNavigate={handleNavigate}
            />

            <DashboardSidebarProfile
              label={staffLabel}
              detail={staffUser?.email || 'Staff account'}
              onLogout={handleLogout}
            />
          </aside>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#222222]/90 px-5 backdrop-blur-xl md:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  onClick={() => setMobileMenuOpen((previous) => !previous)}
                  className="rounded-lg p-1.5 text-white/65 hover:bg-white/5 md:hidden"
                >
                  {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white/55">{pageTitle}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <AdminSyncStatus />
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowNotifDrawer((previous) => !previous)
                      if (!showNotifDrawer) void getNotifications({ force: true }).then(setNotifications)
                    }}
                    className="relative rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
                    title="Notifications"
                  >
                    <Bell className="size-[18px]" />
                    {unreadCount > 0 ? (
                      <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-caption font-semibold text-white">
                        {unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {showNotifDrawer ? (
                    <>
                      <button
                        className="fixed inset-0 z-20"
                        aria-label="Close notifications"
                        onClick={() => setShowNotifDrawer(false)}
                      />
                      <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-[#222222] shadow-2xl">
                        <div className="flex items-center justify-between border-b border-white/10 p-4">
                          <span className="text-xs font-semibold">Notifications</span>
                          <span className="text-caption text-white/35">{unreadCount} unread</span>
                        </div>
                        <div className="max-h-[340px] divide-y divide-white/5 overflow-y-auto">
                          {notifications.length === 0 ? (
                            <div className="p-8 text-center text-xs text-white/35">No notifications.</div>
                          ) : (
                            notifications.map((notification) => (
                              <div
                                key={notification.id}
                                className={`p-3.5 text-xs ${
                                  notification.isRead ? '' : 'bg-primary/[0.05]'
                                }`}
                              >
                                <p
                                  className={`text-caption font-semibold uppercase tracking-wider ${notificationTypeBadge(
                                    notification.type,
                                  )}`}
                                >
                                  {notification.type===SHOOT_REMINDER_NOTIFICATION_TYPE?'Shoot reminder':notification.type.replace(/_/g, ' ')}
                                </p>
                                <p className="mt-1.5 text-white/70">{notification.message}</p>
                                {notification.type===SHOOT_REMINDER_NOTIFICATION_TYPE?<Link href="/admin/shoot-reminders" onClick={()=>setShowNotifDrawer(false)} className="mt-2 mr-3 inline-block cursor-pointer text-caption font-semibold text-[#C4CEFF] hover:underline">Review shoot reminders</Link>:null}
                                {!notification.isRead ? (
                                  <button
                                    onClick={() => void handleMarkRead(notification.id)}
                                    className="mt-2 text-caption font-semibold text-[#C4CEFF] hover:underline"
                                  >
                                    Mark read
                                  </button>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </header>

            {mobileMenuOpen ? (
              <div className="relative z-10 border-b border-white/[0.08] bg-[#222222] p-3 md:hidden">
                <DashboardSidebarNavigation
                  sections={navigation}
                  activePath={pendingHref ?? pathname}
                  mobile
                  onNavigate={handleNavigate}
                />
              </div>
            ) : null}

            <main ref={mainRef} className="relative min-h-0 min-w-0 w-full flex-1 overflow-y-auto p-5 md:p-8">
              <div key={pathname} className="console-route-entry min-w-0 w-full">{children}</div>
            </main>
          </div>
        </div>
          </WorkspaceRefreshProvider>
        </AdminAutoSyncProvider>
      </AdminToastProvider>
    </StaffQueryProvider>
  )
}
