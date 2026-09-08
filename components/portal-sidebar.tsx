'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronUp, WalletCards } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/** Keep the same summary/QR content accessible without covering the mobile gallery. */
export default function PortalSidebar({ children, remaining }: { children: ReactNode; remaining: string }) {
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
      className="fico-portal-sidebar hidden min-w-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/50 xl:block xl:pr-6 2xl:pr-8">
      {children}
    </aside>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<button type="button"
        aria-label={`Open client details. Remaining balance: ${remaining}`}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 rounded-control border border-white/10 bg-white/[0.03] px-4 text-left text-white outline-none transition hover:border-[#C4CEFF]/30 hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 xl:hidden" />}>
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
