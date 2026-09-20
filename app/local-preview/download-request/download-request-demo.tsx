'use client'

import { useState } from 'react'
import { ArrowRight, Check, Clock3, RotateCcw } from 'lucide-react'
import PortalOriginalDownload from '@/components/portal-original-download'
import type { PortalRawDownloadAccess } from '@/lib/portal-raw-downloads'

type DemoStatus = 'exhausted' | 'pending' | 'granted' | 'used'

export default function DownloadRequestDemo() {
  const [status, setStatus] = useState<DemoStatus>('exhausted')
  const [reason, setReason] = useState('')
  const [requestedAt, setRequestedAt] = useState('')
  const access: PortalRawDownloadAccess = {
    allowed: status === 'granted',
    completedInWindow: 2,
    activeDownloads: 0,
    limit: 2,
    requestStatus: status === 'pending' ? 'PENDING' : status === 'granted' ? 'GRANTED' : 'AVAILABLE',
    nextAvailableAt: null,
  }

  return (
    <main className="min-h-screen bg-[#181818] px-4 py-8 text-white selection:bg-[#9aaaff]/30 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Download access</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">Try the client request and staff approval flow. This sample uses no real account, booking, or files.</p>
          </div>
          <button
            type="button"
            onClick={() => { setStatus('exhausted'); setReason(''); setRequestedAt('') }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-white/15 px-4 text-sm font-medium text-white/75 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]"
          >
            <RotateCcw className="size-4" /> Reset sample
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-10">
          <section aria-labelledby="client-side-title" className="min-w-0">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#C4CEFF]/12 text-sm font-semibold text-[#C4CEFF]">1</span>
              <h2 id="client-side-title" className="text-lg font-semibold">Client portal</h2>
            </div>
            <PortalOriginalDownload
              total={125}
              access={access}
              downloadUrl={status === 'granted' ? '#' : null}
              requestUrl="#sample-request"
              onAccessChanged={async () => {}}
              onDemoRequest={(value) => { setReason(value); setRequestedAt(new Date().toISOString()); setStatus('pending') }}
              onDemoDownload={() => setStatus('used')}
            />
            <p className="mt-4 text-sm leading-relaxed text-white/40">The request button appears after two completed downloads within seven days.</p>
          </section>

          <section aria-labelledby="editor-side-title" className="min-w-0">
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#C4CEFF]/12 text-sm font-semibold text-[#C4CEFF]">2</span>
              <h2 id="editor-side-title" className="text-lg font-semibold">Editor · Download Requests</h2>
            </div>
            <div className="min-h-56 overflow-hidden rounded-card border border-white/10 bg-[#222]">
              {status === 'pending' ? (
                <article className="grid gap-5 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Sample Graduation Client</h3>
                      <p className="mt-1 text-xs text-[#C4CEFF]">SAMPLE-BOOKING</p>
                    </div>
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200">Waiting for review</span>
                  </div>
                  <div className="rounded-control border border-white/10 bg-black/20 p-4">
                    <p className="text-xs font-semibold text-white/45">Client reason</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/85">{reason}</p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-white/40"><Clock3 className="size-3.5" />{new Date(requestedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                  <button type="button" onClick={() => setStatus('granted')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0903e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF] sm:justify-self-end"><Check className="size-4" />Grant access</button>
                </article>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center">
                  {status === 'granted' ? <Check className="size-7 text-emerald-300" /> : status === 'used' ? <Check className="size-7 text-white/40" /> : <Clock3 className="size-7 text-white/30" />}
                  <h3 className="text-sm font-semibold">{status === 'granted' ? 'Access granted' : status === 'used' ? 'Additional download used' : 'No request yet'}</h3>
                  <p className="max-w-xs text-sm leading-relaxed text-white/45">{status === 'granted' ? 'The client can download the originals once more.' : status === 'used' ? 'The client can request again if another copy is needed.' : 'Send a request from the client side to see the staff view.'}</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <p className="mt-9 flex items-center gap-2 border-t border-white/10 pt-6 text-xs text-white/35"><ArrowRight className="size-3.5" />Sample interactions stay on this page; nothing is submitted to production.</p>
      </div>
    </main>
  )
}
