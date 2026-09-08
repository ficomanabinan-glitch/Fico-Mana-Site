'use client'

import { useRef, useState, type ReactNode } from 'react'
import { PanelRight, WalletCards } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * Secondary project information is deliberately progressive disclosure.
 * The photography workspace stays dominant while booking/payment/QR context
 * remains one tap away on every viewport.
 */
export default function PortalSidebar({ children, remaining }: {
  children: ReactNode
  remaining: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={`Open overview. Remaining balance: ${remaining}`}
            className="portal-overview-trigger"
          />
        }
      >
        <PanelRight className="size-4 shrink-0" aria-hidden="true" />
        <span className="portal-overview-label">Overview</span>
      </SheetTrigger>

      <SheetContent
        side="right"
        initialFocus={title}
        className="client-portal w-[min(92vw,28rem)] max-w-none gap-0 overflow-hidden border-l border-white/10 bg-[#111111] p-0 text-white"
        overlayClassName="bg-black/75 backdrop-blur-[2px]"
      >
        <SheetHeader className="shrink-0 border-b border-white/[0.08] px-5 py-5 pr-14 sm:px-6">
          <div className="flex items-center gap-2 text-[#C4CEFF]">
            <WalletCards className="size-4" aria-hidden="true" />
            <span className="portal-kicker">Project information</span>
          </div>
          <SheetTitle
            ref={title}
            tabIndex={-1}
            className="mt-2 font-serif text-3xl font-medium tracking-[-0.02em] text-white outline-none"
          >
            Overview
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs leading-relaxed text-white/45">
            Booking, selection, payment, and private access details for this project.
          </SheetDescription>
        </SheetHeader>

        <div className="portal-overview-content min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
