'use client'

import { useEffect, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { adminBtnGhost, adminInput, adminLabel, adminModal, adminSelect } from '@/lib/admin-ui'
import type { CleanupCategory, CleanupOutcome, CleanupRange } from '@/lib/shoot-storage-cleanup'

const categories: { id: CleanupCategory; label: string }[] = [
  { id: 'RAW', label: 'RAW photos' }, { id: 'SELECTED', label: 'Selected photo copies' },
  { id: 'EDITED', label: 'Edited photos' }, { id: 'DELIVERABLES', label: 'Client deliverables' },
]
const dangerButton = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-400/30 px-4 py-3 text-xs font-semibold text-red-200 transition-colors hover:border-red-400/60 hover:bg-red-400/10 disabled:pointer-events-none disabled:opacity-40'
type Shoot = { id: string; name: string; date: string }
type Chunk = { token: string; files: { id: string; name: string; category: CleanupCategory }[] }
type Preview = { bookingId: string; name: string; date: string; chunks: Chunk[]; skippedShortcuts: number; expiresAt: number
  folder?: { id: string; name: string; fileCount: number; subfolderCount: number; shortcutCount: number } }
type Report = { bookingId: string; name: string; done: number; failed: number; message?: string }

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Request failed. Try: refresh and review the files again.')
  return body
}

export default function ShootStorageCleanup() {
  const dialog = useRef<HTMLDialogElement>(null)
  const inFlight = useRef(false)
  const stop = useRef(false)
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<CleanupRange>('7days')
  const [scope, setScope] = useState<'files' | 'folder'>('files')
  const [chosen, setChosen] = useState<CleanupCategory[]>([])
  const [previews, setPreviews] = useState<Preview[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState<'review' | 'delete' | null>(null)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [reports, setReports] = useState<Report[]>([])
  const [finished, setFinished] = useState(false)
  const [processed, setProcessed] = useState(0)
  const folderMode = scope === 'folder'
  const confirmationText = folderMode ? 'DELETE SHOOT FOLDERS' : 'DELETE SHOOT FILES'
  const targetLabel = folderMode ? 'shoot folders' : 'files'

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current?.close()
  }, [open])
  useEffect(() => {
    if (!busy) return
    const preventLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLeaving)
    return () => window.removeEventListener('beforeunload', preventLeaving)
  }, [busy])

  function resetReview() {
    setReviewed(false); setPreviews([]); setSelected(new Set()); setConfirmation('')
    setAcknowledged(false); setReports([]); setErrors([]); setFinished(false); setProcessed(0); setProgress('')
  }

  async function review() {
    if (inFlight.current || (!folderMode && !chosen.length)) return
    inFlight.current = true; stop.current = false; resetReview(); setBusy('review')
    const collected: Preview[] = []
    try {
      const shoots: Shoot[] = []
      let cursor = ''
      do {
        setProgress('Finding shoots in the selected time range…')
        const params = new URLSearchParams({ range, cursor })
        const page = await readResponse<{ shoots: Shoot[]; nextCursor: string | null }>(await fetch(`/api/admin/shoot-storage?${params}`, { cache: 'no-store', credentials: 'include' }))
        shoots.push(...page.shoots)
        cursor = page.nextCursor || ''
        if (shoots.length > 5000) throw new Error('Too many shoots for one review. Try: choose a shorter time range.')
      } while (cursor && !stop.current)
      for (const [index, shoot] of shoots.entries()) {
        if (stop.current) break
        setProgress(`Reviewing shoot ${index + 1} of ${shoots.length}: ${shoot.name}`)
        const params = new URLSearchParams({ range, bookingId: shoot.id, scope })
        if (!folderMode) params.set('categories', chosen.join(','))
        try {
          const item = await readResponse<Preview>(await fetch(`/api/admin/shoot-storage?${params}`, { cache: 'no-store', credentials: 'include' }))
          if (folderMode && !item.folder) throw new Error('Folder cleanup is not ready. Try: refresh this page and review again.')
          collected.push(item)
          setPreviews([...collected])
        } catch (error) {
          setErrors(current => [...current, `${shoot.name}: ${error instanceof Error ? error.message : 'Review failed. Try again.'}`])
        }
      }
      if (!stop.current) {
        setSelected(new Set(collected.filter(item => item.chunks.length).map(item => item.bookingId)))
        setReviewed(true)
        setProgress('Review complete. Nothing has been deleted.')
      } else setProgress('Review stopped. Nothing has been deleted. Review again to continue.')
    } catch (error) {
      setErrors(current => [...current, error instanceof Error ? error.message : 'Review failed. Try again.'])
    } finally { inFlight.current = false; setBusy(null) }
  }

  const selectedPreviews = previews.filter(item => selected.has(item.bookingId))
  const totalFiles = selectedPreviews.reduce((sum, item) => sum + (folderMode ? item.folder?.fileCount || 0 : item.chunks.reduce((count, chunk) => count + chunk.files.length, 0)), 0)
  const targetCount = folderMode ? selectedPreviews.length : totalFiles

  async function clearFiles() {
    if (inFlight.current || !reviewed || finished || !targetCount || !acknowledged || confirmation !== confirmationText) return
    if (selectedPreviews.some(item => item.expiresAt <= Date.now())) {
      setErrors(['This review expired. Try: press Review files again before deleting.']); return
    }
    inFlight.current = true; stop.current = false; setBusy('delete'); setErrors([]); setReports([]); setProcessed(0)
    let count = 0
    const results: Report[] = []
    try {
      for (const shoot of selectedPreviews) {
        if (stop.current) break
        const report: Report = { bookingId: shoot.bookingId, name: shoot.name, done: 0, failed: 0 }
        results.push(report)
        for (const chunk of shoot.chunks) {
          if (stop.current) break
          setProgress(`Moving ${targetLabel} to Trash: ${shoot.name}`)
          try {
            const body = await readResponse<{ results: CleanupOutcome[] }>(await fetch('/api/admin/shoot-storage', {
              method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: chunk.token, confirmation }),
            }))
            report.done += body.results.filter(result => result.status !== 'failed').length
            report.failed += body.results.filter(result => result.status === 'failed').length
            if (body.results.some(result => result.status === 'failed')) {
              report.message = `Some ${targetLabel} were not confirmed in Trash. Try: check Drive access and review again.`
              stop.current = true
            }
          } catch (error) {
            report.failed += folderMode ? 1 : chunk.files.length
            report.message = error instanceof Error ? error.message : 'Result not confirmed. Try: check Drive Trash and review again.'
            // An uncertain response is never blindly replayed or followed by more destructive requests.
            stop.current = true
          }
          count += folderMode ? 1 : chunk.files.length; setProcessed(count); setReports(results.map(item => ({ ...item })))
          // Stay below the existing shared admin mutation limit during large cleanups.
          if (!stop.current) await new Promise(resolve => setTimeout(resolve, 2100))
        }
      }
      setFinished(true); setConfirmation(''); setAcknowledged(false)
      setProgress(stop.current ? 'Cleanup stopped. Review again to check any remaining files.' : 'Cleanup finished. See the report below.')
    } finally { inFlight.current = false; setBusy(null) }
  }

  return <>
    <button type="button" className={dangerButton} onClick={() => setOpen(true)}><Trash2 className="size-3.5" />Delete shoots</button>
    <dialog ref={dialog} aria-labelledby="shoot-cleanup-title" aria-describedby="shoot-cleanup-description"
      onCancel={event => { if (busy) event.preventDefault(); else setOpen(false) }} onClose={() => setOpen(false)}
      className={`${adminModal} m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto p-0 text-white backdrop:bg-black/75 backdrop:backdrop-blur-sm`}>
      <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
        <div><h2 id="shoot-cleanup-title" className="text-lg font-semibold">Delete shoot files or folders</h2>
          <p id="shoot-cleanup-description" className="mt-1 text-xs leading-relaxed text-white/50">Choose a time range and what to clear, then review the files before confirming.</p></div>
        <button type="button" aria-label="Close storage cleanup" disabled={!!busy} className="cursor-pointer rounded-lg p-2 text-white/60 hover:bg-white/10 disabled:opacity-40" onClick={() => setOpen(false)}><X className="size-4" /></button>
      </div>
      <div className="space-y-5 p-5">
        <div><label htmlFor="cleanup-scope" className={adminLabel}>What to delete</label>
          <select id="cleanup-scope" className={`${adminSelect} mt-2`} value={scope} disabled={!!busy}
            onChange={event => { setScope(event.target.value as 'files' | 'folder'); resetReview() }}>
            <option value="files">Selected photo files</option><option value="folder">Entire shoot folder</option>
          </select>
          <p className="mt-2 text-xs text-white/40">{folderMode ? 'Includes each selected client’s shoot folder and everything inside it. Empty folders can be selected.' : 'Keeps the client folders. To remove an empty folder too, choose Entire shoot folder.'}</p>
        </div>
        <div><label htmlFor="cleanup-range" className={adminLabel}>Time range</label>
          <select id="cleanup-range" className={`${adminSelect} mt-2`} value={range} disabled={!!busy}
            onChange={event => { setRange(event.target.value as CleanupRange); resetReview() }}>
            <option value="7days">Last 7 days</option><option value="month">Last month (30 days)</option><option value="all">All time</option>
          </select>
          <p className="mt-2 text-xs text-white/40">Based on the scheduled shoot date, in GMT+8. Recent ranges include today; All time also includes future shoots.</p>
        </div>
        {!folderMode && <fieldset disabled={!!busy}><legend className={adminLabel}>Files to clear</legend>
          <div className="mt-3 space-y-3">{categories.map(category => <label key={category.id} className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="size-4 accent-red-400" checked={chosen.includes(category.id)} onChange={event => {
              setChosen(current => event.target.checked ? [...current, category.id] : current.filter(id => id !== category.id)); resetReview()
            }} />{category.label}
          </label>)}</div>
        </fieldset>}
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100/90">
          {folderMode ? 'Selected client shoot folders and all their contents go to Google Drive Trash, not permanent deletion. This includes non-photo files, nested folders, and shortcut objects, but not the files those shortcuts point to. The main storage root, month/day folders, other clients, bookings, payments, receipts, photo selections, thumbnails, and activity records are kept.' : 'Files go to Google Drive Trash, not permanent deletion. Folder structure, bookings, payments, receipts, photo selections, thumbnails, and activity records are kept. Only files inside this system’s registered shoot folders are included; shortcuts and unrelated files are excluded.'}
          <p className="mt-2">Affected client portals and their QR access will be disabled. Stored photo counts and selection history are retained. Restore the files from Drive Trash before reactivating a portal. Google Drive normally removes trashed files after 30 days; they still use storage space until then. Existing direct Drive sharing permissions are not changed.</p>
          <p className="mt-2">Finish any uploads and avoid moving or changing shoot files while cleanup is running. {folderMode ? 'Folder contents are checked again before removal. Restore the entire folder from Trash before reactivating its portal.' : 'Only the files in this review will be moved.'}</p>
        </div>
        <button type="button" className={`${adminBtnGhost} cursor-pointer px-4 py-3 disabled:pointer-events-none disabled:opacity-40`} disabled={!!busy || (!folderMode && !chosen.length)} onClick={() => void review()}>{busy === 'review' ? `Reviewing ${targetLabel}…` : folderMode ? 'Review folders' : 'Review files'}</button>
        {progress && <p role="status" className="break-words text-xs text-white/60">{progress}</p>}
        {busy === 'review' && <div aria-label="Reviewing shoot storage" className="space-y-2 motion-safe:animate-pulse">{[1, 2, 3].map(id => <div key={id} className="h-12 rounded-lg bg-white/5" />)}</div>}
        {errors.length > 0 && <div role="alert" className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-amber-400/20 p-3 text-xs text-amber-200">{errors.map((error, index) => <p key={index}>{error}</p>)}</div>}
        {reviewed && <section aria-label="Cleanup preview" className="space-y-3">
          <h3 className="text-sm font-semibold">{folderMode ? `${selectedPreviews.length} shoot folders selected · ${totalFiles} files inside` : `${totalFiles} files · ${selectedPreviews.length} shoots selected`}</h3>
          {previews.length === 0 && <p className="text-xs text-white/50">No available shoots matched this review. Any review failures are shown above.</p>}
          <div className="max-h-64 space-y-2 overflow-y-auto">{previews.map(item => {
            const files = item.chunks.flatMap(chunk => chunk.files)
            const selectable = folderMode ? !!item.folder : !!files.length
            return <div key={item.bookingId} className="rounded-lg border border-white/10 p-3">
              <label className={`flex items-start gap-3 text-xs ${selectable && !busy && !finished ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-red-400" disabled={!!busy || finished || !selectable} checked={selected.has(item.bookingId)}
                  aria-describedby={!selectable ? `cleanup-empty-${item.bookingId}` : undefined}
                  onChange={event => { setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(item.bookingId); else next.delete(item.bookingId); return next }); setConfirmation(''); setAcknowledged(false) }} />
                <span className="min-w-0 break-words"><strong>{item.name}</strong><span className="mt-1 block text-white/50">{item.date} · {item.bookingId} · {folderMode ? `${item.folder?.fileCount || 0} files · ${item.folder?.subfolderCount || 0} subfolders` : `${files.length} files`}</span>
                  {folderMode && item.folder && <span className="mt-1 block text-white/50">Folder: {item.folder.name}{item.folder.shortcutCount ? ` · ${item.folder.shortcutCount} shortcut objects` : ''}</span>}</span>
              </label>
              {!selectable && <p id={`cleanup-empty-${item.bookingId}`} className="mt-2 text-xs text-amber-200">No matching files to delete. Try: choose Entire shoot folder to remove this client’s folder, even if it is empty.</p>}
              {!!files.length && <details className="mt-2 text-xs text-white/50"><summary className="cursor-pointer">View file summary</summary>
                <ul className="mt-2 space-y-1">{categories.map(category => <li key={category.id}>{category.label}: {files.filter(file => file.category === category.id).length}</li>)}</ul>
                <ul className="mt-2 break-all">{files.slice(0, 20).map(file => <li key={file.id}>{file.name}</li>)}</ul>
                {files.length > 20 && <p className="mt-1">And {files.length - 20} more files in these categories.</p>}
              </details>}
              {!!item.skippedShortcuts && <p className="mt-2 text-xs text-amber-200">{item.skippedShortcuts} shortcuts excluded.</p>}
            </div>
          })}</div>
          {!finished && !!targetCount && <>
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed"><input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-red-400" checked={acknowledged} disabled={!!busy} onChange={event => setAcknowledged(event.target.checked)} />{folderMode ? 'I understand that each selected shoot folder and everything inside it will move to Trash, including empty folders, and affected client portals will be disabled. Booking and payment records are kept.' : 'I understand that selected files will move to Trash and the affected client portals will be disabled. Records are retained, and files must be restored before those portals are reactivated.'}</label>
            <label htmlFor="cleanup-confirmation" className="block text-xs text-white/60">Type <strong>{confirmationText}</strong> to confirm</label>
            <input id="cleanup-confirmation" className={adminInput} autoComplete="off" spellCheck={false} value={confirmation} disabled={!!busy} onChange={event => setConfirmation(event.target.value)} />
            <button type="button" className={`${dangerButton} w-full`} disabled={!!busy || !acknowledged || confirmation !== confirmationText} onClick={() => void clearFiles()}><Trash2 className="size-4" />Move {targetCount} {targetLabel} to Trash</button>
          </>}
        </section>}
        {(busy === 'delete' || finished) && <div className="space-y-2"><progress aria-label="Storage cleanup progress" className="h-2 w-full accent-red-400" max={Math.max(1, targetCount)} value={processed} /><p className="text-xs text-white/50">{processed} of {targetCount} {targetLabel} processed. Keep this page open.</p></div>}
        {reports.length > 0 && <section aria-label="Cleanup report" className="space-y-2"><h3 className="text-sm font-semibold">Cleanup report</h3>{reports.map(report => <div key={report.bookingId} className="rounded-lg border border-white/10 p-3 text-xs"><p>{report.name}: {report.done} confirmed in Trash · {report.failed} failed or unconfirmed</p>{report.message && <p className="mt-2 text-amber-200">{report.message}</p>}</div>)}<p className="text-xs text-white/50">The activity log keeps a record of each attempted cleanup. Review again to check remaining files; already-trashed files are excluded.</p></section>}
        {busy && <button type="button" className={`${adminBtnGhost} cursor-pointer px-4 py-3`} onClick={() => { stop.current = true; setProgress('Stopping after the current request…') }}>Stop after current request</button>}
      </div>
    </dialog>
  </>
}
