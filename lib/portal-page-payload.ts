import type { getPortalData } from './editor-workflow'

/** Shared by SSR and subsequent API reads; provider credentials and private storage keys stay on the server. */
export function portalPagePayload(publicId: string, data: Awaited<ReturnType<typeof getPortalData>>) {
  const base = `/api/editor-workflow/portal/${encodeURIComponent(publicId)}`
  const canDownload = data.booking.packageCategory === 'self-portrait' || data.selection?.status === 'SUBMITTED'
  return {
    ...data,
    gallery: data.gallery.map(file => ({ ...file, previewUrl: `${base}/file/${encodeURIComponent(file.id)}?kind=gallery` })),
    selectedGallery: (data.selectedGallery || []).map(file => ({ ...file, previewUrl: `${base}/file/${encodeURIComponent(file.id)}?kind=gallery` })),
    deliverables: data.deliverables.map(file => ({ ...file, previewUrl: `${base}/file/${encodeURIComponent(file.id)}?kind=deliverable` })),
    downloadAllUrl: `${base}/deliverables-folder`,
    rawDownloadAllUrl: canDownload && data.rawDownloadAccess?.allowed ? `${base}/raw-photos-folder` : null,
    rawDownloadRequestUrl: canDownload ? `${base}/raw-download-request` : null,
  }
}
