'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, WalletCards } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/** Keep the same summary/QR content accessible without covering the mobile gallery. */
export default function PortalSidebar({ children, remaining, collapsed = false, onCollapsedChange }: {
  children: ReactNode
  remaining: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1280px)')
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  return <>
    <aside aria-label="Client details, payment summary, and portal QR" tabIndex={0}
      className={`fico-portal-sidebar hidden min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/50 xl:block ${collapsed ? 'xl:pr-0' : 'xl:pr-6 2xl:pr-8'}`}>
      <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand client details' : 'Collapse client details'}
        onClick={() => onCollapsedChange?.(!collapsed)}
        title={collapsed ? 'Expand client details' : 'Collapse client details'}
        className={`flex size-10 cursor-pointer items-center justify-center rounded-full text-[#C4CEFF] outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 ${collapsed ? 'mx-auto' : 'ml-auto'}`}>
        {collapsed ? <ChevronRight className="size-5" aria-hidden="true" /> : <ChevronLeft className="size-5" aria-hidden="true" />}
      </button>
      {collapsed ? null : <div className="mt-3 space-y-4">{children}</div>}
    </aside>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<button type="button"
        aria-label={`Open client details. Remaining balance: ${remaining}`}
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 flex min-h-12 w-auto cursor-pointer items-center justify-between gap-4 rounded-control border border-white/10 bg-[#1f1f1f]/95 px-4 py-3 text-left text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] backdrop-blur-xl outline-none transition hover:border-[#C4CEFF]/30 hover:bg-[#242424] focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 sm:inset-x-5 md:static md:z-auto md:w-full md:shadow-none xl:hidden" />}>
        <span className="min-w-0"><span className="flex items-center gap-2 text-caption font-semibold text-[#C4CEFF]"><WalletCards className="size-4 shrink-0" />Client Details</span><span className="mt-1 block text-caption text-white/45">Balance <strong className="ml-1 font-semibold text-white">{remaining}</strong></span></span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold text-[#C4CEFF]">Open<ChevronUp className="size-4" /></span>
      </SheetTrigger>
      <SheetContent side="bottom" initialFocus={title} className="client-portal max-h-[85dvh] gap-0 overflow-hidden rounded-t-card border-white/15 bg-[#171717] text-white xl:hidden" overlayClassName="bg-black/70 xl:hidden">
        <SheetHeader className="shrink-0 border-b border-white/10 p-4 pr-14">
          <SheetTitle ref={title} tabIndex={-1} className="font-sans text-sm font-semibold text-white outline-none">Client Details</SheetTitle>
          <SheetDescription className="sr-only">Your selection, booking, payment, and portal QR details.</SheetDescription>
        </SheetHeader>
        <div className="fico-portal-sheet-content min-h-0 space-y-6 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  </>
}
