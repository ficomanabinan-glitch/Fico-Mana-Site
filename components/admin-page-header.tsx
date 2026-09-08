'use client'

import { adminSubtitle, adminTitle } from '@/lib/admin-ui'

type Props = {
  title: string
  subtitle?: string
  onRefresh?: () => void
  refreshing?: boolean
  children?: React.ReactNode
}

export default function AdminPageHeader({ title, subtitle, children }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-1">
      <div className="space-y-1">
        <p className="text-caption font-semibold tracking-label text-[#C4CEFF] uppercase">FICO Mana</p>
        <h1 className={adminTitle}>{title}</h1>
        {subtitle && <p className={adminSubtitle}>{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {children}
      </div>
    </div>
  )
}
