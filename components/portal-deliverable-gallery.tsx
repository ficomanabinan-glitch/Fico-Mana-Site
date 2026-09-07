'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
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
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {files.map(file => <PhotoSelectButton key={file.id} file={file} locked
        onSelect={() => setPreviewId(file.id)} onPreview={photo => setPreviewId(photo.id)}
        className="group overflow-hidden border border-white/10 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#C4CEFF]/40 hover:shadow-[0_14px_32px_rgba(0,0,0,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70">
        <div className="aspect-[4/5] overflow-hidden bg-black/20">
          {/* Keep the protected URL stable so the grid and viewer reuse the same cached photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.previewUrl} alt={file.fileName} draggable={false} loading="lazy" decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"/>
        </div>
        <div className="flex items-center justify-between gap-2 p-2 text-caption text-white/45 transition-colors duration-300 group-hover:bg-white/[0.04] group-hover:text-white/75">
          <span className="truncate">{file.fileName}</span>
          <ExternalLink className="size-3 shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"/>
        </div>
      </PhotoSelectButton>)}
    </div>
    {previewFile ? <PortalPhotoPreview key={previewFile.id} file={previewFile} onClose={() => setPreviewId(null)}/> : null}
  </>
}
