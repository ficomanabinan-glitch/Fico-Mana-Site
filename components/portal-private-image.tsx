'use client'

import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import styles from './portal-workspace.module.css'

/** Private endpoints must keep their cookies and bypass the public optimizer. */
export default function PortalPrivateImage({ src, alt, fit = 'cover', eager = false }: {
  src: string; alt: string; fit?: 'cover' | 'contain'; eager?: boolean
}) {
  const [loadedSource, setLoadedSource] = useState('')
  const [failedSource, setFailedSource] = useState('')
  const loaded = loadedSource === src
  const failed = failedSource === src
  return <span className={styles.image} data-loaded={loaded} data-fit={fit} aria-busy={!loaded && !failed}>
    {!loaded && !failed ? <span className={styles.skeleton} role="status"><span className="sr-only">Loading {alt}</span></span> : null}
    {failed ? <span className={styles.imageError} role="status"><ImageOff size={20} aria-hidden="true" />Photo unavailable</span> :
      // eslint-disable-next-line @next/next/no-img-element -- Authenticated image must not pass through a public cache.
      <img key={src} src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false}
        onLoad={() => setLoadedSource(src)} onError={() => setFailedSource(src)} />}
  </span>
}
