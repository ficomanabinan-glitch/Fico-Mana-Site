'use client'

import { RefreshCw } from 'lucide-react'
import { adminBtnGhost, adminSubtitle, adminTitle } from '@/lib/admin-ui'
import { useAdminAutoSync } from '@/components/admin-auto-sync'

type Props = {
  title: string
  subtitle?: string
  onRefresh?: () => void
  refreshing?: boolean
  children?: React.ReactNode
}

export default function AdminPageHeader({ title, subtitle, onRefresh, refreshing, children }: Props) {
  const { syncing, syncNow } = useAdminAutoSync()

  const handleRefresh = async () => {
    await syncNow()
    onRefresh?.()
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-1">
      <div className="space-y-1">
        <p className="text-[10px] font-bold tracking-[0.2em] text-[#C4CEFF] uppercase">FICO Mana</p>
        <h1 className={adminTitle}>{title}</h1>
        {subtitle && <p className={adminSubtitle}>{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || syncing}
            className={`inline-flex items-center gap-2 px-4 py-2.5 ${adminBtnGhost}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing || syncing ? 'animate-spin' : ''}`} />
            {refreshing || syncing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
