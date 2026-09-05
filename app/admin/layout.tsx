'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  FileText,
  FolderHeart,
  Image,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
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
import AdminLoadingSkeleton from '@/components/admin-loading-skeleton'
import { adminNavActive, adminNavIdle, notificationTypeBadge } from '@/lib/admin-ui'

type StaffUser = { email?: string | null }

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
      { label: 'Filtering Queue', href: '/admin/filtering', icon: Image, badgeKey: 'filtering' },
      { label: 'Session Calendar', href: '/admin/calendar', icon: CalendarDays },
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

  const isLoginPage = pathname === '/admin'

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    client.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(Boolean(session))
      setStaffUser((session?.user as StaffUser | undefined) ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session))
      setStaffUser((session?.user as StaffUser | undefined) ?? null)
    })

    return () => subscription.unsubscribe()
  }, [pathname])

  const refreshConsoleData = async () => {
    if (!isLoggedIn) return
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
  }

  useEffect(() => {
    if (!isLoggedIn) return
    void refreshConsoleData()

    const onSync = () => void refreshConsoleData()
    window.addEventListener('admin:db-synced', onSync)
    return () => window.removeEventListener('admin:db-synced', onSync)
  }, [isLoggedIn, pathname])

  useEffect(() => {
    if (!loading && !isLoggedIn && !isLoginPage) router.replace('/admin')
  }, [isLoginPage, isLoggedIn, loading, router])

  const unreadCount = notifications.filter((notification) => !notification.isRead).length
  const staffLabel = staffUser?.email?.split('@')[0] || 'Staff'
  const staffInitial = staffLabel.charAt(0).toUpperCase()

  const pageTitle = useMemo(() => {
    for (const section of navigationSections) {
      const item = section.items.find((entry) => entry.href === pathname)
      if (item) return item.label
    }
    return 'Console'
  }, [pathname])

  const badgeFor = (badgeKey?: string) => {
    if (badgeKey === 'verification') return pendingVerifications
    if (badgeKey === 'filtering') return pendingRawPhotoReviews
    return 0
  }

  const handleLogout = async () => {
    const client = createSupabaseBrowserClient()
    await client.auth.signOut()
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

  const Navigation = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={mobile ? 'space-y-0' : 'flex-1 overflow-y-auto px-3 pb-4'}>
      {navigationSections.map((section, sectionIndex) => (
        <div
          key={section.label}
          className={`${sectionIndex > 0 ? 'border-t border-white/[0.08] mt-4 pt-4' : 'pt-2'} ${
            mobile ? 'px-1' : ''
          }`}
        >
          <p className="px-3.5 pb-2 text-[8px] font-bold uppercase tracking-[0.22em] text-white/25">
            {section.label}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href
              const badge = badgeFor('badgeKey' in item ? item.badgeKey : undefined)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => mobile && setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-[11px] font-semibold tracking-wide transition-all ${
                    active ? adminNavActive : adminNavIdle
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className={`size-4 ${active ? 'text-[#C4CEFF]' : 'text-white/40'}`} />
                    {item.label}
                  </span>
                  {badge > 0 ? (
                    <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
                      {badge}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  if (isLoginPage) return <>{children}</>

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
    <AdminToastProvider>
      <AdminAutoSyncProvider enabled={isLoggedIn}>
        <div className="admin-console min-h-screen bg-[#222222] text-white flex">
          <aside className="hidden md:flex md:w-[260px] border-r border-white/[0.08] flex-col shrink-0">
            <div className="p-6 border-b border-white/[0.08]">
              <Link href="/admin/dashboard">
                <h1 className="font-serif text-xl font-bold">FICO MANA</h1>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.28em] text-[#C4CEFF]">
                  Studio Console
                </p>
              </Link>
            </div>

            <Navigation />

            <div className="m-3 mt-auto flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20">
                  <span className="text-xs font-bold text-[#C4CEFF]">{staffInitial}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{staffLabel}</p>
                  <p className="truncate text-[10px] text-white/35">{staffUser?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white"
                title="Logout"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </aside>

          <div className="relative flex min-w-0 flex-1 flex-col">
            <header className="relative z-20 flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#222222]/90 px-5 backdrop-blur-xl md:px-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileMenuOpen((previous) => !previous)}
                  className="rounded-lg p-1.5 text-white/65 hover:bg-white/5 md:hidden"
                >
                  {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
                <div>
                  <p className="text-xs font-semibold text-white/55">{pageTitle}</p>
                  <p className="hidden text-[8px] uppercase tracking-[0.18em] text-amber-300/65 sm:block">
                    Secure production workspace
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <AdminSyncStatus />
                <div className="relative">
                  <button
                    onClick={() => setShowNotifDrawer((previous) => !previous)}
                    className="relative rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
                    title="Notifications"
                  >
                    <Bell className="size-[18px]" />
                    {unreadCount > 0 ? (
                      <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
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
                          <span className="text-[10px] text-white/35">{unreadCount} unread</span>
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
                                  className={`text-[9px] font-bold uppercase tracking-wider ${notificationTypeBadge(
                                    notification.type,
                                  )}`}
                                >
                                  {notification.type.replace(/_/g, ' ')}
                                </p>
                                <p className="mt-1.5 text-white/70">{notification.message}</p>
                                {!notification.isRead ? (
                                  <button
                                    onClick={() => void handleMarkRead(notification.id)}
                                    className="mt-2 text-[10px] font-semibold text-[#C4CEFF] hover:underline"
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
                <Navigation mobile />
              </div>
            ) : null}

            <main className="relative flex-1 overflow-y-auto p-5 md:p-8">{children}</main>
          </div>
        </div>
      </AdminAutoSyncProvider>
    </AdminToastProvider>
  )
}
