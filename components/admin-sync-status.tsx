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
    ? lastMessage
      ? `${lastMessage} — manual sync required`
      : 'Manual sync required — click Sync to retry'
    : timeLabel
      ? `Last synced ${timeLabel} — click to sync now`
      : 'Sync records now'

  return (
    <button
      type="button"
      onClick={() => syncNow()}
      disabled={syncing}
      className={`inline-flex items-center gap-2 px-3 py-2 ${adminBtnGhost}`}
      title={title}
      aria-label={syncing ? 'Syncing records' : failed ? 'Manual sync required' : 'Sync records'}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          syncing ? 'bg-amber-400 animate-pulse' : failed ? 'bg-red-500' : 'bg-green-400'
        }`}
        aria-hidden
      />
      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline" aria-live="polite">
        {syncing ? 'Syncing…' : 'Sync'}
      </span>
    </button>
  )
}
