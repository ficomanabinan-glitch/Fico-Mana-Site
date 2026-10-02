'use client'

import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { startPrivateAttachmentDownload } from '@/lib/private-attachment-download'
import styles from './portal-workspace.module.css'

export default function PortalSinglePhotoDownload({ publicId, fileId, kind, fileName, compact = false, overlay = false }: {
  publicId: string
  fileId: string
  kind: 'original' | 'deliverable'
  fileName: string
  compact?: boolean
  overlay?: boolean
}) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  async function download() {
    if (starting) return
    setStarting(true)
    setError('')
    try {
      await startPrivateAttachmentDownload(`/api/editor-workflow/portal/${encodeURIComponent(publicId)}/single-photo/${encodeURIComponent(fileId)}?kind=${kind}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'This photo could not be downloaded. Try again.')
    } finally {
      setStarting(false)
    }
  }
  return <span className={overlay ? styles.photoDownload : 'inline-flex min-w-0 flex-col gap-1'}>
    <button type="button" aria-label={`Download ${fileName}`} title={starting ? 'Preparing download…' : `Download ${fileName}`} aria-busy={starting} disabled={starting} onClick={event => { event.stopPropagation(); void download() }}
      className={overlay ? styles.photoDownloadButton : `inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-white/15 bg-white/[0.04] px-3 text-caption font-semibold text-white/85 hover:border-white/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:opacity-50 ${compact ? 'w-fit' : ''}`}>
      {starting ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
      {overlay ? <span className="sr-only" role="status">{starting ? 'Preparing download…' : ''}</span> : starting ? 'Preparing…' : compact ? 'Download' : 'Download this photo'}
    </button>
    {error ? <small role="alert" className={overlay ? styles.photoDownloadError : 'max-w-60 text-caption text-red-200'}>{error}</small> : null}
  </span>
}
