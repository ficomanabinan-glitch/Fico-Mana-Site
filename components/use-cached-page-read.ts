'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import { readStaffPage, staffPageCacheGeneration, writeStaffPage } from '@/lib/staff-page-cache'
import { invalidateEditorBatchCache } from '@/lib/editor-read-cache'
import {
  STAFF_BACKGROUND_SYNC_INTERVAL_MS,
  STAFF_BACKGROUND_SYNC_MIN_MS,
} from '@/lib/admin-cache-policy'

function staffPageQueryKey(generation: number, key: string) {
  return ['staff-page', generation, key] as const
}

/** Cache successful read results, not form drafts, File objects, or upload state. */
export function useCachedPageRead<T>(key: string, fallback: T) {
  const queryClient = useQueryClient()
  const generation = staffPageCacheGeneration()
  const initial = () => ({
    key,
    generation,
    data: queryClient.getQueryData<T>(staffPageQueryKey(generation, key)) ?? readStaffPage<T>(key) ?? fallback,
    pending: true,
  })
  const [snapshot, setSnapshot] = useState(initial)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // A date/client change must not paint the previous client's cached response.
  let current = snapshot
  if (snapshot.key !== key || snapshot.generation !== generation) {
    current = initial()
    setSnapshot(current)
  }
  const latest = useRef(current)
  latest.current = current

  const setData = useCallback((value: SetStateAction<T>) => {
    if (!mounted.current || generation !== staffPageCacheGeneration()) return
    const previous = latest.current
    if (previous.key !== key || previous.generation !== generation) return
    const data = typeof value === 'function' ? (value as (old: T) => T)(previous.data) : value
    writeStaffPage(key, data, generation)
    queryClient.setQueryData(staffPageQueryKey(generation, key), data)
    latest.current = { ...previous, data }
    setSnapshot(latest.current)
  }, [key, generation, queryClient])
  const setLoading = useCallback((pending: boolean) => {
    if (!mounted.current || generation !== staffPageCacheGeneration()) return
    const previous = latest.current
    if (previous.key !== key || previous.generation !== generation) return
    latest.current = { ...previous, pending }
    setSnapshot(latest.current)
  }, [key, generation])

  const queryData = queryClient.getQueryData<T>(staffPageQueryKey(generation, key))
  const loading = current.pending && queryData === undefined && readStaffPage<T>(key) === undefined
  return [current.data, setData, loading, setLoading, current.pending] as const
}

/** Quietly refresh visible read-only views; retain their content on failures. */
export function usePageBackgroundSync(refresh: () => void | Promise<unknown>) {
  const callback = useRef(refresh)
  callback.current = refresh
  useEffect(() => {
    let inFlight = false
    let lastStarted = 0
    const run = async () => {
      if (document.visibilityState !== 'visible' || inFlight || Date.now() - lastStarted < STAFF_BACKGROUND_SYNC_MIN_MS) return
      inFlight = true
      lastStarted = Date.now()
      try { await callback.current() } catch { /* Existing content remains available. */ }
      finally { inFlight = false }
    }
    const timer = setInterval(() => void run(), STAFF_BACKGROUND_SYNC_INTERVAL_MS)
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('fico-workflow-refresh')
    if (channel) channel.onmessage = event => {
      if (event.data !== 'photos-changed') return
      invalidateEditorBatchCache()
      lastStarted = 0
      void run()
    }
    window.addEventListener('focus', run)
    window.addEventListener('admin:db-synced', run)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(timer)
      channel?.close()
      window.removeEventListener('focus', run)
      window.removeEventListener('admin:db-synced', run)
      document.removeEventListener('visibilitychange', run)
    }
  }, [])
}
