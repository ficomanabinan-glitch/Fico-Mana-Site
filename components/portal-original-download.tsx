'use client'

import { useState } from 'react'
import { Download, Send } from 'lucide-react'
import type { PortalRawDownloadAccess } from '@/lib/portal-raw-downloads'
import { clientPhotoFolderName, downloadPortalPhotoFolder, type FolderTransferProgress } from '@/lib/portal-folder-transfer'

const primary = 'min-h-11 rounded-control bg-primary px-4 py-2.5 text-caption font-semibold text-white transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-[#0903e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:pointer-events-none disabled:opacity-45'
const secondary = 'min-h-11 rounded-control border border-white/12 bg-white/[0.035] px-4 py-2.5 text-caption font-semibold text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/60 disabled:pointer-events-none disabled:opacity-45'

export function formatDownloadSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / (1024 ** exponent)
  return `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: exponent > 1 ? 1 : 0 }).format(value)} ${units[exponent]}`
}

export default function PortalOriginalDownload({
  total,
  totalBytes,
  customerName,
  bookingReference,
  access,
  downloadUrl,
  requestUrl,
  onAccessChanged,
  onDemoRequest,
  onDemoDownload,
}: {
  total: number
  totalBytes: number
  customerName: string
  bookingReference: string
  access: PortalRawDownloadAccess | null
  downloadUrl: string | null
  requestUrl: string | null
  onAccessChanged: () => Promise<void>
  onDemoRequest?: (reason: string) => void
  onDemoDownload?: () => void
}) {
  const [requestOpen, setRequestOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [progress, setProgress] = useState<FolderTransferProgress | null>(null)
  const [message, setMessage] = useState('')
  if (!access || !requestUrl) return null

  const pending = access.requestStatus === 'PENDING'
  const granted = access.requestStatus === 'GRANTED'
  const retrying = access.requestStatus === 'RESERVED' || access.activeDownloads > 0
  const usedDownloads = Math.min(access.limit, access.completedInWindow + access.activeDownloads)
  const downloadSize = formatDownloadSize(totalBytes)
  const folderName = clientPhotoFolderName(customerName, bookingReference)

  async function saveFolder() {
    if (!downloadUrl || starting) return
    if (onDemoDownload) { onDemoDownload(); return }
    setStarting(true)
    setProgress(null)
    setMessage('')
    try {
      const result = await downloadPortalPhotoFolder(downloadUrl, customerName, bookingReference, setProgress)
      if (!result) return
      setMessage(`${result.savedFiles} photos saved in “${folderName}” (${formatDownloadSize(result.totalBytes)}).`)
    } catch (error) {
      setMessage(`${error instanceof Error ? error.message : 'The photo transfer stopped.'} Some photos may already be in “${folderName}”. Choose the same save location to retry.`)
    } finally {
      setStarting(false)
      await onAccessChanged().catch(() => undefined)
    }
  }

  async function submitRequest() {
    const clean = reason.trim()
    if (clean.length < 5) {
      setMessage('Please add a short reason (at least 5 characters).')
      return
    }
    setSending(true)
    setMessage('')
    try {
      if (onDemoRequest) {
        onDemoRequest(clean)
        setRequestOpen(false)
        setReason('')
        setMessage('Request sent. The studio can now review your reason.')
        return
      }
      const response = await fetch(requestUrl!, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: clean }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'The request could not be sent.')
      setRequestOpen(false)
      setReason('')
      setMessage('Request sent. The studio can now review your reason.')
      await onAccessChanged()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The request could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="fico-card border border-white/10 bg-white/[0.02] shadow-[inset_0_1px_rgba(255,255,255,0.04)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-card-title font-semibold tracking-heading">Your original photos</h2>
          <p className="mt-1 text-caption leading-relaxed text-white/45">
            Save all {total} originals{downloadSize ? ` (about ${downloadSize})` : ''} as “{folderName}” in desktop Chrome or Edge. To save in Downloads, create and select a folder inside it—Chrome blocks selecting Downloads itself. Up to {access.limit} transfers every 7 days.
          </p>
          <p className="mt-2 text-caption text-white/35">{usedDownloads} of {access.limit} downloads used{access.activeDownloads > 0 ? ' · Finalizing current transfer' : ''}</p>
        </div>
        {downloadUrl ? (
          <button type="button" disabled={starting} className={`${primary} inline-flex shrink-0 items-center justify-center gap-2`} onClick={() => void saveFolder()}>
            <Download className="size-3.5" strokeWidth={1.5} />
            {starting ? 'Saving photos…' : retrying ? 'Save folder again' : granted ? 'Use granted download' : 'Save photo folder'}
          </button>
        ) : pending ? (
          <button type="button" className={secondary} disabled>
            Download request sent
          </button>
        ) : (
          <button type="button" className={secondary} onClick={() => setRequestOpen(true)}>
            Request another download access
          </button>
        )}
      </div>
      {progress && starting ? <div className="mt-4" role="status" aria-live="polite"><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#929fff] transition-[width]" style={{ width: `${Math.min(100, (progress.writtenBytes / Math.max(1, progress.totalBytes)) * 100)}%` }} /></div><p className="mt-2 text-caption text-white/55">{formatDownloadSize(progress.writtenBytes)} of {formatDownloadSize(progress.totalBytes)} · {progress.savedFiles} of {progress.totalFiles} photos saved</p></div> : null}

      {requestOpen ? (
        <div className="mt-5 rounded-control border border-white/10 bg-black/20 p-4">
          <label htmlFor="download-request-reason" className="text-caption font-semibold text-white/80">Reason</label>
          <textarea
            id="download-request-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 500))}
            rows={3}
            autoFocus
            placeholder="Tell the studio why you need another download."
            className="mt-2 w-full resize-y rounded-control border border-white/12 bg-white/[0.04] px-3.5 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-[#C4CEFF]/50 focus:ring-2 focus:ring-[#C4CEFF]/15"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-white/35">{reason.length}/500 characters</p>
            <div className="flex gap-2">
              <button type="button" className={secondary} onClick={() => { setRequestOpen(false); setMessage('') }}>Cancel</button>
              <button type="button" className={`${primary} inline-flex items-center gap-2`} disabled={sending || reason.trim().length < 5} onClick={() => void submitRequest()}>
                <Send className="size-3.5" strokeWidth={1.5} />{sending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-caption leading-relaxed text-[#C4CEFF]" role="status">{message}</p> : null}
    </section>
  )
}
