'use client'

import { useEffect, useRef } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'

export default function FileDeleteDialog({ fileName, busy, error, onClose, onDelete }: {
  fileName: string | null
  busy: boolean
  error: string
  onClose: () => void
  onDelete: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!element || !fileName) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    cancel.current?.focus()
    return () => {
      element.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [fileName])

  return <dialog ref={dialog} aria-labelledby="delete-file-title" aria-describedby="delete-file-description"
    aria-busy={busy} onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#202020] p-5 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop:bg-black/70">
    <h2 id="delete-file-title" className="text-base font-semibold">Delete this file?</h2>
    <p id="delete-file-description" className="mt-2 break-words text-sm leading-6 text-white/70">{fileName} will be permanently removed from private studio storage. This cannot be undone.</p>
    {error ? <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}
    <div className="mt-6 flex justify-end gap-2">
      <button ref={cancel} type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-white/75 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50">Cancel</button>
      <button type="button" onClick={onDelete} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white outline-none hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-wait disabled:opacity-60">{busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin"/> : <Trash2 aria-hidden="true" className="size-4"/>}{busy ? 'Deleting…' : 'Delete file'}</button>
    </div>
  </dialog>
}
