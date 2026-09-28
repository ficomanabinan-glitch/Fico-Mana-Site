'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { usePortalCachedImage } from '@/components/portal-preview-cache'
import styles from './portal-workspace.module.css'

/** Private endpoints must keep their cookies and bypass the public optimizer. */
export default function PortalPrivateImage({ src, alt, fit = 'cover', eager = false }: {
  src: string; alt: string; fit?: 'cover' | 'contain'; eager?: boolean
}) {
  const [loadedSource, setLoadedSource] = useState('')
  const [failedSource, setFailedSource] = useState('')
  const [visible, setVisible] = useState(eager)
  const [attempt, setAttempt] = useState(0)
  const element = useRef<HTMLSpanElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const cached = usePortalCachedImage(src, visible || eager, attempt)
  const imageSource = cached.url
  const failed = cached.failed || (!!imageSource && failedSource === imageSource)
  useEffect(() => {
    // An SSR image may finish before React attaches onLoad during hydration.
    const photo = image.current
    if (photo?.complete && photo.naturalWidth > 0 && imageSource) setLoadedSource(imageSource)
  }, [imageSource])
  useEffect(() => {
    if (eager || !element.current) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting))
    }, { rootMargin: '160px' })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [eager])
  useEffect(() => {
    if (!failed || !(visible || eager) || attempt >= 3) return
    const timer = setTimeout(() => { setFailedSource(''); setAttempt(value => value + 1) }, [5_000, 30_000, 300_000][attempt])
    return () => clearTimeout(timer)
  }, [failed, visible, eager, attempt])
  const directSource = !cached.managed && attempt > 0 && src.startsWith('/')
    ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : imageSource
  const loaded = !!directSource && loadedSource === directSource
  return <span ref={element} onPointerEnter={() => setVisible(true)} className={styles.image} data-loaded={loaded} data-fit={fit} aria-busy={!loaded && !failed}>
    {!loaded && !failed ? <span className={styles.skeleton} role="status"><span className="sr-only">Loading {alt}</span></span> : null}
    {failed ? <span className={styles.imageError} role="status"><ImageOff size={20} aria-hidden="true" />Photo unavailable{attempt < 3 ? ' · Retrying photo…' : ''}</span> :
      // eslint-disable-next-line @next/next/no-img-element -- Authenticated image must not pass through a public cache.
      imageSource ? <img ref={image} key={directSource} src={directSource} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false}
        onLoad={() => setLoadedSource(directSource || '')} onError={() => setFailedSource(imageSource)} /> : null}
  </span>
}
