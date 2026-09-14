'use client'

import { memo } from 'react'
import { Check, ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react'
import { PhotoSelectButton } from '@/components/portal-photo-preview'
import PortalPrivateImage from '@/components/portal-private-image'
import type { ClientGalleryFile } from '@/components/client-photo-selection'
import styles from './portal-workspace.module.css'

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)

const ContactPhoto = memo(function ContactPhoto({ file, included, extra, focused, locked, extraPrice, selectionOrder, onFocus, onToggle, onPreview }: {
  file: ClientGalleryFile; included: boolean; extra: boolean; focused: boolean; locked: boolean; extraPrice: number; selectionOrder?: number
  onFocus: (id: string) => void; onToggle: (id: string) => void; onPreview: (file: ClientGalleryFile) => void
}) {
  return <article className={styles.thumb}>
    <div className="relative">
      <PhotoSelectButton file={file} locked={locked} className={styles.photo}
        selected={included || extra} focused={focused} extra={extra} desktopBreakpoint="(min-width: 901px)"
        onDesktopPreview={() => onFocus(file.id)} onSelect={() => { onFocus(file.id); onToggle(file.id) }} onPreview={onPreview}>
        <PortalPrivateImage src={file.previewUrl} alt={file.fileName} />
        {included || extra ? <span className={`${styles.selectedMark} ${extra ? styles.extraMark : ''}`} aria-hidden="true">{selectionOrder}</span> : null}
      </PhotoSelectButton>
      <button type="button" className={styles.zoom} aria-label={`Zoom ${file.fileName}`} onClick={() => onPreview(file)}><ZoomIn size={17} strokeWidth={1.5} /></button>
    </div>
    <div className={styles.thumbMeta}><span className={styles.filename}>{file.fileName}</span>{included || extra ? <span className={`${styles.photoStatus} ${extra ? styles.extraStatus : ''}`}>{extra ? `Extra ${money(extraPrice)}` : 'Included'}</span> : null}</div>
  </article>
})

export default function PortalPhotoContactSheet({ gallery, galleryTotal, selectedFiles, filter, onFilter, included, extras, includedLimit, extraPrice, activeFile, locked, photosComplete, loadingMore, showPhotoTip, onDismissPhotoTip, onFocus, onToggle, onPreview, onLoadMore, onContinue }: {
  gallery: ClientGalleryFile[]; galleryTotal: number; included: string[]; extras: string[]; includedLimit: number; extraPrice: number
  selectedFiles: ClientGalleryFile[]; filter: 'all' | 'selected'; onFilter: (filter: 'all' | 'selected') => void
  activeFile: ClientGalleryFile | null; locked: boolean; photosComplete: boolean; loadingMore: boolean
  showPhotoTip: boolean; onDismissPhotoTip: () => void
  onFocus: (id: string) => void; onToggle: (id: string) => void; onPreview: (file: ClientGalleryFile) => void
  onLoadMore: () => void; onContinue: () => void
}) {
  const selected = new Set([...included, ...extras])
  const selectionOrder = new Map([...included, ...extras].map((id, index) => [id, index + 1]))
  const files = filter === 'selected' ? selectedFiles : gallery
  const activeIndex = files.findIndex(file => file.id === activeFile?.id)
  const missing = Math.max(0, includedLimit - included.length)
  const ctaLabel = missing ? `Choose ${missing} more` : photosComplete ? 'Continue to Free Prints' : 'Choose an editing preference'
  const photoTip = (placementClass: string) => showPhotoTip ? <aside className={`${styles.photoTip} ${placementClass}`} aria-label="Photo viewing tip">
    <ZoomIn className={styles.photoTipIcon} size={17} strokeWidth={1.6} aria-hidden="true" />
    <p aria-live="polite"><strong>Tip:</strong> Hold a photo to zoom.</p>
    <button type="button" className={styles.photoTipDismiss} onClick={onDismissPhotoTip} aria-label="Dismiss photo viewing tip"><X size={17} strokeWidth={1.6} aria-hidden="true" /></button>
  </aside> : null
  return <div className={styles.workspace}>
    <div className={styles.galleryPane}>
      <div className={styles.toolbar}>
        <div className={styles.galleryCount}>{galleryTotal} photos</div>
        <div className={styles.filters}><button type="button" className={styles.chip} aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>All</button><button type="button" className={styles.chip} aria-pressed={filter === 'selected'} onClick={() => onFilter('selected')}>Selected {selectedFiles.length}</button></div>
      </div>
      {files.length ? <div className={styles.gallery} data-testid="portal-contact-sheet">{files.map(file => <ContactPhoto key={file.id} file={file}
        included={included.includes(file.id)} extra={extras.includes(file.id)} focused={activeFile?.id === file.id} locked={locked} extraPrice={extraPrice} selectionOrder={selectionOrder.get(file.id)}
        onFocus={onFocus} onToggle={onToggle} onPreview={onPreview} />)}</div> : <p className={styles.empty}>{filter === 'selected' ? 'Your selected photos will appear here.' : 'Your studio gallery is still being prepared.'}</p>}
      {filter === 'all' && gallery.length < galleryTotal ? <button type="button" className={`${styles.secondary} ${styles.loadMore}`} onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading more…' : `Load more photos (${gallery.length} of ${galleryTotal})`}</button> : null}
    </div>
    <aside className={styles.preview} aria-label="Large photo preview">
      <div className={styles.previewTop}><strong>Photo preview</strong><span>{activeFile && selected.has(activeFile.id) ? extras.includes(activeFile.id) ? 'Extra photo' : 'Included photo' : 'Not selected'}</span></div>
      {activeFile ? <>
        <button type="button" className={styles.previewCanvas} onClick={() => onPreview(activeFile)} aria-label={`Zoom ${activeFile.fileName}`}><PortalPrivateImage key={activeFile.id} src={activeFile.previewUrl} alt={activeFile.fileName} fit="contain" eager /></button>
        <div className={styles.previewFooter}><p className={styles.filename}>{activeFile.fileName}</p><p className={styles.description}>{extras.includes(activeFile.id) ? `Extra enhancement, ${money(extraPrice)}` : included.includes(activeFile.id) ? 'Included in your selection' : 'Use the button below to select this photo.'}</p>
          <div className={styles.previewActions}>
            <button type="button" className={styles.iconButton} disabled={activeIndex <= 0} aria-label="Previous photo" onClick={() => onFocus(files[activeIndex - 1].id)}><ChevronLeft size={17} strokeWidth={1.5} /></button>
            <button type="button" className={styles.previewChoice} disabled={locked} aria-pressed={selected.has(activeFile.id)} onClick={() => onToggle(activeFile.id)}>{selected.has(activeFile.id) ? <><Check size={15} strokeWidth={1.5} />Deselect photo</> : included.length >= includedLimit ? `Add for ${money(extraPrice)}` : 'Select photo'}</button>
            <button type="button" className={styles.iconButton} disabled={activeIndex < 0 || activeIndex >= files.length - 1} aria-label="Next photo" onClick={() => onFocus(files[activeIndex + 1].id)}><ChevronRight size={17} strokeWidth={1.5} /></button>
          </div>
          {!locked ? <div className={styles.desktopContinueCluster}>{photoTip(styles.desktopPhotoTip)}<button type="button" className={`${styles.primary} ${styles.previewContinue}`} onClick={onContinue} disabled={!photosComplete}><span>{ctaLabel}</span>{photosComplete ? <span className={styles.buttonIcon} aria-hidden="true">→</span> : null}</button></div> : null}
        </div>
      </> : <p className={styles.empty}>Your photo preview will appear here.</p>}
    </aside>
    {!locked ? <div className={styles.dock}>{photoTip(styles.mobilePhotoTip)}<button type="button" className={styles.primary} onClick={onContinue} disabled={!photosComplete}><span>{ctaLabel}</span>{photosComplete ? <span className={styles.buttonIcon} aria-hidden="true">→</span> : null}</button></div> : null}
  </div>
}
