'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import type { ClientGalleryFile } from '@/components/client-photo-selection'
import { constrainPhotoView, FIT_PHOTO, MAX_PHOTO_ZOOM, transformPhotoGesture, zoomPhotoWithWheel, type PhotoPoint, type PhotoView } from '@/lib/photo-pan-zoom'

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
  const viewport = useRef<HTMLDivElement>(null)
  const photo = useRef<HTMLImageElement>(null)
  const [view, setView] = useState<PhotoView>(FIT_PHOTO)
  const currentView = useRef<PhotoView>(FIT_PHOTO)
  const pointers = useRef(new Map<number, PhotoPoint>())
  const gesture = useRef<{ view: PhotoView; points: PhotoPoint[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [failed, setFailed] = useState(false)
  const bounds = useCallback(() => ({
    width: viewport.current?.clientWidth ?? 0,
    height: viewport.current?.clientHeight ?? 0,
    imageWidth: photo.current?.naturalWidth || 1,
    imageHeight: photo.current?.naturalHeight || 1,
  }), [])
  const applyView = useCallback((next: PhotoView) => {
    const constrained = constrainPhotoView(next, bounds())
    currentView.current = constrained
    setView(constrained)
  }, [bounds])
  const rebaseGesture = () => {
    gesture.current = { view: currentView.current, points: [...pointers.current.values()] }
  }
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }
  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    rebaseGesture()
    setDragging(pointers.current.size > 0)
  }
  const zoomTo = (scale: number) => {
    applyView({ ...currentView.current, scale })
    rebaseGesture()
  }
  useEffect(() => {
    const element = viewport.current
    if (!file || !element || failed) return
    const onWheel = (event: WheelEvent) => {
      // React delegates wheel events passively. A local non-passive listener
      // keeps trackpad/browser zoom and page scrolling out of the photo viewer.
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      applyView(zoomPhotoWithWheel(currentView.current, event.deltaY, event.deltaMode,
        { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }, bounds()))
      gesture.current = { view: currentView.current, points: [...pointers.current.values()] }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [file, failed, applyView, bounds])
  useEffect(() => {
    const element = dialog.current
    if (!file || !element) return
    element.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const activePointers = pointers.current
    const observer = new ResizeObserver(() => applyView(currentView.current))
    if (viewport.current) observer.observe(viewport.current)
    return () => { observer.disconnect(); activePointers.clear(); element.close(); document.body.style.overflow = overflow }
  }, [file, applyView])
  if (!file) return null
  return <dialog ref={dialog} aria-labelledby="portal-preview-title" onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === dialog.current) onClose() }}
    className="m-auto w-[94vw] max-w-5xl overflow-hidden rounded-xl border border-white/15 bg-[#171717] p-0 text-white shadow-2xl backdrop:bg-black/85">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3 sm:p-4">
      <h3 id="portal-preview-title" className="min-w-0 truncate text-xs font-semibold">{file.fileName}</h3>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" aria-label="Zoom out" disabled={view.scale <= 1} onClick={() => zoomTo(Math.max(1, view.scale - 1))} className="rounded-lg border border-white/15 p-2 hover:bg-white/10 disabled:opacity-30"><ZoomOut className="size-4"/></button>
        <span className="w-10 text-center text-caption">{Math.round(view.scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" disabled={view.scale >= MAX_PHOTO_ZOOM} onClick={() => zoomTo(Math.min(MAX_PHOTO_ZOOM, view.scale + 1))} className="rounded-lg border border-white/15 p-2 hover:bg-white/10 disabled:opacity-30"><ZoomIn className="size-4"/></button>
        <button type="button" autoFocus aria-label="Close photo preview" onClick={onClose} className="rounded-lg border border-white/15 p-2 hover:bg-white/10"><X className="size-4"/></button>
      </div>
    </div>
    <div ref={viewport} role="region" aria-label="Photo preview. Pinch or scroll to zoom and drag to move. Arrow keys move a zoomed photo."
      tabIndex={0} className={`max-h-[75dvh] touch-none overflow-hidden overscroll-contain bg-black/25 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C4CEFF]/50 ${view.scale > 1 ? dragging ? 'cursor-grabbing' : 'cursor-grab' : ''}`}
      onPointerDown={event => {
        if (failed || event.button !== 0 || pointers.current.size >= 2) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        pointers.current.set(event.pointerId, point(event))
        event.currentTarget.setPointerCapture(event.pointerId)
        rebaseGesture()
        setDragging(true)
      }}
      onPointerMove={event => {
        if (!pointers.current.has(event.pointerId) || !gesture.current) return
        event.preventDefault()
        pointers.current.set(event.pointerId, point(event))
        applyView(transformPhotoGesture(gesture.current.view, gesture.current.points, [...pointers.current.values()], bounds()))
      }}
      onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
      onKeyDown={event => {
        const step = 48
        const moves: Record<string, PhotoPoint> = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } }
        const move = moves[event.key]
        if (move && view.scale > 1) { event.preventDefault(); applyView({ ...view, x: view.x + move.x, y: view.y + move.y }) }
      }}>
      {failed ? <p role="alert" className="p-8 text-center text-xs text-white/60">Preview unavailable. Try: close and reopen the photo. If it continues, refresh your portal.</p> :
        // Protected preview URL, never a public RAW-original link. Reuse the grid's cached image.
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={photo} src={file.previewUrl} alt={file.fileName} draggable={false} decoding="async" onError={() => setFailed(true)} onLoad={() => applyView(currentView.current)}
          className="pointer-events-none block w-full select-none object-contain" style={{ maxHeight: '75dvh', transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`, transformOrigin: 'center', willChange: dragging ? 'transform' : undefined }}/>
      }
    </div>
  </dialog>
}
