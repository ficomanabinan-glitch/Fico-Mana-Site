'use client'

import { RefreshCw } from 'lucide-react'
import { useAdminAutoSync } from '@/components/admin-auto-sync'
import { adminBtnGhost } from '@/lib/admin-ui'

export default function AdminSyncStatus() {
  const { syncing, lastSyncedAt, lastMessage, lastOk, syncNow } = useAdminAutoSync()
  const failed = !syncing && lastOk === false

  const timeLabel = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  const title = failed
    ? lastMessage || 'Sync failed — click to retry'
    : timeLabel
      ? `Last synced ${timeLabel}`
      : 'Click to sync with the database now'

  return (
    <button
      type="button"
      onClick={() => syncNow()}
      disabled={syncing}
      className={`inline-flex items-center gap-2 px-3 py-2 ${adminBtnGhost}`}
      title={title}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          syncing ? 'bg-amber-400 animate-pulse' : failed ? 'bg-amber-500' : 'bg-green-400'
        }`}
        aria-hidden
      />
      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">
        {syncing ? 'Syncing…' : failed ? 'Sync issue' : 'Auto-sync'}
      </span>
    </button>
  )
}
