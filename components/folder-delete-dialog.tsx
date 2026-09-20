'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react'
import { FOLDER_DELETE_CONFIRMATION } from '@/lib/file-management-delete'

export default function FolderDeleteDialog({ folderName, fileCount, busy, error, onClose, onDelete }: {
  folderName: string | null
  fileCount: number
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
    if (!element || !folderName) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmation('')
    element.showModal()
    window.setTimeout(() => input.current?.focus(), 0)
    return () => {
      element.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [folderName])

  return <dialog ref={dialog} aria-labelledby="delete-folder-title" aria-describedby="delete-folder-description"
    aria-busy={busy} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#202020] p-5 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop:bg-black/70">
    <span className="grid size-10 place-items-center rounded-xl bg-red-400/10 text-red-200"><AlertTriangle aria-hidden="true" className="size-5"/></span>
    <h2 id="delete-folder-title" className="mt-4 text-base font-semibold">Delete this folder?</h2>
    <p id="delete-folder-description" className="mt-2 break-words text-sm leading-6 text-white/70">
      <strong className="font-semibold text-white">{folderName}</strong> and {fileCount} {fileCount === 1 ? 'file' : 'files'} inside it will be permanently removed from private studio storage. This cannot be undone.
    </p>
    <label className="mt-5 block text-xs font-semibold text-white/75" htmlFor="folder-delete-confirmation">
      Type <span className="font-mono text-red-200">{FOLDER_DELETE_CONFIRMATION}</span> to continue
    </label>
    <input ref={input} id="folder-delete-confirmation" value={confirmation} disabled={busy} autoComplete="off" spellCheck={false}
      onChange={(event) => setConfirmation(event.target.value)}
      className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-black/20 px-3 font-mono text-sm text-white outline-none placeholder:text-white/30 focus:border-red-200/60 focus:ring-2 focus:ring-red-200/15 disabled:opacity-60"
      placeholder={FOLDER_DELETE_CONFIRMATION}/>
    <p className="mt-2 text-xs text-white/45">The phrase is case-sensitive.</p>
    {error ? <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white/75 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50">Cancel</button>
      <button type="button" onClick={onDelete} disabled={busy || !matches} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white outline-none hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin"/> : <Trash2 aria-hidden="true" className="size-4"/>}
        {busy ? 'Deleting folder…' : 'Delete folder'}
      </button>
    </div>
  </dialog>
}
