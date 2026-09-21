'use client'

import { useState } from 'react'
import { Download, Send } from 'lucide-react'
import type { PortalRawDownloadAccess } from '@/lib/portal-raw-downloads'

const primary = 'min-h-11 rounded-control bg-primary px-4 py-2.5 text-caption font-semibold text-white transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-[#0903e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:pointer-events-none disabled:opacity-45'
const secondary = 'min-h-11 rounded-control border border-white/12 bg-white/[0.035] px-4 py-2.5 text-caption font-semibold text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/60 disabled:pointer-events-none disabled:opacity-45'

export default function PortalOriginalDownload({
  total,
  access,
  downloadUrl,
  requestUrl,
  onAccessChanged,
  onDemoRequest,
  onDemoDownload,
}: {
  total: number
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
  const [message, setMessage] = useState('')
  if (!access || !requestUrl) return null

  const pending = access.requestStatus === 'PENDING'
  const reserved = access.requestStatus === 'RESERVED' || access.activeDownloads > 0
  const granted = access.requestStatus === 'GRANTED'

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
            Download all {total} originals up to {access.limit} times from this portal.
          </p>
          <p className="mt-2 text-caption text-white/35">{access.completedInWindow} of {access.limit} downloads used</p>
        </div>
        {reserved ? (
          <button type="button" className={secondary} disabled>Download in progress</button>
        ) : downloadUrl ? (
          <a
            href={downloadUrl}
            className={`${primary} inline-flex shrink-0 items-center justify-center gap-2`}
            onClick={(event) => {
              if (onDemoDownload) {
                event.preventDefault()
                onDemoDownload()
                return
              }
              window.setTimeout(() => void onAccessChanged(), 2500)
            }}
          >
            <Download className="size-3.5" strokeWidth={1.5} />
            {granted ? 'Use granted download' : 'Download all originals'}
          </a>
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
