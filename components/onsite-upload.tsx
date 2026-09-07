'use client'
import { useCachedPageRead, usePageBackgroundSync } from '@/components/use-cached-page-read'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FolderSync,
  ImagePlus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { EditorPageSkeleton } from '@/components/editor-page-skeleton'
import { adminBtnGhost, adminBtnPrimary, adminInput, adminPanel } from '@/lib/admin-ui'
import { uploadRawDirect as uploadRawFile } from '@/lib/raw-upload-client'
import { uploadRawQueue, type RawQueueProgress } from '@/lib/raw-upload-queue'
import { notifyOnsitePhotosChanged } from '@/lib/onsite-refresh'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
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
  resetId?: string | null
  portalEmailStatus?: 'SENT' | 'FAILED' | null
}

type OnsiteResponse = {
  shootDate: string
  batch: { id: string; jobs: Job[] } | null
  error?: string
}

type Progress = RawQueueProgress
type PortalEmailState = { status: 'SENT' | 'FAILED'; error?: string }

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
  const [deleteJob, setDeleteJob] = useState<Job | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [emailStates, setEmailStates] = useState<Record<string, PortalEmailState>>({})
  const [emailRetryJob, setEmailRetryJob] = useState<Job | null>(null)
  const [emailRetrying, setEmailRetrying] = useState(false)
  const target = useRef('')
  const input = useRef<HTMLInputElement | null>(null)
  const uploading = useRef(new Set<string>())

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/editor-workflow/onsite?date=${encodeURIComponent(date)}${silent ? '&fast=1' : ''}`, {
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

  const sync = async (bookingId: string) => {
    if (uploading.current.has(bookingId)) return
    uploading.current.add(bookingId)
    setBusy(bookingId)
    try {
      const response = await fetch(`/api/editor-workflow/raw/${encodeURIComponent(bookingId)}/index`, {
        method: 'POST',
        credentials: 'include',
      })
      const body = await responseJson(response)
      if (!response.ok) throw new Error(String(body.error || 'Could not sync the RAW folder.'))
      const detail = `${Number(body.indexed || 0)} photos indexed · ${Number(body.removed || 0)} unavailable records removed.${body.recovered ? ' The missing or outdated folder link was repaired.' : ''}`
      if (body.warning) toast.warning('Drive synced — review needed', String(body.warning))
      else toast.success('RAW folder synchronized', detail)
      await load(true)
      notifyOnsitePhotosChanged()
    } catch (error) {
      toast.error('RAW sync failed', error instanceof Error ? error.message : 'Try again.')
    } finally {
      uploading.current.delete(bookingId)
      setBusy(current => current === bookingId ? '' : current)
    }
  }

  const choose = (bookingId: string) => {
    if (uploading.current.has(bookingId)) return
    target.current = bookingId
    input.current?.click()
  }

  const sendPortalEmail = async (bookingId: string, showRetry = true) => {
    try {
      const response = await fetch(`/api/editor-workflow/raw/${encodeURIComponent(bookingId)}/portal-email`, {
        method: 'POST', credentials: 'include',
      })
      const body = await responseJson(response)
      if (!response.ok || !['SENT', 'ALREADY_SENT'].includes(String(body.status))) throw new Error(String(body.error || 'The portal email could not be sent. Try: check the client email and retry.'))
      setEmailStates(current => ({ ...current, [bookingId]: { status: 'SENT' } }))
      setEmailRetryJob(null)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The portal email could not be sent. Try: check the client email and retry.'
      setEmailStates(current => ({ ...current, [bookingId]: { status: 'FAILED', error: message } }))
      if (showRetry) setEmailRetryJob(data?.batch?.jobs.find(item => item.bookingId === bookingId) || null)
      return false
    }
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
      if (result.uploaded > 0 && result.failed.length === 0) await sendPortalEmail(bookingId)
    } finally {
      uploading.current.delete(bookingId)
      setBusy(current => current === bookingId ? '' : current)
      await load(true)
      notifyOnsitePhotosChanged()
    }
  }

  const deleteFiles = async () => {
    if (!deleteJob || uploading.current.has(deleteJob.bookingId)) return
    const job = deleteJob
    uploading.current.add(job.bookingId) // Also blocks duplicate clicks before React re-renders.
    setBusy(job.bookingId); setDeleting(true); setDeleteError(''); setDeleteProgress('Checking uploaded files…')
    let resetId = job.resetId
    try {
      for (let step = 0; step < 501; step++) {
        const response = await fetch(`/api/editor-workflow/raw/${encodeURIComponent(job.bookingId)}/reset`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmBookingId: job.bookingId, ...(resetId ? { resetId } : {}) }),
        })
        const body = await responseJson(response)
        if (!response.ok) throw new Error(String(body.error || 'Files could not be cleared. Try: retry Delete Files.'))
        if (typeof body.resetId === 'string') { resetId = body.resetId; setDeleteJob(current => current ? { ...current, resetId } : current) }
        setDeleteProgress(`${Number(body.cleared || 0)} of ${Number(body.total || 0)} files cleared`)
        if (body.complete === true) {
          setProgress(current => { const next = { ...current }; delete next[job.bookingId]; return next })
          toast.success('Uploaded files cleared', 'The indexed gallery and unfinished choices have been reset. You can upload the correct photos now.')
          setDeleteJob(null)
          return
        }
      }
      throw new Error('Deletion paused. Try: press Resume Delete Files to continue from saved progress.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try: retry Delete Files.'
      setDeleteError(message); toast.error('Files not fully cleared', message)
    } finally {
      uploading.current.delete(job.bookingId); setBusy(current => current === job.bookingId ? '' : current); setDeleting(false)
      await load(true)
      notifyOnsitePhotosChanged()
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
            const isBusy = busy === job.bookingId || uploading.current.has(job.bookingId) || state?.status === 'uploading'
            const driveStatus = job.resetId ? 'Deletion pending' : job.rawFolderDriveId
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
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
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

                  <div className="space-y-4 lg:justify-self-end">
                    <dl className="grid gap-2 text-small text-white/40 sm:flex sm:flex-wrap sm:items-baseline sm:justify-end sm:gap-x-6">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt>Uploaded files</dt><dd className="font-semibold tabular-nums text-white/70">{job.galleryCount}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt>Last upload</dt>
                        <dd className="min-w-0 font-semibold text-white/70">
                          {job.lastUploadAt ? new Date(job.lastUploadAt).toLocaleString('en-PH') : 'Not uploaded yet'}
                        </dd>
                      </div>
                      {emailStates[job.bookingId] || job.portalEmailStatus ? (
                        <div className={`font-semibold ${(emailStates[job.bookingId]?.status || job.portalEmailStatus) === 'SENT' ? 'text-emerald-300' : 'text-red-300'}`}>
                          <dt className="sr-only">Portal email</dt>
                          <dd>{(emailStates[job.bookingId]?.status || job.portalEmailStatus) === 'SENT' ? 'Email Sent' : (
                            <button type="button" className="cursor-pointer underline underline-offset-4" onClick={() => setEmailRetryJob(job)}>Email Failed · Retry</button>
                          )}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="onsite-actions">
                    <button
                      type="button"
                      disabled={isBusy || Boolean(job.resetId)}
                      onClick={() => choose(job.bookingId)}
                      className={`${adminBtnPrimary} inline-flex items-center gap-1.5 px-3 py-2 disabled:opacity-35`}
                    >
                      <ImagePlus className="size-3.5" />
                      Upload Photos
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || Boolean(job.resetId)}
                      onClick={() => void sync(job.bookingId)}
                      className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2 disabled:opacity-35`}
                    >
                      <FolderSync className="size-3.5" />
                      Sync Drive
                    </button>
                    <button type="button" disabled={isBusy} onClick={() => { setDeleteJob(job); setDeleteError(''); setDeleteProgress('') }}
                      className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2 text-red-300 hover:border-red-400/40 hover:bg-red-500/10`}>
                      <Trash2 className="size-3.5" />{job.resetId ? 'Resume Delete Files' : 'Delete Files'}
                    </button>
                    {state?.failed.length ? (
                      <button
                        type="button"
                        disabled={isBusy || Boolean(job.resetId)}
                        onClick={() => void uploadFiles(job.bookingId, state.failed)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-caption font-semibold uppercase text-red-200 transition hover:border-red-400/40 hover:bg-red-500/20 disabled:opacity-35"
                      >
                        <RefreshCw className="size-3.5" />
                        Retry {state.failed.length} Failed
                      </button>
                    ) : null}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <Sheet open={Boolean(deleteJob)} onOpenChange={open => { if (!open && !deleting) setDeleteJob(null) }}>
        <SheetContent className="data-[side=right]:w-full overflow-y-auto bg-[#222222] text-white data-[side=right]:sm:max-w-lg" showCloseButton={!deleting}>
          <SheetHeader>
            <SheetTitle className="text-white">Delete uploaded files?</SheetTitle>
            <SheetDescription className="mt-3 text-white/60">
              {deleteJob?.customerName} · {deleteJob?.bookingId}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 text-small leading-relaxed text-white/65">
            <p>This clears this client’s indexed gallery, previews, and unfinished photo choices. Uploads in their RAW folder and system-generated selection copies go to Google Drive Trash.</p>
            <p>The booking, payments, folders, and edited deliverables are kept. Files moved outside these folders are not deleted. Submitted selections and clients already being edited cannot be cleared here.</p>
            <p>Keep this page open while clearing files. If interrupted, use Resume Delete Files. Clients cannot submit choices until deletion finishes.</p>
            {deleteProgress ? <p role="status" aria-live="polite" className="text-[#C4CEFF]">{deleteProgress}</p> : null}
            {deleteError ? <p role="alert" className="text-red-300">{deleteError}</p> : null}
          </div>
          <SheetFooter>
            <button type="button" disabled={deleting} onClick={() => void deleteFiles()} className={`${adminBtnGhost} border-red-400/30 bg-red-500/10 px-4 py-3 text-red-200 hover:bg-red-500/20`}>
              {deleting ? 'Deleting files…' : deleteJob?.resetId ? 'Resume Delete Files' : 'Delete Files for This Client'}
            </button>
            <button type="button" disabled={deleting} onClick={() => setDeleteJob(null)} className={`${adminBtnGhost} px-4 py-3`}>Cancel</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <Sheet open={Boolean(emailRetryJob)} onOpenChange={open => { if (!open && !emailRetrying) setEmailRetryJob(null) }}>
        <SheetContent className="data-[side=right]:w-full bg-[#222222] text-white data-[side=right]:sm:max-w-md" showCloseButton={!emailRetrying}>
          <SheetHeader>
            <SheetTitle className="text-white">Email Failed</SheetTitle>
            <SheetDescription className="mt-3 text-white/60">
              Upload completed, but the email failed to send. Do you want to retry?
            </SheetDescription>
          </SheetHeader>
          {emailRetryJob && emailStates[emailRetryJob.bookingId]?.error ? (
            <p className="px-4 text-small leading-relaxed text-red-300">{emailStates[emailRetryJob.bookingId].error}</p>
          ) : null}
          <SheetFooter>
            <button type="button" disabled={emailRetrying} onClick={() => {
              if (!emailRetryJob) return
              setEmailRetrying(true)
              void sendPortalEmail(emailRetryJob.bookingId, false).finally(() => setEmailRetrying(false))
            }} className={`${adminBtnPrimary} px-4 py-3`}>{emailRetrying ? 'Retrying…' : 'Retry'}</button>
            <button type="button" disabled={emailRetrying} onClick={() => setEmailRetryJob(null)} className={`${adminBtnGhost} px-4 py-3`}>No</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
