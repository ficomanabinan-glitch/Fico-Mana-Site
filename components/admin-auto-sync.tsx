'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { syncAdminDatabase } from '@/lib/data-store'

/** Default poll — 3 min keeps Free Fluid CPU low when Filtering/admin stays open. */
export const DEFAULT_SYNC_INTERVAL_MS = 3 * 60_000

type AdminAutoSyncContextValue = {
  syncing: boolean
  lastSyncedAt: Date | null
  lastMessage: string | null
  lastOk: boolean | null
  syncNow: () => Promise<void>
}

const AdminAutoSyncContext = createContext<AdminAutoSyncContextValue | null>(null)

export function AdminAutoSyncProvider({
  enabled,
  children,
  /** Override poll interval (ms). Still pauses when the tab is hidden. */
  intervalMs = DEFAULT_SYNC_INTERVAL_MS,
}: {
  enabled: boolean
  children: React.ReactNode
  intervalMs?: number
}) {
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [lastMessage, setLastMessage] = useState<string | null>(null)
  const [lastOk, setLastOk] = useState<boolean | null>(null)
  const running = useRef(false)

  const syncNow = useCallback(async () => {
    if (!enabled || running.current) return
    running.current = true
    setSyncing(true)
    try {
      const result = await syncAdminDatabase()
      setLastSyncedAt(new Date())
      setLastOk(result.ok)
      setLastMessage(result.message ?? (result.ok ? 'Synced' : 'Sync unavailable'))
      if (result.ok) {
        window.dispatchEvent(new CustomEvent('admin:db-synced', { detail: result }))
      }
    } catch {
      setLastOk(false)
      setLastMessage('Sync failed')
    } finally {
      setSyncing(false)
      running.current = false
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    let intervalId: ReturnType<typeof setInterval> | null = null

    const clear = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const arm = () => {
      clear()
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      // Skip polling while the tab is hidden — biggest Free-tier CPU saver.
      if (hidden) return
      intervalId = setInterval(syncNow, intervalMs)
    }

    const onVisibility = () => {
      arm()
      if (document.visibilityState === 'visible') {
        void syncNow()
      }
    }

    syncNow()
    arm()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clear()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, syncNow, intervalMs])

  return (
    <AdminAutoSyncContext.Provider value={{ syncing, lastSyncedAt, lastMessage, lastOk, syncNow }}>
      {children}
    </AdminAutoSyncContext.Provider>
  )
}

export function useAdminAutoSync() {
  const ctx = useContext(AdminAutoSyncContext)
  if (!ctx) {
    return {
      syncing: false,
      lastSyncedAt: null,
      lastMessage: null,
      lastOk: null,
      syncNow: async () => {},
    }
  }
  return ctx
}

/** Re-fetch page data whenever background sync completes. */
export function useOnAdminDbSync(callback: () => void) {
  const cb = useRef(callback)
  cb.current = callback

  useEffect(() => {
    const handler = () => cb.current()
    window.addEventListener('admin:db-synced', handler)
    return () => window.removeEventListener('admin:db-synced', handler)
  }, [])
}
