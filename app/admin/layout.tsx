'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  List,
  LogOut,
  Bell,
  Menu,
  X,
  RefreshCw,
  FileText,
  Image,
} from 'lucide-react'
import { getNotifications, getBookings, markNotificationRead, Notification } from '@/lib/data-store'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { AdminToastProvider } from '@/components/admin-toast-provider'
import { AdminAutoSyncProvider } from '@/components/admin-auto-sync'
import AdminSyncStatus from '@/components/admin-sync-status'
import { notificationTypeBadge, adminNavActive, adminNavIdle } from '@/lib/admin-ui'
import type { User as SupabaseUser } from '@supabase/supabase-js'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [staffUser, setStaffUser] = useState<SupabaseUser | null>(null)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifDrawer, setShowNotifDrawer] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingVerifications, setPendingVerifications] = useState(0)
  const [pendingRawPhotoReviews, setPendingRawPhotoReviews] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session)
      setStaffUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session)
      setStaffUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [pathname, router])

  const refreshConsoleData = async () => {
    try {
      const notifs = await getNotifications()
      setNotifications(notifs)
      setUnreadCount(notifs.filter((n) => !n.isRead).length)
      const bookings = await getBookings()
      setPendingVerifications(bookings.filter((b) => b.bookingStatus === 'Pending Verification').length)
      setPendingRawPhotoReviews(
        bookings.filter((b) => !!b.rawPhotoLink && (b.rawPhotoStatus || 'Pending Review') === 'Pending Review').length,
      )
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (!isLoggedIn) return
    refreshConsoleData()
    const onSync = () => refreshConsoleData()
    window.addEventListener('admin:db-synced', onSync)
    return () => window.removeEventListener('admin:db-synced', onSync)
  }, [isLoggedIn, pathname])

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setStaffUser(null)
    router.push('/admin')
    router.refresh()
  }

  const staffLabel = staffUser?.email?.split('@')[0] ?? 'Staff'
  const staffInitial = staffLabel.charAt(0).toUpperCase()

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const isLoginPage = pathname === '/admin'

  if (isLoginPage) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
      </div>
    )
  }

  const navItems = [
    { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    {
      label: 'Verification Queue',
      href: '/admin/verification',
      icon: CheckSquare,
      badge: pendingVerifications > 0 ? pendingVerifications : undefined,
    },
    { label: 'Bookings List', href: '/admin/bookings', icon: List },
    {
      label: 'Filtering Queue',
      href: '/filtering',
      icon: Image,
      badge: pendingRawPhotoReviews > 0 ? pendingRawPhotoReviews : undefined,
      external: true,
    },
    { label: 'Session Calendar', href: '/admin/calendar', icon: CalendarDays },
    { label: 'System Email Logs', href: '/admin/emails', icon: FileText },
  ]

  return (
    <AdminToastProvider>
    <AdminAutoSyncProvider enabled={isLoggedIn && !isLoginPage}>
    <div className="admin-console min-h-screen bg-[#222222] text-white flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex md:w-[260px] bg-[#222222] border-r border-white/[0.08] flex-col flex-shrink-0 relative">
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent pointer-events-none" />
        <div className="p-6 border-b border-white/[0.08]">
          <Link href="/admin/dashboard" className="block group">
            <h1 className="font-serif text-xl font-bold tracking-tight text-white group-hover:text-white/90 transition-colors">
              FICO MANA
            </h1>
            <p className="text-[9px] font-semibold tracking-[0.28em] text-[#C4CEFF] uppercase mt-1">
              Studio Console
            </p>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            const linkClass = `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-200 ${
              isActive ? adminNavActive : adminNavIdle
            }`
            const linkContent = (
              <>
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#C4CEFF]' : 'text-white/45'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[9px] font-bold text-center ${
                      isActive ? 'bg-primary text-white' : 'bg-red-500/90 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            )

            return item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                {linkContent}
              </a>
            ) : (
              <Link key={item.href} href={item.href} className={linkClass}>
                {linkContent}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 m-3 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[#C4CEFF]">{staffInitial}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate max-w-[130px]">{staffLabel}</p>
              <p className="text-[10px] text-white/40 truncate max-w-[130px]">{staffUser?.email ?? 'Staff'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-white/5 text-white/45 hover:text-white transition-colors flex-shrink-0"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(5,0,208,0.12),transparent)]" />
        <header className="relative bg-[#222222]/80 backdrop-blur-xl border-b border-white/[0.08] h-14 flex items-center justify-between px-5 md:px-8 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="md:hidden p-1.5 hover:bg-white/5 text-white/70"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h2 className="text-xs font-semibold tracking-wide text-white/50 hidden sm:block">
              {navItems.find((n) => n.href === pathname)?.label || 'Console'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <AdminSyncStatus />
            <div className="relative">
              <button
                onClick={() => setShowNotifDrawer((prev) => !prev)}
                className="p-2 rounded-lg text-white/50 hover:bg-white/5 hover:text-white transition-colors relative"
              >
                <Bell className="w-[18px] h-[18px]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifDrawer && (
                <>
                <button
                  type="button"
                  className="fixed inset-0 z-20"
                  aria-label="Close notifications"
                  onClick={() => setShowNotifDrawer(false)}
                />
                <div className="absolute right-0 mt-2 w-80 rounded-xl bg-[#222222] border border-white/10 shadow-2xl overflow-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <span className="text-xs font-semibold text-white">Notifications</span>
                    <span className="text-[10px] text-white/40 font-medium">{unreadCount} unread</span>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto divide-y divide-white/5">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-xs text-white/40">No recent notifications.</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3.5 text-xs leading-normal flex flex-col gap-1.5 transition-colors ${
                            n.isRead ? 'bg-transparent' : 'bg-primary/[0.06] hover:bg-primary/10'
                          }`}
                        >
                          <p className={`text-[9px] font-bold uppercase tracking-wider ${notificationTypeBadge(n.type)}`}>
                            {n.type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-white/75">{n.message}</p>
                          <div className="flex justify-between items-center mt-0.5 gap-2">
                            <span className="text-[10px] text-white/35">
                              {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="flex gap-2">
                              {n.bookingId && !n.bookingId.startsWith('OPS-') && (
                                <Link
                                  href={
                                    n.type.startsWith('RAW_PHOTO')
                                      ? `/filtering?tab=queue&search=${encodeURIComponent(n.bookingId)}`
                                      : `/admin/bookings?search=${encodeURIComponent(n.bookingId)}`
                                  }
                                  onClick={() => setShowNotifDrawer(false)}
                                  className="text-[10px] text-[#C4CEFF] font-semibold hover:underline hover:text-white"
                                  {...(n.type.startsWith('RAW_PHOTO') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                                >
                                  View
                                </Link>
                              )}
                              {n.type === 'OPS_REMINDER' && (
                                <Link
                                  href="/admin/emails"
                                  onClick={() => setShowNotifDrawer(false)}
                                  className="text-[10px] text-amber-300 font-semibold hover:underline hover:text-white"
                                >
                                  Email logs
                                </Link>
                              )}
                              {!n.isRead && (
                                <button
                                  onClick={() => handleMarkRead(n.id)}
                                  className="text-[10px] text-[#C4CEFF] font-semibold hover:underline hover:text-white"
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                </>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2.5 border-l border-white/10 pl-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 text-[#C4CEFF] font-bold flex items-center justify-center text-xs">
                {staffInitial}
              </div>
              <span className="text-xs font-medium text-white/60 hidden lg:block truncate max-w-[160px]">
                {staffUser?.email ?? 'Staff'}
              </span>
            </div>
          </div>
        </header>

        {mobileMenuOpen && (
          <nav className="md:hidden relative z-10 bg-[#222222] border-b border-white/[0.08] p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              const linkClass = `flex items-center justify-between px-3.5 py-2.5 rounded-lg text-[11px] font-semibold ${
                isActive ? adminNavActive : adminNavIdle
              }`
              const linkContent = (
                <>
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-red-500 text-white text-center">
                      {item.badge}
                    </span>
                  )}
                </>
              )

              return item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className={linkClass}
                >
                  {linkContent}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={linkClass}
                >
                  {linkContent}
                </Link>
              )
            })}
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                handleLogout()
              }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[11px] font-semibold text-white/55 hover:bg-white/[0.04]"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </nav>
        )}

        <main className="relative flex-1 overflow-y-auto p-5 md:p-8">{children}</main>
      </div>
    </div>
    </AdminAutoSyncProvider>
    </AdminToastProvider>
  )
}
