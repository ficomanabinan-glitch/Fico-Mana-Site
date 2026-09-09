'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import styles from './portal-workspace.module.css'

export default function PortalOverview({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const title = useRef<HTMLHeadingElement>(null)
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<button type="button" className={styles.overviewButton} />}>Overview</SheetTrigger>
    <SheetContent side="right" initialFocus={title} className="client-portal !w-full !max-w-[440px] gap-0 overflow-hidden rounded-l-card border-white/10 bg-[#222] text-white" overlayClassName="bg-black/65">
      <SheetHeader className="border-b border-white/10 p-6 pr-14"><SheetTitle ref={title} tabIndex={-1} className="text-3xl text-white outline-none">Overview</SheetTitle><SheetDescription className="sr-only">Client, package, payments, portal QR, and access details.</SheetDescription></SheetHeader>
      <div className={`${styles.overviewContent} ${styles.portal}`}>{children}</div>
    </SheetContent>
  </Sheet>
}
