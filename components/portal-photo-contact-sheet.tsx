'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { PhotoSelectButton } from '@/components/portal-photo-preview'
import PortalPrivateImage from '@/components/portal-private-image'
import type { ClientGalleryFile } from '@/components/client-photo-selection'
import styles from './portal-workspace.module.css'

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)

const ContactPhoto = memo(function ContactPhoto({ file, included, extra, focused, locked, extraPrice, onFocus, onToggle, onPreview }: {
  file: ClientGalleryFile; included: boolean; extra: boolean; focused: boolean; locked: boolean; extraPrice: number
  onFocus: (id: string) => void; onToggle: (id: string) => void; onPreview: (file: ClientGalleryFile) => void
}) {
  return <article className={styles.thumb}>
    <div className="relative">
      <PhotoSelectButton file={file} locked={locked} className={styles.photo}
        selected={included || extra} focused={focused} extra={extra} desktopBreakpoint="(min-width: 901px)"
        onDesktopPreview={() => onFocus(file.id)} onSelect={() => { onFocus(file.id); onToggle(file.id) }} onPreview={onPreview}>
        <PortalPrivateImage src={file.previewUrl} alt={file.fileName} />
        {included || extra ? <span className={`${styles.selectedMark} ${extra ? styles.extraMark : ''}`}><Check size={15} /></span> : null}
      </PhotoSelectButton>
      <button type="button" className={styles.zoom} aria-label={`Zoom ${file.fileName}`} onClick={() => onPreview(file)}><ZoomIn size={17} /></button>
    </div>
    <div className={styles.thumbMeta}><span className={styles.filename}>{file.fileName}</span>{included || extra ? <span className={styles.photoStatus}>{extra ? `+${money(extraPrice)}` : 'Included'}</span> : null}</div>
  </article>
})

export default function PortalPhotoContactSheet({ gallery, galleryTotal, included, extras, includedLimit, extraPrice, activeFile, locked, photosComplete, loadingMore, onFocus, onToggle, onPreview, onLoadMore, onContinue }: {
  gallery: ClientGalleryFile[]; galleryTotal: number; included: string[]; extras: string[]; includedLimit: number; extraPrice: number
  activeFile: ClientGalleryFile | null; locked: boolean; photosComplete: boolean; loadingMore: boolean
  onFocus: (id: string) => void; onToggle: (id: string) => void; onPreview: (file: ClientGalleryFile) => void
  onLoadMore: () => void; onContinue: () => void
}) {
  const [filter, setFilter] = useState<'all' | 'selected'>('all')
  const [tipVisible, setTipVisible] = useState(false)
  const galleryPane = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = galleryPane.current
    if (!element || !dock.current) return
    const position = () => {
      if (!window.matchMedia('(min-width: 901px)').matches) { dock.current?.style.removeProperty('--portal-cta-left'); return }
      const box = element.getBoundingClientRect()
      dock.current?.style.setProperty('--portal-cta-left', `${box.left + box.width / 2}px`)
    }
    const observer = new ResizeObserver(position)
    observer.observe(element)
    window.addEventListener('resize', position)
    position()
    return () => { observer.disconnect(); window.removeEventListener('resize', position) }
  }, [])
  useEffect(() => {
    if (!window.matchMedia('(max-width: 900px)').matches) return
    const key = 'fico:portal:long-press-tip:v1'
    let count = 0
    try { count = Number(sessionStorage.getItem(key) || 0) } catch { /* UI hint remains optional. */ }
    if (count >= 2) return
    const show = () => {
      count++
      try { sessionStorage.setItem(key, String(count)) } catch { /* UI hint remains optional. */ }
      setTipVisible(true)
    }
    const timers = [setTimeout(show, 1200), setTimeout(() => setTipVisible(false), 4200)]
    if (count === 0) timers.push(setTimeout(show, 11200), setTimeout(() => setTipVisible(false), 14200))
    return () => timers.forEach(clearTimeout)
  }, [])
  const selected = new Set([...included, ...extras])
  const files = filter === 'selected' ? gallery.filter(file => selected.has(file.id)) : gallery
  const activeIndex = gallery.findIndex(file => file.id === activeFile?.id)
  const missing = Math.max(0, includedLimit - included.length)
  const ctaLabel = missing ? `Select ${missing} more photo${missing === 1 ? '' : 's'}` : photosComplete ? 'Continue to Free Prints →' : 'Choose an editing preference'
  return <div className={styles.workspace}>
    <div className={styles.galleryPane} ref={galleryPane}>
      <div className={styles.toolbar}>
        <div><div className={styles.kicker}>Contact sheet · {galleryTotal} photos</div><p className={styles.mobileInstructions}>Tap to include · Long press to preview</p></div>
        <div className={styles.filters}><button type="button" className={styles.chip} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button><button type="button" className={styles.chip} aria-pressed={filter === 'selected'} onClick={() => setFilter('selected')}>Selected</button></div>
      </div>
      {files.length ? <div className={styles.gallery} data-testid="portal-contact-sheet">{files.map(file => <ContactPhoto key={file.id} file={file}
        included={included.includes(file.id)} extra={extras.includes(file.id)} focused={activeFile?.id === file.id} locked={locked} extraPrice={extraPrice}
        onFocus={onFocus} onToggle={onToggle} onPreview={onPreview} />)}</div> : <p className={styles.empty}>{filter === 'selected' ? 'Your selected photos will appear here.' : 'Your studio gallery is still being prepared.'}</p>}
      {gallery.length < galleryTotal ? <button type="button" className={`${styles.secondary} ${styles.loadMore}`} onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading more…' : `Load More Photos (${gallery.length} / ${galleryTotal})`}</button> : null}
    </div>
    <aside className={styles.preview} aria-label="Large photo preview">
      <div className={styles.previewTop}><span className={styles.kicker}>Large preview</span><span>{activeFile && selected.has(activeFile.id) ? extras.includes(activeFile.id) ? 'Extra enhanced photo' : 'Included photo' : 'Available photo'}</span></div>
      {activeFile ? <>
        <button type="button" className={styles.previewCanvas} onClick={() => onPreview(activeFile)} aria-label={`Zoom ${activeFile.fileName}`}><PortalPrivateImage src={activeFile.previewUrl} alt={activeFile.fileName} fit="contain" eager /></button>
        <div className={styles.previewFooter}><p className={styles.filename}>{activeFile.fileName}</p><p className={styles.description}>{extras.includes(activeFile.id) ? `Additional enhancement · ${money(extraPrice)}` : included.includes(activeFile.id) ? 'Included in your enhanced-photo selection' : 'Previewing this photo does not select it.'}</p>
          <div className={styles.previewActions}>
            <button type="button" className={styles.iconButton} disabled={activeIndex <= 0} aria-label="Previous photo" onClick={() => onFocus(gallery[activeIndex - 1].id)}><ChevronLeft size={17} /></button>
            <button type="button" className={styles.primary} disabled={locked} aria-pressed={selected.has(activeFile.id)} onClick={() => onToggle(activeFile.id)}>{selected.has(activeFile.id) ? <><Check size={15} />Deselect Photo</> : 'Select Photo'}</button>
            <button type="button" className={styles.iconButton} disabled={activeIndex < 0 || activeIndex >= gallery.length - 1} aria-label="Next photo" onClick={() => onFocus(gallery[activeIndex + 1].id)}><ChevronRight size={17} /></button>
          </div>
        </div>
      </> : <p className={styles.empty}>Your photo preview will appear here.</p>}
    </aside>
    {!locked ? <div className={styles.dock} ref={dock}><button type="button" className={styles.primary} onClick={onContinue} disabled={!photosComplete}>{ctaLabel}</button></div> : null}
    {tipVisible ? <div className={styles.longPressTip} role="status">Tip: Long Press to view the photo</div> : null}
  </div>
}
