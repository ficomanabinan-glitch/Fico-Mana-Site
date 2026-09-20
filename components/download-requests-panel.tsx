'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, Download, RefreshCw } from 'lucide-react'
import { adminBtnGhost, adminEmptyState, adminPanel, adminSpinner } from '@/lib/admin-ui'
import type { PortalRawDownloadRequest } from '@/lib/portal-raw-downloads'
import { useAdminToast } from '@/components/admin-toast-provider'

function requestedLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function DownloadRequestsPanel({ onCountChange }: { onCountChange?: (count: number) => void }) {
  const toast = useAdminToast()
  const [requests, setRequests] = useState<PortalRawDownloadRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [grantingId, setGrantingId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/editor-workflow/download-requests', { cache: 'no-store', credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as { requests?: PortalRawDownloadRequest[]; error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load download requests.')
      const next = body.requests || []
      setRequests(next)
      onCountChange?.(next.length)
    } catch (error) {
      toast.error('Requests unavailable', error instanceof Error ? error.message : 'Could not load download requests.')
    } finally {
      setLoading(false)
    }
  }, [onCountChange, toast])

  useEffect(() => { void load() }, [load])

  async function grant(request: PortalRawDownloadRequest) {
    setGrantingId(request.id)
    try {
      const response = await fetch(`/api/editor-workflow/download-requests/${encodeURIComponent(request.id)}/grant`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}',
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Access could not be granted.')
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
        <div>
          <h2 id="download-requests-title" className="text-base font-semibold text-white">Download requests</h2>
          <p className="mt-1 text-caption leading-relaxed text-white/45">Read the client&apos;s reason before granting one additional originals download.</p>
        </div>
        <button type="button" onClick={() => void load()} className={`inline-flex items-center justify-center gap-2 px-3 py-2 ${adminBtnGhost}`} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {loading ? (
        <div className="flex min-h-56 items-center justify-center"><div className={adminSpinner} /></div>
      ) : requests.length === 0 ? (
        <div className={`${adminEmptyState} m-5 min-h-56`}>
          <Download className="size-7 text-white/25" />
          <p className="text-sm font-medium text-white/70">No download requests</p>
          <p className="max-w-sm text-center text-caption leading-relaxed text-white/40">Clients appear here after using both original downloads within seven days.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.07]">
          {requests.map((request) => (
            <article key={request.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.5fr)_auto] lg:items-center">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-white">{request.customerName}</h3>
                <p className="mt-1 font-mono text-caption text-[#C4CEFF]">{request.bookingId}</p>
                <p className="mt-1 text-caption text-white/40">{[request.packageName, request.shootDate].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="rounded-control border border-white/[0.08] bg-black/15 p-3.5">
                <p className="text-caption font-semibold uppercase tracking-wider text-white/35">Client reason</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{request.reason}</p>
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
