'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  FolderUp,
  ImagePlus,
  RefreshCw,
  UploadCloud,
} from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { useEditorSession } from '@/components/editor-portal-shell'
import { EditorPageSkeleton } from '@/components/editor-page-skeleton'
import { adminBtnGhost, adminBtnPrimary, adminPanel } from '@/lib/admin-ui'
import {
  fetchEditorBatches,
  getCachedEditorBatches,
  shouldSynchronizeEditorBatches,
  type EditorBatchSummary as Batch,
} from '@/lib/editor-read-cache'

type TodayJob = {
  bookingId: string
  customerName: string
  packageName: string
  bookingTime: string
  galleryCount: number
  rawFolderDriveId?: string | null
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function EditorDashboard() {
  const toast = useAdminToast()
  const session = useEditorSession()
  const [batches, setBatches] = useState<Batch[]>(() => getCachedEditorBatches() ?? [])
  const [todayJobs, setTodayJobs] = useState<TodayJob[]>([])
  const [batchesLoading, setBatchesLoading] = useState(() => getCachedEditorBatches() === null)
  const [onsiteLoading, setOnsiteLoading] = useState(true)
  const [onsiteError, setOnsiteError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [downloading, setDownloading] = useState('')
  const today = dateKey()

  const load = useCallback(async (silent = false, forceSync = false) => {
    if (silent) setRefreshing(true)
    else {
      setBatchesLoading(getCachedEditorBatches() === null)
      setOnsiteLoading(true)
    }

    const batchTask = (async () => {
      try {
        const current = await fetchEditorBatches({ force: true })
        setBatches(current)
        setBatchesLoading(false)
        if (forceSync || shouldSynchronizeEditorBatches()) {
          const synchronized = await fetchEditorBatches({ force: true, synchronize: true })
          setBatches(synchronized)
        }
      } finally {
        setBatchesLoading(false)
      }
    })()

    const onsiteTask = (async () => {
      try {
        const response = await fetch(`/api/editor-workflow/onsite?date=${encodeURIComponent(today)}&fast=1`, {
          cache: 'no-store',
          credentials: 'include',
        })
        if (!response.ok) throw new Error('Today’s onsite work could not be loaded.')
        const onsite = (await response.json()) as { batch?: { jobs?: TodayJob[] } | null }
        setTodayJobs(onsite.batch?.jobs || [])
        setOnsiteError('')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Today’s onsite work could not be loaded.'
        const solution = `${message} Try: refresh the dashboard once. If it continues, open Onsite Upload and select today’s date.`
        setOnsiteError(solution)
        throw new Error(solution)
      } finally {
        setOnsiteLoading(false)
      }
    })()

    const results = await Promise.allSettled([batchTask, onsiteTask])
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failure && !silent) {
      toast.error(
        'Dashboard partially unavailable',
        failure.reason instanceof Error ? failure.reason.message : 'Try again.',
      )
    }
    setRefreshing(false)
  }, [toast, today])

  useEffect(() => {
    void load()
    const refresh = () => void load(true)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [load])

  const totals = useMemo(
    () =>
      batches.reduce(
        (value, batch) => {
          value.download += batch.counts.readyForEditing
          value.uploading += batch.counts.uploading
          value.failed += batch.counts.failed
          return value
        },
        { download: 0, uploading: 0, failed: 0 },
      ),
    [batches],
  )

  const startDownload = (batch: Batch) => {
    setDownloading(batch.id)
    const anchor = document.createElement('a')
    anchor.href = `/api/editor-workflow/batches/${encodeURIComponent(batch.id)}/download`
    anchor.download = `${batch.id}.zip`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    toast.success('Batch download started', 'Client folders and their upload details are included.')
    window.setTimeout(() => {
      setDownloading('')
      void load(true)
    }, 3000)
  }

  if (batchesLoading && onsiteLoading) return <EditorPageSkeleton variant="dashboard" />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#C4CEFF]">Editor Dashboard</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">Today’s upload and editing work</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/40">
            Check today’s clients, downloads, and uploads.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-[9px] font-bold uppercase text-emerald-300">
          <CheckCircle2 className="size-3.5" />{session?.role} access active
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Onsite Clients Today" value={todayJobs.length} tone="text-cyan-300" icon={ImagePlus} />
        <Metric label="Pending Download" value={totals.download} tone="text-amber-300" icon={Download} />
        <Metric label="Uploading" value={totals.uploading} tone="text-violet-300" icon={UploadCloud} />
        <Metric label="Upload Failed" value={totals.failed} tone="text-red-300" icon={AlertTriangle} />
      </div>

      <section className={`${adminPanel} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-white/[0.08] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-[#C4CEFF]" />
              <p className="text-[9px] font-bold uppercase tracking-wider text-[#C4CEFF]">Onsite upload per client today</p>
            </div>
            <h2 className="mt-2 text-base font-semibold">{dayLabel(today)}</h2>
          </div>
          {session?.capabilities.onsite ? (
            <Link href="/editor/onsite" className={`${adminBtnPrimary} inline-flex items-center justify-center gap-2 px-4 py-2.5`}>
              <ImagePlus className="size-4" />Open Onsite Upload
            </Link>
          ) : null}
        </div>
        {onsiteLoading ? (
          <div className="space-y-3 p-5 animate-pulse" aria-label="Loading today’s onsite clients">
            {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-14 rounded bg-white/[0.06]" />)}
          </div>
        ) : onsiteError ? (
          <div className="flex flex-col gap-4 bg-amber-500/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-semibold text-amber-200">Today’s onsite list is temporarily unavailable</p>
                <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-amber-100/60">{onsiteError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load(false)}
              className={`${adminBtnGhost} inline-flex shrink-0 items-center justify-center gap-2 px-3 py-2`}
            >
              <RefreshCw className="size-3.5" />Retry
            </button>
          </div>
        ) : todayJobs.length === 0 ? (
          <div className="p-10 text-center text-xs text-white/35">No client shoots are scheduled today.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {todayJobs.map((job) => (
              <div key={job.bookingId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold">{job.customerName}</p>
                  <p className="mt-1 text-[10px] text-white/35">{job.bookingTime} · {job.packageName} · {job.bookingId}</p>
                </div>
                <div className="text-[10px] text-white/40 sm:text-right">
                  <p>{job.galleryCount} photo{job.galleryCount === 1 ? '' : 's'} uploaded</p>
                  <p className={job.rawFolderDriveId ? 'mt-1 text-emerald-300' : 'mt-1 text-amber-300'}>
                    {job.rawFolderDriveId ? 'Drive folder ready' : 'Drive folder needs setup'}
                  </p>
                </div>
                {session?.capabilities.onsite ? (
                  <Link
                    href={`/editor/onsite?date=${encodeURIComponent(today)}&booking=${encodeURIComponent(job.bookingId)}`}
                    className={`${adminBtnGhost} inline-flex items-center justify-center gap-2 px-3 py-2`}
                  >
                    Upload Photos <ImagePlus className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4CEFF]">Editing Queue</p>
            <h2 className="mt-1 text-lg font-semibold">Download and upload per day batch</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load(true, true)} disabled={refreshing} className={`${adminBtnGhost} inline-flex items-center gap-2 px-3 py-2 disabled:opacity-50`}>
              <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <Link href="/editor/upload" className={`${adminBtnPrimary} inline-flex items-center gap-2 px-4 py-2.5`}>
              <FolderUp className="size-4" />Upload Photos
            </Link>
          </div>
        </div>

        {batchesLoading && batches.length === 0 ? (
          <EditorPageSkeleton variant="queue" />
        ) : batches.length === 0 ? (
          <div className={`${adminPanel} p-12 text-center text-xs text-white/35`}>No editing batches are available.</div>
        ) : (
          <div className="grid gap-4">
            {batches.map((batch) => {
              const completed = batch.counts.delivered
              const percent = Math.round((completed / Math.max(1, batch.totalClients)) * 100)
              return (
                <article key={batch.id} className={`${adminPanel} overflow-hidden`}>
                  <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_auto] lg:items-center">
                    <div>
                      <p className="text-base font-semibold">{dayLabel(batch.shootDate)}</p>
                      <p className="mt-1 font-mono text-[9px] text-white/30">{batch.id}</p>
                      <p className="mt-2 text-[10px] text-white/40">
                        {batch.totalClients} clients · {batch.counts.readyForEditing} pending download · {batch.counts.downloaded + batch.counts.editing + batch.counts.readyToUpload + batch.counts.uploading} downloaded
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-white/35">
                        <span>Upload progress</span>
                        <span>{completed} / {batch.totalClients}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full rounded-full bg-[#6678FF]" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[9px]">
                        <span className="text-violet-300">{batch.counts.uploading} uploading</span>
                        <span className="text-emerald-300">{batch.counts.delivered} delivered</span>
                        <span className={batch.counts.failed ? 'text-red-300' : 'text-white/30'}>{batch.counts.failed} failed</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => startDownload(batch)}
                        disabled={!(batch.counts.readyForEditing + batch.counts.downloaded + batch.counts.editing + batch.counts.readyToUpload + batch.counts.failed) || downloading === batch.id}
                        className={`${adminBtnPrimary} inline-flex items-center gap-2 px-3 py-2 disabled:opacity-35`}
                      >
                        <Download className="size-3.5" />
                        {downloading === batch.id ? 'Preparing…' : batch.counts.downloaded > 0 ? 'Download Batch Again' : 'Download Batch'}
                      </button>
                      <Link
                        href={`/editor/upload?batch=${encodeURIComponent(batch.id)}${batch.counts.failed ? '&retry=1' : ''}`}
                        className={`${batch.counts.failed ? 'border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15' : adminBtnGhost} inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase`}
                      >
                        <FolderUp className="size-3.5" />{batch.counts.failed ? 'Retry Upload' : 'Upload Batch'}
                      </Link>
                    </div>
                  </div>
                  {batch.counts.failed ? (
                    <div className="flex items-center gap-2 border-t border-red-500/15 bg-red-500/[0.04] px-5 py-3 text-[10px] text-red-200/70">
                      <AlertTriangle className="size-3.5" />{batch.counts.failed} client upload{batch.counts.failed === 1 ? '' : 's'} failed. Open Upload Batch and enable “Retry failed clients only.”
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: number
  tone: string
  icon: typeof ImagePlus
}) {
  return (
    <div className={`${adminPanel} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-bold uppercase tracking-wider text-white/30">{label}</p>
        <Icon className={`size-4 ${tone}`} />
      </div>
      <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}
