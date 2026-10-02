'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Clock3, Download, RefreshCw } from 'lucide-react'
import { adminBtnGhost, adminEmptyState, adminPanel, adminSpinner } from '@/lib/admin-ui'
import type { PortalRawDownloadRequest } from '@/lib/portal-raw-downloads'
import { useAdminToast } from '@/components/admin-toast-provider'

function requestedLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function DownloadRequestsPanel({ bookingId = '', onCountChange }: {
  bookingId?: string
  onCountChange?: (count: number) => void
}) {
  const toast = useAdminToast()
  const [requests, setRequests] = useState<PortalRawDownloadRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [grantingId, setGrantingId] = useState('')
  const [loadError, setLoadError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const readSequence = useRef(0)
  const scopedBooking = /^FM-(?:\d{6}|W[A-Z0-9-]{1,40})$/i.test(bookingId) && !showAll ? bookingId : ''
  const visibleRequests = scopedBooking ? requests.filter(request => request.bookingId === scopedBooking) : requests

  const load = useCallback(async (silent = false) => {
    const sequence = ++readSequence.current
    if (!silent) setLoading(true)
    try {
      const response = await fetch('/api/editor-workflow/download-requests', { cache: 'no-store', credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as { requests?: PortalRawDownloadRequest[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load download requests.')
      if (!Array.isArray(body.requests)) throw new Error('The download request list could not be read.')
      if (sequence !== readSequence.current) return
      const next = body.requests
      setRequests(next)
      setLoadError('')
      onCountChange?.(next.length)
    } catch (error) {
      if (sequence !== readSequence.current) return
      const message = error instanceof Error ? error.message : 'Could not load download requests.'
      setLoadError(message)
    } finally {
      if (sequence === readSequence.current) setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    void load()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void load(true)
    }
    const timer = window.setInterval(refreshWhenVisible, 15_000)
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('online', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('online', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      readSequence.current += 1
    }
  }, [load])

  async function grant(request: PortalRawDownloadRequest) {
    setGrantingId(request.id)
    try {
      const response = await fetch(`/api/editor-workflow/download-requests/${encodeURIComponent(request.id)}/grant`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}',
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Access could not be granted.')
      readSequence.current += 1
      setLoading(false)
      setLoadError('')
      const next = requests.filter((item) => item.id !== request.id)
      setRequests(next)
      onCountChange?.(next.length)
      toast.success('Download access granted', `${request.customerName} can download the originals one more time.`)
    } catch (error) {
      toast.error('Grant failed', error instanceof Error ? error.message : 'Access could not be granted.')
    } finally {
      setGrantingId('')
    }
  }

  return (
    <section className={`${adminPanel} overflow-hidden`} aria-labelledby="download-requests-title">
      <header className="flex flex-col gap-3 border-b border-white/[0.08] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="download-requests-title" className="text-base font-semibold text-white">Download requests</h2>
          <p className="mt-1 text-caption leading-relaxed text-white/45">Read the client&apos;s reason before granting one additional originals download.</p>
          {scopedBooking ? <p className="mt-2 text-sm text-[#C4CEFF]">Requests for {scopedBooking}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {scopedBooking ? <button type="button" onClick={() => setShowAll(true)} className={`${adminBtnGhost} min-h-11 px-3 py-2`}>Show all download requests</button> : null}
          <button type="button" onClick={() => void load()} className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2 ${adminBtnGhost}`} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="m-5 flex flex-col gap-3 rounded-control border border-red-400/25 bg-red-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div className="flex min-w-0 items-start gap-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-200" />
            <div className="min-w-0"><p className="text-sm font-semibold text-red-100">Download requests unavailable</p><p className="mt-1 break-words text-sm leading-relaxed text-red-100/80">{loadError} Try again to check the queue.</p></div>
          </div>
          <button type="button" onClick={() => void load()} className={`${adminBtnGhost} shrink-0 px-3 py-2`} disabled={loading}>Try again</button>
        </div>
      ) : null}
      {loading ? (
        <div className="flex min-h-56 items-center justify-center"><div className={adminSpinner} /></div>
      ) : visibleRequests.length === 0 && !loadError ? (
        <div className={`${adminEmptyState} m-5 min-h-56`}>
          <Download className="size-7 text-white/25" />
          <p className="text-sm font-medium text-white/70">{scopedBooking ? `No pending download request for ${scopedBooking}` : 'No download requests'}</p>
          <p className="max-w-sm text-center text-caption leading-relaxed text-white/60">Clients appear here after requesting another originals download.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.07]">
          {visibleRequests.map((request) => (
            <article key={request.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.5fr)_auto] lg:items-center">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-white">{request.customerName}</h3>
                <p className="mt-1 font-mono text-caption text-[#C4CEFF]">{request.bookingId}</p>
                <p className="mt-1 text-caption text-white/40">{[request.packageName, request.shootDate].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="min-w-0 rounded-control border border-white/[0.08] bg-black/15 p-3.5">
                <p className="text-caption font-semibold uppercase tracking-wider text-white/35">Client reason</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/75">{request.reason}</p>
                <p className="mt-3 flex items-center gap-1.5 text-caption text-white/35"><Clock3 className="size-3" />{requestedLabel(request.requestedAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => void grant(request)}
                disabled={Boolean(grantingId)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 py-2.5 text-caption font-semibold text-white transition-colors hover:bg-[#0903e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:opacity-45"
              >
                <Check className="size-3.5" />{grantingId === request.id ? 'Granting…' : 'Grant access'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
