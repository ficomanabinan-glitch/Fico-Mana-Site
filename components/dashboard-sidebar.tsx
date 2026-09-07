'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { LogOut, type LucideIcon } from 'lucide-react'
import { adminNavActive, adminNavIdle } from '@/lib/admin-ui'

export type DashboardNavigationItem = {
  label: string
  href: string
  icon: LucideIcon
  badge?: number
  exact?: boolean
}

export type DashboardNavigationSection = {
  label: string
  items: DashboardNavigationItem[]
}

export function DashboardSidebarNavigation({
  sections,
  activePath,
  mobile = false,
  onNavigate,
}: {
  sections: DashboardNavigationSection[]
  activePath: string
  mobile?: boolean
  onNavigate: (href: string, mobile: boolean) => void
}) {
  const router = useRouter()
  const prefetchedAt = useRef(new Map<string, number>())
  const prefetchOnIntent = (href: string) => {
    if (!href.startsWith('/') || href.startsWith('//') || href === activePath) return
    const previous = prefetchedAt.current.get(href)
    if (previous !== undefined && Date.now() - previous < 30_000) return
    prefetchedAt.current.set(href, Date.now())
    router.prefetch(href)
  }

  return (
    <nav className={mobile ? 'space-y-0' : 'min-h-0 flex-1 overflow-y-auto px-3 pb-4'}>
      {sections.map((section, sectionIndex) => (
        <div
          key={section.label}
          className={`${sectionIndex > 0 ? 'mt-4 border-t border-white/[0.08] pt-4' : 'pt-2'} ${
            mobile ? 'px-1' : ''
          }`}
        >
          <p className="px-3.5 pb-2 text-[8px] font-bold uppercase tracking-[0.22em] text-white/25">
            {section.label}
          </p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon
              const internal = item.href.startsWith('/')
              const active =
                activePath === item.href ||
                (!item.exact && internal && activePath.startsWith(`${item.href}/`))

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onMouseEnter={() => prefetchOnIntent(item.href)}
                  onFocus={() => prefetchOnIntent(item.href)}
                  onTouchStart={() => prefetchOnIntent(item.href)}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate(item.href, mobile)}
                  className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-[11px] font-semibold tracking-wide transition-all ${
                    active ? adminNavActive : adminNavIdle
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className={`size-4 ${active ? 'text-[#C4CEFF]' : 'text-white/40'}`} />
                    {item.label}
                  </span>
                  {item.badge && item.badge > 0 ? (
                    <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[9px] font-bold text-white">
                      {item.badge}
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
}

export function DashboardSidebarProfile({
  label,
  detail,
  onLogout,
  children,
}: {
  label: string
  detail: string
  onLogout: () => void | Promise<void>
  children?: React.ReactNode
}) {
  const initial = label.charAt(0).toUpperCase() || 'S'

  return (
    <div className="m-3 mt-auto shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20">
            <span className="text-xs font-bold text-[#C4CEFF]">{initial}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{label}</p>
            <p className="truncate text-[10px] text-white/35">{detail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white"
          title="Logout"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
      {children}
    </div>
  )
}
