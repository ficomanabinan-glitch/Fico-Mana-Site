'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { startPrivateAttachmentDownload } from '@/lib/private-attachment-download'

export default function PortalSinglePhotoDownload({ publicId, fileId, kind, fileName, compact = false }: {
  publicId: string
  fileId: string
  kind: 'original' | 'deliverable'
  fileName: string
  compact?: boolean
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
  return <span className="inline-flex min-w-0 flex-col gap-1">
    <button type="button" aria-label={`Download ${fileName}`} disabled={starting} onClick={() => void download()}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-white/15 bg-white/[0.04] px-3 text-caption font-semibold text-white/85 hover:border-white/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:opacity-50 ${compact ? 'w-fit' : ''}`}>
      <Download className="size-3.5" aria-hidden="true" />{starting ? 'Preparing…' : compact ? 'Download' : 'Download this photo'}
    </button>
    {error ? <small role="alert" className="max-w-60 text-caption text-red-200">{error}</small> : null}
  </span>
}
