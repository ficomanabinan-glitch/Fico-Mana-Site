'use client'
import { useEffect, useRef } from 'react'

type Revision = { generation: number; reopenedAt: string | null; galleryCount: number; expiresAt?: string | null; firstDownloadAt?: string | null }
export function usePortalPhotoSync(publicId: string, revision: Revision | null, onReset: () => void, onChange: () => Promise<void>) {
  const latest = useRef({ revision, onReset, onChange })
  latest.current = { revision, onReset, onChange }
  useEffect(() => {
    if (!publicId) return
    let disposed = false, inFlight = false, wasResetting = false
    const controller = new AbortController()
    const check = async () => {
      if (disposed || inFlight || document.visibilityState !== 'visible') return
      inFlight = true
      try {
        const response = await fetch(`/api/editor-workflow/portal/${encodeURIComponent(publicId)}/photo-revision`, { cache: 'no-store', credentials: 'include', signal: controller.signal })
        if (!response.ok) return // A temporary read failure must not empty a usable gallery.
        const next = await response.json() as Revision & { resetting: boolean }
        if (disposed) return
        if (next.resetting) { wasResetting = true; latest.current.onReset(); return }
        const old = latest.current.revision
        if (wasResetting || old && (old.generation !== next.generation || old.reopenedAt !== next.reopenedAt || old.galleryCount !== next.galleryCount ||
          (old.expiresAt || null) !== (next.expiresAt || null) || (old.firstDownloadAt || null) !== (next.firstDownloadAt || null))) {
          await latest.current.onChange()
          wasResetting = false
        }
      } catch { /* Offline or temporary service failure: keep the last known state. */ }
      finally { inFlight = false }
    }
    void check()
    const timer = setInterval(() => void check(), 30_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => { disposed = true; controller.abort(); clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check) }
  }, [publicId])
}
