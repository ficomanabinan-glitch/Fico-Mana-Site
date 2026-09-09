'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { canPrefetchPortalPhotos, PortalPreviewCache } from '@/lib/portal-preview-cache'

const PreviewContext = createContext<PortalPreviewCache | null>(null)
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string }
const connection = () => (navigator as Navigator & { connection?: Connection }).connection

export function PortalPreviewProvider({ scope, sources, expiresAt, children }: { scope: string; sources: string[]; expiresAt?: string | null; children: ReactNode }) {
  // A changed portal/reopening must get a separate cache, even when its image URLs are identical.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cache = useMemo(() => new PortalPreviewCache(), [scope])
  useEffect(() => {
    let ready = false
    const network = connection()
    const update = () => cache.setBackgroundEnabled(ready && (!expiresAt || Date.parse(expiresAt) > Date.now()) && document.readyState === 'complete' && document.visibilityState === 'visible' && canPrefetchPortalPhotos(network))
    cache.setBackgroundEnabled(false)
    const timer = setTimeout(() => { ready = true; update() }, 1200)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('load', update)
    network?.addEventListener('change', update)
    return () => { clearTimeout(timer); cache.clear(); document.removeEventListener('visibilitychange', update); window.removeEventListener('load', update); network?.removeEventListener('change', update) }
  }, [cache, expiresAt])
  useEffect(() => {
    // First page is bounded to 48; visible/pointed-at photos also get priority below.
    sources.slice(0, 24).forEach(source => { void cache.load(source) })
  }, [cache, sources])
  useEffect(() => {
    if (!expiresAt) return
    const remaining = new Date(expiresAt).getTime() - Date.now()
    if (!Number.isFinite(remaining) || remaining > 2_147_483_647) return
    const timer = setTimeout(() => { cache.setBackgroundEnabled(false); cache.clear() }, Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [cache, expiresAt])
  return <PreviewContext.Provider value={cache}>{children}</PreviewContext.Provider>
}

export function useWarmPortalPreview() {
  const cache = useContext(PreviewContext)
  return useCallback((source: string) => { if (canPrefetchPortalPhotos(connection())) void cache?.load(source) }, [cache])
}

/** A requested zoom joins an in-flight prefetch rather than downloading the same image twice. */
export function usePortalPreviewSource(source: string | undefined) {
  const cache = useContext(PreviewContext)
  const [resolved, setResolved] = useState<{ source: string; url: string } | null>(null)
  useEffect(() => {
    if (!source || !cache) return
    let active = true
    const release = cache.retain(source)
    const unsubscribe = cache.subscribe(() => {
      if (active) setResolved(previous => {
        const url = cache.peek(source) || ''
        return previous?.source === source && previous.url === url ? previous : { source, url }
      })
    })
    void cache.load(source, true).then(url => { if (active) setResolved({ source, url: url || source }) })
    return () => { active = false; unsubscribe(); release() }
  }, [cache, source])
  if (!source) return undefined
  if (!cache || !source.endsWith('?kind=gallery')) return source
  // Never reuse a stale/revoked object URL after closing and reopening a viewer.
  return cache.peek(source) || (resolved?.source === source && resolved.url === source ? source : undefined)
}
