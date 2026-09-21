'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Folder, LoaderCircle, Trash2 } from 'lucide-react'
import { FOLDER_DELETE_CONFIRMATION } from '@/lib/file-management-delete'

export type ExpiredRawCleanupPreview = {
  confirmationToken: string
  retentionDays: number
  fileCount: number
  bytes: number
  folders: Array<{
    bookingId: string
    customerName: string
    shootDate: string
    portalExpiredAt: string
    fileCount: number
    bytes: number
  }>
}

function sizeLabel(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`
}

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
  }).format(date)
}

export default function ExpiredRawCleanupDialog({ open, preview, loading, busy, error, onClose, onDelete }: {
  open: boolean
  preview: ExpiredRawCleanupPreview | null
  loading: boolean
  busy: boolean
  error: string
  onClose: () => void
  onDelete: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [confirmation, setConfirmation] = useState('')
  const matches = confirmation === FOLDER_DELETE_CONFIRMATION

  useEffect(() => {
    const element = dialog.current
    if (!element || !open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmation('')
    element.showModal()
    return () => {
      element.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  useEffect(() => {
    if (preview?.fileCount && !loading) window.setTimeout(() => input.current?.focus(), 0)
  }, [loading, preview?.fileCount])

  const hasCandidates = Boolean(preview?.fileCount && preview.folders.length)
  return <dialog ref={dialog} aria-labelledby="expired-raw-cleanup-title" aria-describedby="expired-raw-cleanup-description"
    aria-busy={loading || busy} onCancel={(event) => { event.preventDefault(); if (!loading && !busy) onClose() }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#202020] p-0 text-white shadow-[0_24px_72px_rgba(0,0,0,0.55)] backdrop:bg-black/75">
    <div className="border-b border-white/[0.08] p-5 sm:p-6">
      <span className="grid size-10 place-items-center rounded-xl bg-red-400/10 text-red-200"><AlertTriangle aria-hidden="true" className="size-5"/></span>
      <h2 id="expired-raw-cleanup-title" className="mt-4 text-lg font-semibold tracking-[-0.01em]">Delete all eligible RAW photos?</h2>
      <p id="expired-raw-cleanup-description" className="mt-2 max-w-[64ch] text-sm leading-6 text-white/65">
        This permanently removes original camera files only after the client portal has been expired for the configured grace period. Enhanced, final, and print files are not included.
      </p>
    </div>

    <div className="p-5 sm:p-6">
      {loading ? <div className="flex min-h-40 items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-black/10 text-sm text-white/65"><LoaderCircle className="size-4 animate-spin"/>Checking eligible folders…</div> : null}
      {!loading && preview ? <>
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-white/[0.08] bg-black/10 p-4 text-center">
          <div><strong className="block text-lg tabular-nums">{preview.folders.length}</strong><span className="text-xs text-white/55">Folders</span></div>
          <div><strong className="block text-lg tabular-nums">{preview.fileCount.toLocaleString()}</strong><span className="text-xs text-white/55">RAW photos</span></div>
          <div><strong className="block text-lg tabular-nums">{sizeLabel(preview.bytes)}</strong><span className="text-xs text-white/55">Recoverable</span></div>
        </div>
        {hasCandidates ? <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55">Folders that will be deleted</h3>
          <div className="mt-2 max-h-64 divide-y divide-white/[0.07] overflow-y-auto rounded-xl border border-white/[0.09] bg-black/10">
            {preview.folders.map((folder) => <div key={folder.bookingId} className="flex items-start gap-3 p-3.5">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-red-400/[0.08] text-red-200"><Folder className="size-4"/></span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{folder.customerName}</strong><span className="mt-1 block text-xs leading-5 text-white/55">{folder.bookingId} · Shoot {folder.shootDate}<br/>Portal expired {dateLabel(folder.portalExpiredAt)}</span></span>
              <span className="shrink-0 text-right text-xs text-white/55"><strong className="block font-medium text-white/75">{folder.fileCount} files</strong>{sizeLabel(folder.bytes)}</span>
            </div>)}
          </div>
          <label className="mt-5 block text-xs font-semibold text-white/75" htmlFor="expired-raw-delete-confirmation">Type <span className="font-mono text-red-200">{FOLDER_DELETE_CONFIRMATION}</span> to continue</label>
          <input ref={input} id="expired-raw-delete-confirmation" value={confirmation} disabled={busy} autoComplete="off" spellCheck={false}
            onChange={(event) => setConfirmation(event.target.value)} placeholder={FOLDER_DELETE_CONFIRMATION}
            className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-red-200/60 focus:ring-2 focus:ring-red-200/15 disabled:opacity-60"/>
          <p className="mt-2 text-xs text-white/45">The phrase is case-sensitive. This cannot be undone.</p>
        </div> : <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] p-4 text-sm leading-6 text-emerald-100/80">No RAW folders are eligible. A folder appears here only after delivery and {preview.retentionDays} full days have passed since portal expiry.</div>}
      </> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={loading || busy} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white/75 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50">Cancel</button>
        {hasCandidates ? <button type="button" onClick={onDelete} disabled={busy || loading || !matches} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white outline-none hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin"/> : <Trash2 aria-hidden="true" className="size-4"/>}
          {busy ? 'Deleting RAW photos…' : 'Delete all RAW photos'}
        </button> : null}
      </div>
    </div>
  </dialog>
}
