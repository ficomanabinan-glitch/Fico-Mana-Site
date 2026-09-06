'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  FileCheck2,
  FolderOpen,
  FolderUp,
  RefreshCw,
  UploadCloud,
} from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { EditorPageSkeleton } from '@/components/editor-page-skeleton'
import { adminBtnGhost, adminBtnPrimary, adminPanel } from '@/lib/admin-ui'
import {
  detectBatchFolders,
  pickedFilesFromDrop,
  pickedFilesFromList,
  uploadDetectedBatch,
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
  editedFolderUrl: string
  deliverablesFolderUrl: string
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
  const [dragActive, setDragActive] = useState(false)
  const [reading, setReading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [failedOnly, setFailedOnly] = useState(initialFailedOnly)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [results, setResults] = useState<UploadResult[]>([])
  const [runErrors, setRunErrors] = useState<string[]>([])
  const [reports, setReports] = useState<UploadReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)

  const loadReports = useCallback(async (silent = false) => {
    if (!silent) setReportsLoading(true)
    try {
      const response = await fetch('/api/editor-workflow/uploads/report?limit=40', {
        cache: 'no-store',
        credentials: 'include',
      })
      const body = (await response.json().catch(() => [])) as UploadReport[] & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load upload history.')
      setReports(Array.isArray(body) ? body : [])
    } catch (error) {
      toast.error('Upload report unavailable', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setReportsLoading(false)
    }
  }, [toast])

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

  const inspect = async (files: Awaited<ReturnType<typeof pickedFilesFromDrop>>) => {
    if (!files.length) return
    setReading(true)
    setResults([])
    setRunErrors([])
    setProgress(null)
    try {
      const batches = await detectBatchFolders(files)
      if (!batches.length) {
        throw new Error('No trusted Fico Mana manifest was found. Use an extracted folder downloaded from the Editing Queue.')
      }
      const selected = initialBatchId
        ? batches.filter((batch) => batch.manifest.batch_id === initialBatchId)
        : batches
      if (!selected.length) {
        throw new Error(`This folder does not contain the expected batch ${initialBatchId}.`)
      }
      setDetected(selected)
      const clientCount = selected.reduce((sum, batch) => sum + batch.manifest.clients.length, 0)
      toast.success(
        selected.length === 1 ? 'Batch folder ready' : 'Batch folders ready',
        `${selected.length} batch${selected.length === 1 ? '' : 'es'} · ${clientCount} client${clientCount === 1 ? '' : 's'} detected.`,
      )
    } catch (error) {
      setDetected([])
      toast.error('Folder not accepted', error instanceof Error ? error.message : 'Choose a valid Fico Mana batch folder.')
    } finally {
      setReading(false)
      if (input.current) input.current.value = ''
    }
  }

  const chooseFolder = () => input.current?.click()

  const startUpload = async () => {
    if (!detected.length || uploading) return
    setUploading(true)
    setResults([])
    setRunErrors([])
    let completed = 0
    let failed = 0
    for (const batch of detected) {
      try {
        const outcome = await uploadDetectedBatch(batch, {
          failedOnly,
          onProgress: setProgress,
          onResult: (result) => setResults((current) => [...current, result]),
        })
        completed += outcome.summary.completedClients
        failed += outcome.summary.failedClients
      } catch (error) {
        const message = `${batch.manifest.batch_id}: ${error instanceof Error ? error.message : 'Upload failed.'}`
        failed += 1
        setRunErrors((current) => [...current, message])
      }
    }
    setUploading(false)
    await loadReports(true)
    if (failed > 0) {
      toast.warning('Upload finished with failures', `${completed} client${completed === 1 ? '' : 's'} delivered · ${failed} failed.`)
    } else {
      toast.success('Upload complete', `${completed} client${completed === 1 ? '' : 's'} delivered to Google Drive.`)
    }
  }

  const selectedClients = detected.reduce((sum, batch) => sum + batch.manifest.clients.length, 0)
  const selectedFiles = detected.reduce((sum, batch) => sum + batch.files.length, 0)
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
        multiple
        className="hidden"
        onChange={(event) => void inspect(pickedFilesFromList(event.target.files || []))}
      />

      <div className="border-b border-white/[0.08] pb-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#C4CEFF]">Upload Photos</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Return edited batches to Google Drive</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/40">
          Drop the extracted batch folder. Fico Mana reads its trusted manifest, matches every client,
          and sends only photos inside each EDITED folder to the correct Drive destination.
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
          You can also select a day, week, or month folder. Multiple batch manifests are detected automatically.
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
        <section className={`${adminPanel} overflow-hidden`}>
          <div className="flex flex-col gap-4 border-b border-white/[0.08] p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">Ready to upload</p>
              <h2 className="mt-1 text-base font-semibold">
                {detected.length} batch{detected.length === 1 ? '' : 'es'} · {selectedClients} clients
              </h2>
              <p className="mt-1 text-[10px] text-white/35">{selectedFiles} total folder files inspected</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-[10px] text-white/55">
                <input
                  type="checkbox"
                  checked={failedOnly}
                  onChange={(event) => setFailedOnly(event.target.checked)}
                  disabled={uploading}
                  className="accent-[#0500D0]"
                />
                Retry failed clients only
              </label>
              <button
                type="button"
                onClick={() => void startUpload()}
                disabled={uploading}
                className={`${adminBtnPrimary} inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-40`}
              >
                <UploadCloud className="size-4" />
                {uploading ? 'Uploading…' : 'Upload to Google Drive'}
              </button>
            </div>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {detected.map((batch) => (
              <div key={batch.manifest.batch_id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold">{batch.manifest.shoot_date}</p>
                  <p className="mt-1 font-mono text-[9px] text-white/30">{batch.manifest.batch_id}</p>
                </div>
                <span className="text-[10px] text-white/40">{batch.manifest.clients.length} clients</span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-300">
                  <FileCheck2 className="size-3.5" />Manifest verified
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {uploading || progress || results.length > 0 || runErrors.length > 0 ? (
        <section className={`${adminPanel} p-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Upload progress</p>
              <h2 className="mt-1 text-base font-semibold">
                {uploading ? progress?.clientName || 'Preparing the batch…' : 'Latest upload result'}
              </h2>
              <p className="mt-1 text-[10px] text-white/35">
                {progress?.batchId || detected[0]?.manifest.batch_id}
                {progress?.currentFile ? ` · ${progress.currentFile}` : ''}
              </p>
            </div>
            <span className={`text-2xl font-bold ${runErrors.length ? 'text-red-300' : 'text-[#C4CEFF]'}`}>{percent}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${runErrors.length ? 'bg-red-400' : 'bg-[#6678FF]'}`}
              style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <ProgressCell label="Clients" value={`${progress?.clientsDone || 0} / ${progress?.clientsTotal || 0}`} />
            <ProgressCell label="Photos" value={`${progress?.filesDone || 0} / ${progress?.filesTotal || 0}`} />
            <ProgressCell label="Data" value={`${formatBytes(progress?.bytesDone || 0)} / ${formatBytes(progress?.bytesTotal || 0)}`} />
          </div>
          {results.length || runErrors.length ? (
            <div className="mt-5 divide-y divide-white/[0.06] border border-white/[0.07]">
              {results.map((result, index) => (
                <div key={`${result.bookingId}-${index}`} className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{result.customerName || result.bookingId}</p>
                    <p className="mt-1 font-mono text-[9px] text-white/30">{result.bookingId}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className={result.status === 'DELIVERED' ? 'text-emerald-300' : 'text-red-300'}>
                      {result.status === 'DELIVERED' ? 'Uploaded' : 'Upload failed'}
                    </p>
                    <p className="mt-1 text-[10px] text-white/35">Folder files {result.expected} · Registered {result.uploaded}</p>
                    {result.error ? <p className="mt-1 max-w-lg text-[10px] text-red-300/70">{result.error}</p> : null}
                  </div>
                </div>
              ))}
              {runErrors.map((error) => (
                <div key={error} className="flex items-start gap-2 p-3 text-[10px] text-red-300">
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
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Upload report</p>
            <h2 className="mt-1 text-base font-semibold">Folders and clients already uploaded</h2>
            <p className="mt-1 text-[10px] text-white/35">
              {latestReport ? `Latest: ${formatDateTime(latestReport.completedAt || latestReport.createdAt)}` : 'No uploads recorded yet'}
              {failedReports ? ` · ${failedReports} failed client${failedReports === 1 ? '' : 's'} in recent runs` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadReports()}
            disabled={reportsLoading}
            className={`${adminBtnGhost} inline-flex items-center gap-2 px-3 py-2 disabled:opacity-40`}
          >
            <RefreshCw className={`size-3.5 ${reportsLoading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
        {reportsLoading ? (
          <EditorPageSkeleton variant="queue" />
        ) : reports.length === 0 ? (
          <div className="p-12 text-center text-xs text-white/35">Completed and failed uploads will appear here.</div>
        ) : (
          <div className="divide-y divide-white/[0.08]">
            {reports.map((report) => (
              <details key={report.id} className="group">
                <summary className="grid cursor-pointer list-none gap-3 p-4 hover:bg-white/[0.025] sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                  <div>
                    <p className="text-sm font-semibold">{report.shootDate || 'Batch upload'}</p>
                    <p className="mt-1 font-mono text-[9px] text-white/30">{report.batchId}</p>
                  </div>
                  <span className="text-[10px] text-white/40">{formatDateTime(report.completedAt || report.createdAt)}</span>
                  <span className="text-[10px] text-white/40">{report.photosUploaded} photos</span>
                  <span className={`text-[9px] font-bold uppercase ${reportTone(report.status)}`}>{report.status.replace(/_/g, ' ')}</span>
                </summary>
                <div className="divide-y divide-white/[0.05] border-t border-white/[0.06] bg-black/10">
                  {report.clients.map((client) => (
                    <div key={client.bookingId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold">{client.customerName}</p>
                          <span className={`text-[8px] font-bold uppercase ${reportTone(client.status)}`}>{client.status}</span>
                        </div>
                        <p className="mt-1 text-[9px] text-white/30">{client.packageName} · {client.bookingId}</p>
                        {client.lastError ? <p className="mt-1 text-[10px] text-red-300/70">{client.lastError}</p> : null}
                      </div>
                      <span className="text-[10px] text-white/40">{client.uploadedFiles} / {client.expectedFiles} photos</span>
                      <div className="flex flex-wrap gap-2">
                        {client.editedFolderUrl ? (
                          <a href={client.editedFolderUrl} target="_blank" rel="noopener noreferrer" className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}>
                            Drive Folder <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                        {client.deliverablesFolderUrl ? (
                          <a href={client.deliverablesFolderUrl} target="_blank" rel="noopener noreferrer" className={`${adminBtnGhost} inline-flex items-center gap-1.5 px-3 py-2`}>
                            Delivery <ExternalLink className="size-3" />
                          </a>
                        ) : null}
                      </div>
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
    <div className="border border-white/[0.07] bg-black/10 p-3">
      <p className="text-[8px] font-bold uppercase tracking-wider text-white/25">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  )
}
