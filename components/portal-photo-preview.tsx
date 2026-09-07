'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import type { ClientGalleryFile } from '@/components/client-photo-selection'

export function PhotoSelectButton({ file, locked, onSelect, onPreview, children }: {
  file: ClientGalleryFile; locked: boolean; onSelect: () => void; onPreview: (file: ClientGalleryFile) => void; children: ReactNode
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const press = useRef<{ id: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; press.current = null }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return <button type="button" aria-label={`${locked ? 'Preview' : 'Select'} ${file.fileName}. Hold to preview.`}
    className="relative block w-full cursor-pointer select-none text-left" style={{ WebkitTouchCallout: 'none' }}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return
      clear(); suppressClick.current = false
      press.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => { suppressClick.current = true; clear(); onPreview(file) }, 450)
    }}
    onPointerMove={event => { const start = press.current; if (start && (event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10)) clear() }}
    onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear}
    onContextMenu={event => event.preventDefault()}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { clear(); suppressClick.current = false } }}
    onClick={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; return } if (locked) onPreview(file); else onSelect() }}>
    {children}
  </button>
}

export function PortalPhotoPreview({ file, onClose }: { file: ClientGalleryFile | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [zoom, setZoom] = useState(1)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const element = dialog.current
    if (!file || !element) return
    element.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow }
  }, [file])
  if (!file) return null
  return <dialog ref={dialog} aria-labelledby="portal-preview-title" onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === dialog.current) onClose() }}
    className="m-auto w-[94vw] max-w-5xl overflow-hidden rounded-xl border border-white/15 bg-[#171717] p-0 text-white shadow-2xl backdrop:bg-black/85">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3 sm:p-4">
      <h3 id="portal-preview-title" className="min-w-0 truncate text-xs font-semibold">{file.fileName}</h3>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 1))} className="rounded-lg border border-white/15 p-2 hover:bg-white/10 disabled:opacity-30"><ZoomOut className="size-4"/></button>
        <span className="w-10 text-center text-[10px]">{zoom * 100}%</span>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 1))} className="rounded-lg border border-white/15 p-2 hover:bg-white/10 disabled:opacity-30"><ZoomIn className="size-4"/></button>
        <button type="button" autoFocus aria-label="Close photo preview" onClick={onClose} className="rounded-lg border border-white/15 p-2 hover:bg-white/10"><X className="size-4"/></button>
      </div>
    </div>
    <div className="max-h-[75dvh] overflow-auto overscroll-contain bg-black/25">
      {failed ? <p role="alert" className="p-8 text-center text-xs text-white/60">Preview unavailable. Try: close and reopen the photo. If it continues, refresh your portal.</p> :
        // Protected preview URL, never a public RAW-original link. Reuse the grid's cached image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.previewUrl} alt={file.fileName} draggable={false} decoding="async" onError={() => setFailed(true)}
          className="block object-contain" style={{ width: `${zoom * 100}%`, maxWidth: 'none', maxHeight: zoom === 1 ? '75dvh' : undefined }}/>
      }
    </div>
    <p className="p-3 text-center text-[10px] text-white/40">{zoom > 1 ? 'Scroll to inspect the photo. Use − to fit it back on screen.' : 'Full preview · Use + to inspect details.'}</p>
  </dialog>
}
