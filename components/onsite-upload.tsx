'use client'
import { useCachedPageRead, usePageBackgroundSync } from '@/components/use-cached-page-read'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FolderCog,
  FolderSync,
  ImagePlus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { EditorPageSkeleton } from '@/components/editor-page-skeleton'
import { adminBtnGhost, adminBtnPrimary, adminInput, adminPanel } from '@/lib/admin-ui'
import { uploadRawDirect as uploadRawFile } from '@/lib/raw-upload-client'
import { uploadRawQueue, type RawQueueProgress } from '@/lib/raw-upload-queue'
export { uploadRawFile }

type Job = {
  bookingId: string
  customerName: string
  packageName: string
  bookingTime: string
  galleryCount: number
  lastUploadAt?: string | null
  rawFolderDriveId?: string | null
  lastError?: string | null
}

type OnsiteResponse = {
  shootDate: string
  batch: { id: string; jobs: Job[] } | null
  error?: string
}

type Progress = RawQueueProgress

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

async function responseJson(response: Response) {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export function snapshotOnsiteFiles(files: FileList | null, input: Pick<HTMLInputElement, 'value'> | null) {
  // FileList may be live. Copy it BEFORE resetting the picker for same-file retries.
  const selected = Array.from(files || [])
  if (input) input.value = ''
  return selected
}

export default function OnsiteUpload({
  initialDate = todayKey(),
  initialBooking = '',
}: {
  initialDate?: string
  initialBooking?: string
}) {
  const toast = useAdminToast()
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : todayKey())
  const [search, setSearch] = useState(initialBooking)
  const [data, setData, loading, setLoading] = useCachedPageRead<OnsiteResponse | null>(`editor:onsite:${date}`, null)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const target = useRef('')
  const input = useRef<HTMLInputElement | null>(null)
  const uploading = useRef(new Set<string>())

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/editor-workflow/onsite?date=${encodeURIComponent(date)}`, {
        cache: 'no-store',
        credentials: 'include',
      })
      const body = (await response.json()) as OnsiteResponse
      if (!response.ok) throw new Error(body.error || 'Could not load the onsite schedule.')
      setData(body)
    } catch (error) {
      toast.error('Onsite schedule unavailable', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setLoading(false)
    }
  }, [date, toast, setData, setLoading])

  useEffect(() => {
    void load()
  }, [load])

  usePageBackgroundSync(() => uploading.current.size ? undefined : load(true))

  const folders = async (bookingId: string, repair = false) => {
    setBusy(bookingId)
    try {
      const response = await fetch(`/api/editor-workflow/folders/${encodeURIComponent(bookingId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repair }),
      })
      const body = await responseJson(response)
      if (!response.ok) throw new Error(String(body.error || 'Drive folder action failed.'))
      toast.success(
        repair ? 'Folder repaired' : 'Folder ready',
        'Fico Mana saved the verified Drive folder IDs.',
      )
      await load(true)
    } catch (error) {
      toast.error('Drive folder action failed', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setBusy('')
    }
  }

  const sync = async (bookingId: string) => {
    setBusy(bookingId)
    try {
      const response = await fetch(`/api/editor-workflow/raw/${encodeURIComponent(bookingId)}/index`, {
        method: 'POST',
        credentials: 'include',
      })
      const body = await responseJson(response)
      if (!response.ok) throw new Error(String(body.error || 'Could not sync the RAW folder.'))
      toast.success('RAW folder synchronized', `${Number(body.indexed || 0)} photos indexed.`)
      await load(true)
    } catch (error) {
      toast.error('RAW sync failed', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setBusy('')
    }
  }

  const choose = (bookingId: string) => {
    target.current = bookingId
    input.current?.click()
  }

  const uploadFiles = async (bookingId: string, files: File[]) => {
    if (!files.length || uploading.current.has(bookingId)) return
    uploading.current.add(bookingId)
    setBusy(bookingId)
    try {
      const result = await uploadRawQueue(bookingId, files, state => {
        setProgress(current => ({ ...current, [bookingId]: state }))
      })
      if (result.failed.length) {
        toast.warning('Upload partially completed',
          `${result.uploaded} uploaded · ${result.failed.length} failed. ${result.lastError || 'Try: retry only the failed files.'}`)
      } else {
        toast.success('RAW upload complete', `${result.uploaded} files uploaded to the correct client folder.`)
      }
    } finally {
      uploading.current.delete(bookingId)
      setBusy(current => current === bookingId ? '' : current)
      await load(true)
    }
  }

  const picked = async (files: FileList | null) => {
    const bookingId = target.current
    target.current = ''
    const selected = snapshotOnsiteFiles(files, input.current)
    if (bookingId && selected.length) await uploadFiles(bookingId, selected)
  }

  const allJobs = useMemo(() => data?.batch?.jobs || [], [data])
  const jobs = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return allJobs
    return allJobs.filter((job) =>
      [job.customerName, job.bookingId, job.packageName, job.bookingTime].some((value) =>
        value.toLowerCase().includes(term),
      ),
    )
  }, [allJobs, search])

  if (loading) return <EditorPageSkeleton variant="onsite" />

  return (
    <div className="space-y-5">
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf"
        className="hidden"
        onChange={(event) => void picked(event.target.files)}
      />

      <div className={`${adminPanel} space-y-4 p-card`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">
              Onsite Upload
            </p>
            <h1 className="mt-2 text-h2 font-semibold tracking-heading text-balance">Send every shoot to its assigned Drive folder</h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/40">
              Choose a date and client, then upload their shoot photos.
            </p>
          </div>
          <label className="space-y-1">
            <span className="text-caption font-semibold uppercase tracking-wider text-white/35">Shoot date</span>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={`${adminInput} min-w-52 pl-10`}
              />
            </div>
          </label>
        </div>
        <label className="block">
          <span className="sr-only">Search onsite clients</span>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/35" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search client, booking ID, package, or time…"
              className={`${adminInput} pl-11`}
            />
          </div>
        </label>
      </div>

      {allJobs.length === 0 ? (
        <div className={`${adminPanel} p-14 text-center`}>
          <CheckCircle2 className="mx-auto size-8 text-emerald-400/45" />
          <p className="mt-3 text-sm font-semibold">No clients scheduled for this date</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className={`${adminPanel} p-14 text-center`}>
          <Search className="mx-auto size-8 text-white/25" />
          <p className="mt-3 text-sm font-semibold">No onsite clients match your search</p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="mt-3 text-caption font-semibold uppercase tracking-wider text-[#C4CEFF] hover:text-white"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const state = progress[job.bookingId]
            const overallPercent = state
              ? Math.min(100, Math.round((state.bytesProcessed / Math.max(1, state.totalBytes)) * 100))
              : 0
            const isBusy = busy === job.bookingId || state?.status === 'uploading'
            const driveStatus = job.rawFolderDriveId
              ? 'Ready'
              : job.lastError && /permission/i.test(job.lastError)
                ? 'Permission Error'
                : job.lastError
                  ? 'Drive Error'
                  : 'Missing Folder'
            const driveTone =
              driveStatus === 'Ready'
                ? 'text-emerald-300'
                : driveStatus === 'Missing Folder'
                  ? 'text-amber-300'
                  : 'text-red-300'

            return (
              <article key={job.bookingId} className={`${adminPanel} p-card`}>
                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-card-title font-semibold tracking-heading">{job.customerName}</h2>
                      <span className={`text-caption font-semibold uppercase ${driveTone}`}>{driveStatus}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-small text-white/40">
                      <p>{date} · {job.bookingTime}</p>
                      <p>{job.packageName}</p>
                    </div>
                    <p className="mt-2 font-mono text-caption text-white/25">{job.bookingId}</p>
                    <dl className="mt-4 grid gap-3 text-small text-white/40 sm:flex sm:flex-wrap sm:gap-x-6">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
                        <dt>Uploaded files</dt><dd className="text-right font-semibold tabular-nums text-white/70">{job.galleryCount}</dd>
                      </div>
                      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
                        <dt>Last upload</dt>
                        <dd className="min-w-0 text-right font-semibold text-white/70">
                          {job.lastUploadAt
                            ? new Date(job.lastUploadAt).toLocaleString('en-PH')
                            : 'Not uploaded yet'}
                        </dd>
                      </div>
                    </dl>

                    {state ? (
                      <div
                        className="mt-4 max-w-xl border border-white/[0.08] bg-black/20 p-3"
                        aria-live="polite"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-caption font-semibold uppercase tracking-wider text-white/55">
                              {state.status === 'complete'
                                ? 'Upload complete'
                                : state.status === 'partial'
                                  ? 'Upload completed with failures'
                                  : state.activeFiles.length && state.activeFiles.every(file => file.verifying)
                                    ? 'Verifying uploaded photos'
                                    : 'Uploading RAW photos'}
                            </p>
                            <p className="mt-1 max-w-sm truncate text-caption text-white/35">
                              {state.status === 'uploading'
                                ? `${state.activeFiles.length} active · Up to 3 parallel uploads`
                                : `${state.uploaded} file${state.uploaded === 1 ? '' : 's'} uploaded`}
                            </p>
                          </div>
                          <p className="text-right text-sm font-bold tabular-nums text-[#C4CEFF]">
                            {overallPercent}%
                          </p>
                        </div>
                        <div
                          className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
                          role="progressbar"
                          aria-label={`Overall upload progress for ${job.customerName}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={overallPercent}
                        >
                          <div
                            className={`h-full rounded-full transition-[width] duration-200 ${
                              state.status === 'partial' ? 'bg-amber-400' : 'bg-[#C4CEFF]'
                            }`}
                            style={{ width: `${overallPercent}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap justify-between gap-2 text-caption text-white/35">
                          <span>
                            {state.uploaded} uploaded · {state.failed.length} failed · {state.total} total
                          </span>
                          <span className="tabular-nums">
                            {formatBytes(state.bytesProcessed)} / {formatBytes(state.totalBytes)}
                          </span>
                        </div>
                        {state.activeFiles.map(file => {
                          const percent = Math.min(100, Math.round(file.loaded / Math.max(1, file.total) * 100))
                          return <div key={file.index} className="mt-3">
                            <div className="flex justify-between gap-2 text-caption text-white/35">
                              <span className="truncate">{file.name}</span>
                              <span className="shrink-0 tabular-nums">{file.verifying ? 'Verifying' : `${percent}%`}</span>
                            </div>
                            <div
                              className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.08]"
                              role="progressbar"
                              aria-label={`${file.name} upload progress`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={percent}
                            >
                              <div
                                className="h-full rounded-full bg-emerald-400 transition-[width] duration-150"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        })}
                        {state.failed.length ? (
                          <div className="mt-3 text-caption leading-relaxed text-amber-200/70">
                            <p>Failed: {state.failed.map((file) => file.name).join(', ')}</p>
                            {state.lastError ? <p className="mt-1">{state.lastError}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {job.lastError ? (
                      <p className="mt-4 flex items-start gap-2 text-small leading-relaxed text-red-300">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 break-words">{job.lastError}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="onsite-actions">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void folders(job.bookingId, false)}
                      className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}
                    >
                      <FolderCog className="size-3.5" />
                      {job.rawFolderDriveId ? 'Refresh Folder' : 'Create Folder'}
                    </button>
                    {job.rawFolderDriveId ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Repair this saved Drive mapping? Existing Drive files will not be deleted.',
                            )
                          ) {
                            void folders(job.bookingId, true)
                          }
                        }}
                        className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}
                      >
                        <RefreshCw className="size-3.5" />
                        Repair
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isBusy || !job.rawFolderDriveId}
                      onClick={() => choose(job.bookingId)}
                      className={`${adminBtnPrimary} inline-flex items-center gap-1.5 px-3 py-2 disabled:opacity-35`}
                    >
                      <ImagePlus className="size-3.5" />
                      Upload Photos
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || !job.rawFolderDriveId}
                      onClick={() => void sync(job.bookingId)}
                      className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2 disabled:opacity-35`}
                    >
                      <FolderSync className="size-3.5" />
                      Sync Drive
                    </button>
                    {state?.failed.length ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void uploadFiles(job.bookingId, state.failed)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-caption font-semibold uppercase text-red-200 transition hover:border-red-400/40 hover:bg-red-500/20 disabled:opacity-35"
                      >
                        <RefreshCw className="size-3.5" />
                        Retry {state.failed.length} Failed
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
