'use client'
import { useCachedPageRead, usePageBackgroundSync } from '@/components/use-cached-page-read'


import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  FolderOpen,
  FolderUp,
  UploadCloud,
} from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import StaffReadNotice from '@/components/staff-read-notice'
import { assertEditorReadMetadata } from '@/lib/editor-read-validation'
import { EditorPageSkeleton } from '@/components/editor-page-skeleton'
import { adminBtnGhost, adminBtnPrimary, adminPanel } from '@/lib/admin-ui'
import {
  detectBatchFolders,
  pickedFilesFromDrop,
  pickedFilesFromList,
  preflightDetectedBatch,
  uploadDetectedBatch,
  type BatchPreflight,
  type DetectedBatchFolder,
  type UploadProgress,
  type UploadResult,
} from '@/lib/editor-upload-client'

type UploadReportClient = {
  bookingId: string
  customerName: string
  packageName: string
  status: string
  expectedFiles: number
  uploadedFiles: number
  lastError: string | null
  updatedAt: string
  storageReady: boolean
}

type UploadReport = {
  id: string
  batchId: string
  shootDate: string
  status: string
  totalClients: number
  completedClients: number
  failedClients: number
  photosUploaded: number
  createdAt: string
  completedAt: string | null
  clients: UploadReportClient[]
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function formatDateTime(value: string | null) {
  if (!value) return 'In progress'
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function reportTone(status: string) {
  if (status === 'COMPLETED' || status === 'DELIVERED') return 'text-emerald-300'
  if (status === 'FAILED' || status === 'PARTIALLY_COMPLETED') return 'text-red-300'
  return 'text-amber-300'
}

export default function EditorUploadPhotos({
  initialBatchId = '',
  initialFailedOnly = false,
}: {
  initialBatchId?: string
  initialFailedOnly?: boolean
}) {
  const toast = useAdminToast()
  const input = useRef<HTMLInputElement | null>(null)
  const [detected, setDetected] = useState<DetectedBatchFolder[]>([])
  const [preflights, setPreflights] = useState<Record<string, BatchPreflight>>({})
  const [checkErrors, setCheckErrors] = useState<Record<string, string>>({})
  const busy = useRef(false)
  const [dragActive, setDragActive] = useState(false)
  const [reading, setReading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [failedOnly, setFailedOnly] = useState(initialFailedOnly)
  const [runStats, setRunStats] = useState<{ total: number; eligible: number; skipped: number; completed: number; failed: number; pending: number } | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [results, setResults] = useState<UploadResult[]>([])
  const [runErrors, setRunErrors] = useState<string[]>([])
  const [reports, setReports, reportsLoading, setReportsLoading] = useCachedPageRead<UploadReport[]>('editor:upload-reports', [])
  const [reportError, setReportError] = useState('')
  const [reportsVerified, setReportsVerified] = useState(false)
  const [refreshingReports, setRefreshingReports] = useState(false)

  const checkFolders = async (batches: DetectedBatchFolder[]) => {
    const checks: Record<string, BatchPreflight> = {}
    const errors: Record<string, string> = {}
    await Promise.all(batches.map(async (batch) => {
      const id = batch.manifest.batch_id
      try { checks[id] = await preflightDetectedBatch(batch) }
      catch (error) { errors[id] = error instanceof Error ? error.message : 'Could not check this batch. Try again.' }
    }))
    setPreflights(checks)
    setCheckErrors(errors)
  }

  const refreshChecks = async () => {
    if (busy.current) return
    busy.current = true
    setReading(true)
    try { await checkFolders(detected) }
    finally { busy.current = false; setReading(false) }
  }

  const loadReports = useCallback(async (silent = false) => {
    if (!silent) setReportsLoading(true)
    setRefreshingReports(true)
    try {
      const response = await fetch('/api/editor-workflow/uploads/report?limit=40', {
        cache: 'no-store',
        credentials: 'include',
      })
      const body = (await response.json()) as UploadReport[] & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load upload history.')
      assertEditorReadMetadata(body, 'uploads')
      setReports(body)
      setReportsVerified(true)
      setReportError('')
    } catch (error) {
      setReportError(`Upload history could not be loaded. Try: Retry upload history. ${error instanceof Error ? error.message : ''}`)
    } finally {
      setReportsLoading(false)
      setRefreshingReports(false)
    }
  }, [setReports, setReportsLoading])

  useEffect(() => {
    if (input.current) {
      input.current.setAttribute('webkitdirectory', '')
      input.current.setAttribute('directory', '')
    }
    void loadReports()
  }, [loadReports])

  useEffect(() => {
    if (!uploading) return
    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventClose)
    return () => window.removeEventListener('beforeunload', preventClose)
  }, [uploading])

  usePageBackgroundSync(() => uploading ? undefined : loadReports(true))

  const inspect = async (files: Awaited<ReturnType<typeof pickedFilesFromDrop>>) => {
    if (busy.current) return
    if (!files.length) { setReading(false); return }
    busy.current = true
    setReading(true)
    setResults([])
    setRunErrors([])
    setProgress(null)
    setRunStats(null)
    setPreflights({})
    setCheckErrors({})
    try {
      const batches = await detectBatchFolders(files)
      if (!batches.length) {
        throw new Error('This folder could not be matched to a batch. Try: extract the ZIP from the Editing Queue, then select its batch folder.')
      }
      const selected = initialBatchId
        ? batches.filter((batch) => batch.manifest.batch_id === initialBatchId)
        : batches
      if (!selected.length) {
        throw new Error(`This folder does not contain the expected batch ${initialBatchId}.`)
      }
      setDetected(selected)
      await checkFolders(selected)
    } catch (error) {
      setDetected([])
      setRunErrors([error instanceof Error ? error.message : 'Choose a valid Fico Mana batch folder.'])
      toast.error('Folder not accepted', error instanceof Error ? error.message : 'Choose a valid Fico Mana batch folder.')
    } finally {
      setReading(false)
      busy.current = false
      if (input.current) input.current.value = ''
    }
  }

  const chooseFolder = () => input.current?.click()

  const startUpload = async () => {
    if (!detected.length || busy.current || reading) return
    const confirmation = new Map(detected.map((batch) => [batch.manifest.batch_id, (preflights[batch.manifest.batch_id]?.clients || []).filter((client) => client.status === 'READY' && (!failedOnly || client.workflowStatus === 'UPLOAD_FAILED')).map((client) => client.bookingId)]))
    if (![...confirmation.values()].some((ids) => ids.length)) return
    busy.current = true
    setUploading(true)
    setProgress(null)
    setResults([])
    setRunErrors([])
    const confirmedCount = [...confirmation.values()].reduce((sum, ids) => sum + ids.length, 0)
    setRunStats({ total: selectedClients, eligible: confirmedCount, skipped: selectedClients - confirmedCount, completed: 0, failed: 0, pending: confirmedCount })
    let completed = 0
    let failed = 0
    let errors = 0
    for (const batch of detected) {
      const confirmedBookingIds = confirmation.get(batch.manifest.batch_id) || []
      if (!confirmedBookingIds.length) continue
      let batchPending = confirmedBookingIds.length
      try {
        await uploadDetectedBatch(batch, {
          confirmedBookingIds,
          onPreflight: (checked) => {
            setPreflights((current) => ({ ...current, [batch.manifest.batch_id]: checked }))
            const excluded = confirmedBookingIds.filter((id) => !checked.clients.some((client) => client.bookingId === id && client.status === 'READY')).length
            batchPending -= excluded
            if (excluded) setRunStats((current) => current ? { ...current, eligible: current.eligible - excluded, skipped: current.skipped + excluded, pending: current.pending - excluded } : current)
          },
          onProgress: setProgress,
          onResult: (result) => {
            batchPending -= 1
            if (result.status === 'DELIVERED') completed += 1
            else failed += 1
            setResults((current) => [...current, result])
            setRunStats((current) => current ? { ...current, completed: current.completed + (result.status === 'DELIVERED' ? 1 : 0), failed: current.failed + (result.status === 'DELIVERED' ? 0 : 1), pending: Math.max(0, current.pending - 1) } : current)
          },
        })
      } catch (error) {
        const message = `${batch.manifest.batch_id}: ${error instanceof Error ? error.message : 'Upload failed.'}`
        errors += 1
        failed += batchPending
        setRunStats((current) => current ? { ...current, failed: current.failed + batchPending, pending: Math.max(0, current.pending - batchPending) } : current)
        setRunErrors((current) => [...current, message])
      }
    }
    setUploading(false)
    busy.current = false
    await checkFolders(detected)
    await loadReports(true)
    if (failed > 0 || errors > 0) {
      toast.warning('Upload needs attention', `${completed} client${completed === 1 ? '' : 's'} delivered · ${failed} failed. Review the messages below.`)
    } else if (completed > 0) {
      toast.success('Upload complete', `${completed} client${completed === 1 ? '' : 's'} delivered to secure storage.`)
    } else {
      toast.warning('No clients uploaded', 'The confirmed clients are no longer eligible. Review the updated folder check.')
    }
  }

  const selectedClients = detected.reduce((sum, batch) => sum + batch.manifest.clients.length, 0)
  const selectedFiles = detected.reduce((sum, batch) => sum + batch.files.length, 0)
  const readyClients = Object.values(preflights).reduce((sum, checked) => sum + checked.clients.filter((client) => client.status === 'READY' && (!failedOnly || client.workflowStatus === 'UPLOAD_FAILED')).length, 0)
  const skippedClients = selectedClients - readyClients
  const percent = progress
    ? progress.bytesTotal > 0
      ? Math.round((progress.bytesDone / progress.bytesTotal) * 100)
      : Math.round((progress.clientsDone / Math.max(1, progress.clientsTotal)) * 100)
    : 0
  const latestReport = reports[0]
  const failedReports = useMemo(
    () => reports.reduce((sum, report) => sum + report.failedClients, 0),
    [reports],
  )

  return (
    <div className="space-y-6">
      <input
        ref={input}
        type="file"
        aria-label="Choose edited batch folder"
        multiple
        className="hidden"
        onChange={(event) => void inspect(pickedFilesFromList(event.target.files || []))}
      />

      <div className="border-b border-white/[0.08] pb-5">
        <p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">Upload Photos</p>
        <h1 className="mt-2 font-sans text-page-title font-semibold tracking-heading text-balance">Return edited batches to clients</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/40">
          Drop the saved batch folder to upload each client’s SELECTED/EDITED photos to private storage.
        </p>
      </div>

      <section
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragLeave={(event) => {
          event.preventDefault()
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          if (busy.current || reading || uploading) return
          setReading(true)
          void pickedFilesFromDrop(event.dataTransfer).then(inspect).catch((error) => {
            setReading(false)
            toast.error('Folder could not be read', error instanceof Error ? error.message : 'Try choosing the folder instead.')
          })
        }}
        className={`${adminPanel} border-2 border-dashed p-7 text-center transition sm:p-12 ${
          dragActive ? 'border-[#8E9CFF] bg-[#0500D0]/10' : 'border-white/[0.12] hover:border-[#8E9CFF]/60'
        }`}
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-[#C4CEFF]/20 bg-[#C4CEFF]/[0.06]">
          <FolderUp className="size-6 text-[#C4CEFF]" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Drag and drop the downloaded batch folder</h2>
        <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-white/40">
          You can also select a day, week, or month folder. The included batches are found automatically.
        </p>
        <button
          type="button"
          onClick={chooseFolder}
          disabled={reading || uploading}
          className={`${adminBtnPrimary} mt-5 inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-40`}
        >
          <FolderOpen className="size-4" />
          {reading ? 'Reading Folder…' : 'Choose Folder'}
        </button>
      </section>

      {detected.length > 0 ? (
        <section aria-label="Batch upload review" className={`${adminPanel} overflow-hidden`}>
          <div className="flex flex-col gap-4 border-b border-white/[0.08] p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">Review clients before upload</h2>
              <p className="mt-2 text-sm text-white/65" role="status" aria-live="polite">
                {selectedClients} total · {readyClients} eligible · {skippedClients} skipped
              </p>
              <p className="mt-1 text-sm text-white/65">
                {detected.length} batch{detected.length === 1 ? '' : 'es'}
                {initialFailedOnly ? ' · Retry: delivered clients are skipped automatically.' : ''}
              </p>
              <p className="mt-1 text-caption text-white/35">{selectedFiles} total folder files inspected</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-h-11 items-center gap-2 text-sm text-white/65"><input type="checkbox" checked={failedOnly} onChange={(event) => setFailedOnly(event.target.checked)} disabled={uploading || reading} className="accent-[#8FA0FF]" />Retry failed clients only</label>
              <button type="button" onClick={() => void refreshChecks()} disabled={reading || uploading} className={`${adminBtnGhost} px-4 py-2.5 disabled:opacity-40`}>{reading ? 'Checking clients…' : 'Check clients again'}</button>
              <button
                type="button"
                onClick={() => void startUpload()}
                disabled={uploading || reading || readyClients === 0}
                className={`${adminBtnPrimary} inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-40`}
              >
                <UploadCloud className="size-4" />
                {uploading ? 'Uploading…' : `Upload ${readyClients} Eligible Clients`}
              </button>
            </div>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {detected.map((batch) => (
              <div key={batch.manifest.batch_id} className="p-4">
                <div>
                  <p className="text-sm font-semibold">{batch.manifest.shoot_date}</p>
                  <p className="mt-1 font-mono text-caption text-white/30">{batch.manifest.batch_id}</p>
                </div>
                {checkErrors[batch.manifest.batch_id] ? <p role="alert" className="mt-3 text-sm text-red-300">{checkErrors[batch.manifest.batch_id]} Use Check clients again.</p> : null}
                <ul className="mt-3 divide-y divide-white/[0.06]">
                  {batch.manifest.clients.map((client, index) => {
                    const checked = preflights[batch.manifest.batch_id]?.clients[index]
                    const retryExcluded = checked?.status === 'READY' && failedOnly && checked.workflowStatus !== 'UPLOAD_FAILED'
                    return <li key={index} className="flex min-w-0 flex-col gap-2 py-3 text-sm sm:flex-row sm:justify-between">
                      <div className="min-w-0 break-words"><p className="font-semibold">{checked?.customerName || (typeof client?.customer_name === 'string' ? client.customer_name : 'Unnamed client')}</p><p className="mt-1 text-white/65">{typeof client?.booking_id === 'string' ? client.booking_id : 'Missing booking ID'} · {checked ? `${checked.expectedFiles} edited photos found` : 'Photos not yet verified'}</p></div>
                      <div className="min-w-0 sm:max-w-xl sm:text-right"><p className={checked?.status === 'READY' || checked?.status === 'DELIVERED' ? 'text-emerald-300' : 'text-amber-300'}>{retryExcluded ? 'Skipped by retry filter' : checked ? checked.status === 'READY' ? 'Eligible' : checked.status === 'DELIVERED' ? 'Delivered · skipped' : `${checked.status.replace(/_/g, ' ')} · skipped` : reading ? 'Checking…' : 'Not verified · skipped'}</p><p className="mt-1 break-words text-white/65">{retryExcluded ? 'This client has no failed upload to retry. Turn off the retry filter to include it.' : checked?.reason || (checked?.status === 'READY' ? 'Ready to upload. Confirm with the upload button.' : checked?.status === 'DELIVERED' ? 'Already delivered. No files will be uploaded again.' : '')}</p></div>
                    </li>
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {uploading || progress || results.length > 0 || runErrors.length > 0 ? (
        <section className={`${adminPanel} p-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-caption font-semibold uppercase tracking-wider text-white/35">Upload progress</p>
              <h2 className="mt-1 text-base font-semibold">
                {uploading ? progress?.clientName || 'Preparing the batch…' : 'Latest upload result'}
              </h2>
              <p className="mt-1 text-caption text-white/35">
                {progress?.batchId || detected[0]?.manifest.batch_id}
                {progress?.currentFile ? ` · ${progress.currentFile}` : ''}
              </p>
            </div>
            <span className={`text-2xl font-bold ${runErrors.length ? 'text-red-300' : 'text-[#C4CEFF]'}`}>{percent}%</span>
          </div>
          <div role="progressbar" aria-label="Current batch upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${runErrors.length ? 'bg-red-400' : 'bg-[#6678FF]'}`}
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ProgressCell label="Clients" value={runStats ? `${runStats.total} total · ${runStats.eligible} eligible · ${runStats.skipped} skipped` : `${selectedClients} clients inspected`} />
            <ProgressCell label="Results" value={runStats ? `${runStats.completed} delivered · ${runStats.failed} failed · ${runStats.pending} pending` : 'No upload started'} />
            <ProgressCell label="Photos" value={progress ? `${progress.filesDone} / ${progress.filesTotal} · ${formatBytes(progress.bytesDone)}` : 'Waiting for server confirmation'} />
          </div>
          {results.length || runErrors.length ? (
            <div className="mt-5 divide-y divide-white/[0.06] overflow-hidden rounded-control border border-white/[0.07]">
              {results.map((result, index) => (
                <div key={`${result.bookingId}-${index}`} className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{result.customerName || result.bookingId}</p>
                    <p className="mt-1 font-mono text-caption text-white/30">{result.bookingId}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className={result.status === 'DELIVERED' ? 'text-emerald-300' : 'text-red-300'}>
                      {result.status === 'DELIVERED' ? 'Uploaded' : 'Upload failed'}
                    </p>
                    <p className="mt-1 text-caption text-white/35">Folder files {result.expected} · Registered {result.uploaded}</p>
                    {result.error ? <p className="mt-1 max-w-lg text-caption text-red-300/70">{result.error}</p> : null}
                  </div>
                </div>
              ))}
              {runErrors.map((error) => (
                <div key={error} className="flex items-start gap-2 p-3 text-caption text-red-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{error}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={`${adminPanel} overflow-hidden`}>
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] p-5">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-white/35">Upload report</p>
            <h2 className="mt-1 text-base font-semibold">Folders and clients already uploaded</h2>
            <p className="mt-1 text-caption text-white/35">
              {latestReport ? `Latest: ${formatDateTime(latestReport.completedAt || latestReport.createdAt)}` : reportsLoading ? 'Loading upload history…' : reportError && !reportsVerified ? 'Upload history unavailable' : 'No uploads recorded yet'}
              {failedReports ? ` · ${failedReports} failed client${failedReports === 1 ? '' : 's'} in recent runs` : ''}
            </p>
          </div>
        </div>
        {reportError ? <div className="p-5"><StaffReadNotice message={reportError} retryLabel="Retry upload history" busy={refreshingReports} onRetry={() => void loadReports(true)} /></div> : null}
        {reportError && !reportsVerified && reports.length === 0 ? null : reportsLoading ? (
          <EditorPageSkeleton variant="queue" />
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-xs text-white/35">Completed and failed uploads will appear here.</div>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {reports.map((report, index) => (
              <details key={report.id} className="group">
                <summary className="grid cursor-pointer list-none gap-3 p-4 hover:bg-white/[0.025] sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{report.shootDate || 'Batch upload'}</p>
                      <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-caption font-semibold uppercase text-white/65">
                        {reports.slice(index + 1).some((previous) => previous.batchId === report.batchId) ? 'Re-upload' : 'Initial upload'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-caption text-white/30">{report.batchId}</p>
                  </div>
                  <span className="text-caption text-white/40">{formatDateTime(report.completedAt || report.createdAt)}</span>
                  <span className="text-caption text-white/40">{report.photosUploaded} photos</span>
                  <span className={`text-caption font-semibold uppercase ${reportTone(report.status)}`}>{report.status.replace(/_/g, ' ')}</span>
                </summary>
                <div className="divide-y divide-white/[0.05] border-t border-white/[0.06] bg-black/10">
                  {report.clients.map((client) => (
                    <div key={client.bookingId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold">{client.customerName}</p>
                          <span className={`text-caption font-semibold uppercase ${reportTone(client.status)}`}>{client.status}</span>
                        </div>
                        <p className="mt-1 text-caption text-white/30">{client.packageName} · {client.bookingId}</p>
                        {client.lastError ? <p className="mt-1 text-caption text-red-300/70">{client.lastError}</p> : null}
                      </div>
                      <span className="text-caption text-white/40">{client.uploadedFiles} / {client.expectedFiles} photos</span>
                      <span className={`text-caption font-semibold ${client.storageReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {client.storageReady ? 'Storage ready' : 'Storage needs attention'}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ProgressCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-white/[0.07] bg-black/10 p-3">
      <p className="text-caption font-semibold uppercase tracking-wider text-white/25">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
    </div>
  )
}
