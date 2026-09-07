'use client'

import { adminSubtitle, adminTitle } from '@/lib/admin-ui'
import { useAdminAutoSync } from '@/components/admin-auto-sync'
import { WorkspaceRefreshButton } from '@/components/workspace-refresh'

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
        <p className="text-caption font-semibold tracking-label text-[#C4CEFF] uppercase">FICO Mana</p>
        <h1 className={adminTitle}>{title}</h1>
        {subtitle && <p className={adminSubtitle}>{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {onRefresh && (
          <WorkspaceRefreshButton onRefresh={handleRefresh} refreshing={refreshing || syncing} />
        )}
        {children}
      </div>
    </div>
  )
}
