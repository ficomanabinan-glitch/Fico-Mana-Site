'use client'
import { useEffect, useState } from 'react'
import type { ClientGalleryFile } from './client-photo-selection'
import { PortalPhotoPreview } from './portal-photo-preview'
import PortalPrivateImage from './portal-private-image'
import styles from './portal-workspace.module.css'

/** Only published, authorized deliverables supplied by the portal API appear here. */
export default function PortalDeliverableGallery({ files }: { files: ClientGalleryFile[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const active = files.find(file => file.id === activeId) || files[0]
  useEffect(() => {
    if (!files.length || activeId && !files.some(file => file.id === activeId)) { setPreviewOpen(false); setActiveId(null) }
  }, [files, activeId])
  if (!active) return null
  return <div className={styles.deliveredGallery}>
    <button type="button" className={styles.deliveredHero} aria-label={`Preview ${active.fileName}`} onClick={() => { setActiveId(active.id); setPreviewOpen(true) }}><PortalPrivateImage src={active.previewUrl} alt={active.fileName} fit="contain" eager /></button>
    <p className={styles.metadata}>{active.fileName} · {files.indexOf(active) + 1} of {files.length}</p>
    <div className={styles.filmstrip} aria-label="Published enhanced photos">{files.map(file => <button type="button" key={file.id} aria-label={`View ${file.fileName}`} aria-pressed={active.id === file.id} onClick={() => setActiveId(file.id)}><PortalPrivateImage src={file.previewUrl} alt={file.fileName} /></button>)}</div>
    {previewOpen && files.some(file => file.id === activeId) ? <PortalPhotoPreview key={active.id} file={active} files={files} onFileChange={file => setActiveId(file.id)} onClose={() => setPreviewOpen(false)} /> : null}
  </div>
}
