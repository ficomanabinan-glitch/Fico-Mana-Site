'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronUp, WalletCards } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/** Keep the same summary/QR content accessible without covering the mobile gallery. */
export default function PortalSidebar({ children, remaining }: { children: ReactNode; remaining: string }) {
  const [open, setOpen] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  return <>
    <aside aria-label="Payment summary and portal QR" tabIndex={0}
      className="fico-portal-sidebar hidden min-w-0 space-y-6 outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/50 lg:block">
      {children}
    </aside>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<button type="button"
        aria-label={`Open payment summary and portal QR. Remaining: ${remaining}`}
        className="fico-portal-dock fixed inset-x-0 bottom-0 z-40 flex w-full cursor-pointer items-center justify-between gap-4 border-t border-white/15 bg-[#171717] px-4 text-left text-white shadow-[0_-8px_28px_rgba(0,0,0,0.25)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C4CEFF]/70 lg:hidden" />}>
        <span className="min-w-0"><span className="flex items-center gap-2 text-caption font-semibold text-[#C4CEFF]"><WalletCards className="size-4 shrink-0" />Payment Summary</span><span className="mt-1 block text-caption text-white/50">Remaining <strong className="ml-1 font-semibold text-white">{remaining}</strong></span></span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-semibold text-[#C4CEFF]">Summary &amp; QR<ChevronUp className="size-4" /></span>
      </SheetTrigger>
      <SheetContent side="bottom" initialFocus={title} className="client-portal max-h-[85dvh] gap-0 overflow-hidden rounded-t-card border-white/15 bg-[#171717] text-white lg:hidden" overlayClassName="bg-black/70 lg:hidden">
        <SheetHeader className="shrink-0 border-b border-white/10 p-4 pr-14">
          <SheetTitle ref={title} tabIndex={-1} className="font-sans text-sm font-semibold text-white outline-none">Payment Summary &amp; Portal QR</SheetTitle>
          <SheetDescription className="sr-only">Your booking totals, remaining balance, and shareable portal QR.</SheetDescription>
        </SheetHeader>
        <div className="fico-portal-sheet-content min-h-0 space-y-6 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  </>
}
