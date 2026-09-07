'use client'

import { useEffect, useState } from 'react'
import { ZoomIn } from 'lucide-react'
import type { ClientGalleryFile } from '@/components/client-photo-selection'
import { PhotoSelectButton, PortalPhotoPreview } from '@/components/portal-photo-preview'

/** Delivered photos use the selection gallery's gestures without changing any selections. */
export default function PortalDeliverableGallery({ files }: { files: ClientGalleryFile[] }) {
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewFile = files.find(file => file.id === previewId) ?? null

  useEffect(() => {
    if (previewId && !previewFile) setPreviewId(null)
  }, [previewId, previewFile])

  return <>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {files.map(file => <article key={file.id} className="group overflow-hidden rounded-xl border border-white/10 transition-all hover:-translate-y-0.5 hover:border-[#C4CEFF]/40">
        <PhotoSelectButton file={file} locked
          onSelect={() => setPreviewId(file.id)} onPreview={photo => setPreviewId(photo.id)}>
          <div className="aspect-[4/5] overflow-hidden bg-black/20">
            {/* Keep the protected URL stable so the grid and viewer reuse the same cached photo. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.previewUrl} alt={file.fileName} draggable={false} loading="lazy" decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"/>
          </div>
        </PhotoSelectButton>
        <div className="flex items-center justify-between gap-2 bg-[#1d1d1d] p-2.5">
          <p className="min-w-0 truncate text-caption text-white/45">{file.fileName}</p>
          <button type="button" onClick={() => setPreviewId(file.id)} aria-label={`Preview ${file.fileName}`}
            title="Preview photo (or press and hold the image)"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-[#C4CEFF] transition hover:border-[#C4CEFF]/40 hover:bg-white/5">
            <ZoomIn className="size-4"/>
          </button>
        </div>
      </article>)}
    </div>
    {previewFile ? <PortalPhotoPreview key={previewFile.id} file={previewFile} onClose={() => setPreviewId(null)}/> : null}
  </>
}
