'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import styles from './portal-workspace.module.css'

export default function PortalOverview({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<button type="button" className={styles.overviewButton} />}>Overview</SheetTrigger>
    <SheetContent side="right" initialFocus={title} className="client-portal !w-full !max-w-[440px] gap-0 overflow-hidden rounded-l-[20px] border-white/[0.12] bg-[#181819] text-white shadow-[inset_0_1px_rgba(255,255,255,0.06),-24px_0_80px_rgba(0,0,0,0.24)]" overlayClassName="bg-black/65">
      <SheetHeader className="border-b border-white/[0.08] p-5 pr-14"><SheetTitle ref={title} tabIndex={-1} className="font-sans text-[22px] font-semibold tracking-[-0.025em] text-white outline-none">Overview</SheetTitle><SheetDescription className="sr-only">Client, package, payments, portal QR, and access details.</SheetDescription></SheetHeader>
      <div className={`${styles.overviewContent} ${styles.portal}`}>{children}</div>
    </SheetContent>
  </Sheet>
}
