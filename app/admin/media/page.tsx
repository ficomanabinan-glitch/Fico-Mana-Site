'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FileVideo, Image as ImageIcon, Plus, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react'
import * as tus from 'tus-js-client'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminBtnGhost, adminBtnPrimary, adminInput, adminLabel, adminPage, adminPanel } from '@/lib/admin-ui'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { getSupabaseKey } from '@/lib/supabase/env'
import {
  DEFAULT_WEBSITE_MEDIA,
  WEBSITE_MEDIA_GALLERY_SLOT_KEYS,
  createWebsiteMediaGalleryPlaceholder,
  isWebsiteMediaGallerySlotKey,
  mergeWebsiteMedia,
  websiteMediaSlotIndex,
  type WebsiteMediaSlot,
  type WebsiteMediaSlotKey,
} from '@/lib/website-media'
import { optimizeWebsiteGalleryImage } from '@/lib/website-media-image'

type UploadState = {
  status: 'preparing' | 'uploading' | 'publishing' | 'failed'
  percent: number
  message: string
}

type UploadSession = {
  bucket: string
  path: string
  endpoint: string
  error?: string
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif'
const VIDEO_ACCEPT = 'video/mp4,video/webm'
const IMAGE_MAX_BYTES = 15 * 1024 * 1024
const IMAGE_SOURCE_MAX_BYTES = 40 * 1024 * 1024
const VIDEO_MAX_BYTES = 250 * 1024 * 1024

function formatBytes(value: number | null) {
  if (!value) return 'Bundled fallback'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}

function updateSlot(slots: WebsiteMediaSlot[], slot: WebsiteMediaSlot) {
  const found = slots.some((current) => current.slotKey === slot.slotKey)
  const next = found
    ? slots.map((current) => current.slotKey === slot.slotKey ? slot : current)
    : [...slots, slot]
  return next.sort((left, right) => websiteMediaSlotIndex(left.slotKey) - websiteMediaSlotIndex(right.slotKey))
}

export default function WebsiteMediaPage() {
  const toast = useAdminToast()
  const [media, setMedia] = useState<WebsiteMediaSlot[]>(() =>
    DEFAULT_WEBSITE_MEDIA.map((slot) => ({ ...slot })),
  )
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<WebsiteMediaSlotKey, File>>>({})
  const [uploadState, setUploadState] = useState<Partial<Record<WebsiteMediaSlotKey, UploadState>>>({})
  const [altDrafts, setAltDrafts] = useState<Partial<Record<WebsiteMediaSlotKey, string>>>({})
  const [savingDescription, setSavingDescription] = useState<WebsiteMediaSlotKey | null>(null)
  const [removingSlot, setRemovingSlot] = useState<WebsiteMediaSlotKey | null>(null)
  const activeUploads = useRef(new Map<WebsiteMediaSlotKey, tus.Upload>())
  const addGalleryInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}) => {
    if (refresh) setRefreshing(true)
    setLoadError('')
    try {
      const response = await fetch('/api/admin/website-media', { credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Website media could not be loaded.')
      const nextMedia = mergeWebsiteMedia(body)
      setMedia(nextMedia)
      setAltDrafts(Object.fromEntries(nextMedia.map((slot) => [slot.slotKey, slot.altText])))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Website media could not be loaded.'
      setLoadError(`${message} Try: refresh this page; if it continues, apply the website media database migration.`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => () => {
    for (const upload of activeUploads.current.values()) void upload.abort()
  }, [])

  const selectFile = async (slot: WebsiteMediaSlot, file: File | undefined) => {
    if (!file) return false
    const maxBytes = slot.kind === 'image' ? IMAGE_SOURCE_MAX_BYTES : VIDEO_MAX_BYTES
    const allowed = slot.kind === 'image'
      ? IMAGE_ACCEPT.split(',').includes(file.type)
      : VIDEO_ACCEPT.split(',').includes(file.type)
    if (!allowed || file.size > maxBytes) {
      toast.error(
        'File not accepted',
        slot.kind === 'image'
          ? 'Try: choose a JPG, PNG, WebP, or AVIF photo up to 40 MB. It will be optimized before upload.'
          : 'Try: choose an MP4 or WebM video up to 250 MB.',
      )
      return false
    }

    let preparedFile = file
    if (slot.kind === 'image') {
      setUploadState((current) => ({
        ...current,
        [slot.slotKey]: { status: 'preparing', percent: 0, message: 'Optimizing photo as WebP…' },
      }))
      try {
        preparedFile = await optimizeWebsiteGalleryImage(file)
        if (preparedFile.size > IMAGE_MAX_BYTES) {
          throw new Error('The optimized photo is still larger than 15 MB.')
        }
        toast.success(
          'Photo optimized',
          `${formatBytes(file.size)} → ${formatBytes(preparedFile.size)} WebP`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The photo could not be optimized.'
        setUploadState((current) => ({
          ...current,
          [slot.slotKey]: { status: 'failed', percent: 0, message },
        }))
        toast.error('Photo not ready', `${message} Try: choose another photo or export it as JPG/WebP first.`)
        return false
      }
    }

    setSelectedFiles((current) => ({ ...current, [slot.slotKey]: preparedFile }))
    setUploadState((current) => {
      const next = { ...current }
      delete next[slot.slotKey]
      return next
    })
    return true
  }

  const addGalleryPhoto = async (file: File | undefined) => {
    if (!file) return
    const used = new Set(media.filter((slot) => slot.kind === 'image').map((slot) => slot.slotKey))
    const slotKey = WEBSITE_MEDIA_GALLERY_SLOT_KEYS.find((key) => !used.has(key))
    if (!slotKey) {
      toast.info('Gallery is full', 'The public gallery supports a maximum of 10 photos.')
      return
    }
    const placeholder = createWebsiteMediaGalleryPlaceholder(slotKey)
    setMedia((current) => updateSlot(current, placeholder))
    setAltDrafts((current) => ({ ...current, [slotKey]: placeholder.altText }))
    const accepted = await selectFile(placeholder, file)
    if (!accepted) {
      setMedia((current) => current.filter((slot) => slot.slotKey !== slotKey))
      setAltDrafts((current) => {
        const next = { ...current }
        delete next[slotKey]
        return next
      })
    }
  }

  const removeGalleryPhoto = async (slot: WebsiteMediaSlot) => {
    if (slot.isPlaceholder) {
      setMedia((current) => current.filter((item) => item.slotKey !== slot.slotKey))
      setSelectedFiles((current) => {
        const next = { ...current }
        delete next[slot.slotKey]
        return next
      })
      setAltDrafts((current) => {
        const next = { ...current }
        delete next[slot.slotKey]
        return next
      })
      setUploadState((current) => {
        const next = { ...current }
        delete next[slot.slotKey]
        return next
      })
      return
    }
    if (!slot.isCustom || !isWebsiteMediaGallerySlotKey(slot.slotKey)) return
    const restoresFallback = websiteMediaSlotIndex(slot.slotKey) <= DEFAULT_WEBSITE_MEDIA.filter((item) => item.kind === 'image').length
    const prompt = restoresFallback
      ? `Restore the bundled fallback for ${slot.label}? The custom photo will be permanently removed.`
      : `Remove ${slot.label} from the public gallery? The uploaded photo will be permanently removed.`
    if (!window.confirm(prompt)) return

    setRemovingSlot(slot.slotKey)
    try {
      const response = await fetch('/api/admin/website-media', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotKey: slot.slotKey }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'The gallery photo could not be removed.')
      const nextMedia = mergeWebsiteMedia(body)
      setMedia(nextMedia)
      setAltDrafts(Object.fromEntries(nextMedia.map((item) => [item.slotKey, item.altText])))
      setSelectedFiles((current) => {
        const next = { ...current }
        delete next[slot.slotKey]
        return next
      })
      toast.success(restoresFallback ? 'Bundled photo restored' : 'Gallery photo removed', 'The public gallery has been updated.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The gallery photo could not be removed.'
      toast.error('Photo not removed', `${message} Try: refresh the page and try again.`)
    } finally {
      setRemovingSlot(null)
    }
  }

  const runResumableUpload = (
    slotKey: WebsiteMediaSlotKey,
    file: File,
    session: UploadSession,
    accessToken: string,
  ) => new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: session.endpoint,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: getSupabaseKey(),
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: session.bucket,
        objectName: session.path,
        contentType: file.type,
        cacheControl: '31536000',
      },
      onProgress: (uploaded, total) => {
        const percent = total ? Math.min(99, Math.round((uploaded / total) * 100)) : 0
        setUploadState((current) => ({
          ...current,
          [slotKey]: { status: 'uploading', percent, message: `Uploading ${percent}%` },
        }))
      },
      onError: (error) => reject(error),
      onSuccess: () => resolve(),
    })
    activeUploads.current.set(slotKey, upload)
    upload.start()
  })

  const publish = async (slot: WebsiteMediaSlot) => {
    const file = selectedFiles[slot.slotKey]
    if (!file) return
    const altText = (altDrafts[slot.slotKey] || '').trim()
    if (altText.length < 3) {
      toast.error('Description required', 'Try: enter a short, clear description before publishing this file.')
      return
    }

    setUploadState((current) => ({
      ...current,
      [slot.slotKey]: { status: 'preparing', percent: 0, message: 'Preparing secure upload…' },
    }))

    try {
      const sessionResponse = await fetch('/api/admin/website-media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_upload',
          slotKey: slot.slotKey,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      })
      const session = (await sessionResponse.json().catch(() => ({}))) as UploadSession
      if (!sessionResponse.ok) throw new Error(session.error || 'Secure upload could not be prepared.')

      // The access token is forwarded only to Supabase Storage. Authorization
      // decisions remain enforced by the server route and Storage RLS policy.
      const supabase = createSupabaseBrowserClient()
      const { data: authData, error: authError } = await supabase.auth.getSession()
      const accessToken = authData.session?.access_token
      if (authError || !accessToken) {
        throw new Error('Your secure session expired. Sign in and complete MFA again.')
      }

      await runResumableUpload(slot.slotKey, file, session, accessToken)
      setUploadState((current) => ({
        ...current,
        [slot.slotKey]: { status: 'publishing', percent: 100, message: 'Publishing to the website…' },
      }))

      const finalizeResponse = await fetch('/api/admin/website-media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize_upload',
          slotKey: slot.slotKey,
          path: session.path,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          altText,
        }),
      })
      const published = (await finalizeResponse.json().catch(() => ({}))) as WebsiteMediaSlot & { error?: string }
      if (!finalizeResponse.ok) throw new Error(published.error || 'The uploaded file could not be published.')

      setMedia((current) => updateSlot(current, published))
      setSelectedFiles((current) => {
        const next = { ...current }
        delete next[slot.slotKey]
        return next
      })
      setUploadState((current) => {
        const next = { ...current }
        delete next[slot.slotKey]
        return next
      })
      toast.success('Website media published', `${slot.label} is now live on ficomana.com.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.'
      setUploadState((current) => ({
        ...current,
        [slot.slotKey]: { status: 'failed', percent: 0, message },
      }))
      toast.error('Website media not published', `${message} Try: check your connection, keep this page open, then press Publish again.`)
    } finally {
      activeUploads.current.delete(slot.slotKey)
    }
  }

  const cancelUpload = async (slotKey: WebsiteMediaSlotKey) => {
    const upload = activeUploads.current.get(slotKey)
    if (upload) await upload.abort(true)
    activeUploads.current.delete(slotKey)
    setUploadState((current) => {
      const next = { ...current }
      delete next[slotKey]
      return next
    })
  }

  const saveDescription = async (slot: WebsiteMediaSlot) => {
    const altText = (altDrafts[slot.slotKey] || '').trim()
    if (!slot.isCustom) {
      toast.info('Using the bundled description', 'Upload a custom file to save a custom description for this slot.')
      return
    }
    setSavingDescription(slot.slotKey)
    try {
      const response = await fetch('/api/admin/website-media', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotKey: slot.slotKey, altText }),
      })
      const updated = (await response.json().catch(() => ({}))) as WebsiteMediaSlot & { error?: string }
      if (!response.ok) throw new Error(updated.error || 'Description could not be saved.')
      setMedia((current) => updateSlot(current, updated))
      toast.success('Description saved', `${slot.label} was updated.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Description could not be saved.'
      toast.error('Description not saved', `${message} Try: check the text and save again.`)
    } finally {
      setSavingDescription(null)
    }
  }

  const gallery = media.filter((slot) => slot.kind === 'image')
  const video = media.find((slot) => slot.kind === 'video')

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Website Media"
        subtitle="Manage up to 10 optimized graduation gallery photos and one featured reel on the public FICO MANA website."
        onRefresh={() => void load({ refresh: true })}
        refreshing={refreshing}
      >
        <Link href="https://www.ficomana.com/#gallery" target="_blank" rel="noreferrer" className={`${adminBtnGhost} inline-flex items-center gap-2 px-4 py-3`}>
          View Website <ExternalLink className="size-3.5" />
        </Link>
      </AdminPageHeader>

      <section className="rounded-xl border border-[#C4CEFF]/20 bg-[#0500D0]/10 p-4">
        <div className="flex gap-3">
          <Upload className="mt-0.5 size-5 shrink-0 text-[#C4CEFF]" />
          <div>
            <p className="text-xs font-semibold text-white">Changes publish after each upload finishes</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/50">
              Photos: JPG, PNG, WebP, or AVIF up to 40 MB. Photos are resized and converted to WebP before upload. Video: MP4 or WebM up to 250 MB.
            </p>
          </div>
        </div>
      </section>

      {loadError ? (
        <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4" role="alert">
          <p className="text-xs font-semibold text-red-200">Website media partially unavailable</p>
          <p className="mt-1 text-[11px] leading-relaxed text-red-100/65">{loadError}</p>
          <button type="button" onClick={() => void load({ refresh: true })} className={`${adminBtnGhost} mt-3 inline-flex items-center gap-2 px-3 py-2`}>
            <RefreshCw className="size-3.5" /> Try Again
          </button>
        </section>
      ) : null}

      {loading ? <MediaSkeleton /> : (
        <>
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-4 text-[#C4CEFF]" />
                <h2 className="text-sm font-semibold text-white">Graduation Gallery · {gallery.length} / 10 photos</h2>
              </div>
              <input
                ref={addGalleryInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  void addGalleryPhoto(event.target.files?.[0])
                  event.currentTarget.value = ''
                }}
              />
              <button
                type="button"
                disabled={gallery.length >= WEBSITE_MEDIA_GALLERY_SLOT_KEYS.length}
                onClick={() => addGalleryInputRef.current?.click()}
                className={`${adminBtnPrimary} inline-flex items-center gap-2 px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <Plus className="size-3.5" /> {gallery.length >= WEBSITE_MEDIA_GALLERY_SLOT_KEYS.length ? 'Maximum 10 Photos' : 'Add Gallery Photo'}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {gallery.map((slot) => (
                <MediaCard
                  key={slot.slotKey}
                  slot={slot}
                  selectedFile={selectedFiles[slot.slotKey]}
                  upload={uploadState[slot.slotKey]}
                  altText={altDrafts[slot.slotKey] ?? slot.altText}
                  savingDescription={savingDescription === slot.slotKey}
                  onAltText={(value) => setAltDrafts((current) => ({ ...current, [slot.slotKey]: value }))}
                  onFile={(file) => void selectFile(slot, file)}
                  onPublish={() => void publish(slot)}
                  onCancel={() => void cancelUpload(slot.slotKey)}
                  onSaveDescription={() => void saveDescription(slot)}
                  onRemove={() => void removeGalleryPhoto(slot)}
                  removing={removingSlot === slot.slotKey}
                />
              ))}
            </div>
          </section>

          {video ? (
            <section>
              <div className="mb-3 flex items-center gap-2">
                <FileVideo className="size-4 text-[#C4CEFF]" />
                <h2 className="text-sm font-semibold text-white">Featured Reel · 1 video</h2>
              </div>
              <div className="max-w-2xl">
                <MediaCard
                  slot={video}
                  selectedFile={selectedFiles[video.slotKey]}
                  upload={uploadState[video.slotKey]}
                  altText={altDrafts[video.slotKey] ?? video.altText}
                  savingDescription={savingDescription === video.slotKey}
                  onAltText={(value) => setAltDrafts((current) => ({ ...current, [video.slotKey]: value }))}
                  onFile={(file) => void selectFile(video, file)}
                  onPublish={() => void publish(video)}
                  onCancel={() => void cancelUpload(video.slotKey)}
                  onSaveDescription={() => void saveDescription(video)}
                />
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function MediaCard({
  slot,
  selectedFile,
  upload,
  altText,
  savingDescription,
  onAltText,
  onFile,
  onPublish,
  onCancel,
  onSaveDescription,
  onRemove,
  removing = false,
}: {
  slot: WebsiteMediaSlot
  selectedFile?: File
  upload?: UploadState
  altText: string
  savingDescription: boolean
  onAltText: (value: string) => void
  onFile: (file: File | undefined) => void
  onPublish: () => void
  onCancel: () => void
  onSaveDescription: () => void
  onRemove?: () => void
  removing?: boolean
}) {
  const inputId = `website-media-${slot.slotKey}`
  const busy = upload && upload.status !== 'failed'
  const [selectedPreview, setSelectedPreview] = useState('')

  useEffect(() => {
    if (!selectedFile) {
      setSelectedPreview('')
      return
    }
    const objectUrl = URL.createObjectURL(selectedFile)
    setSelectedPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  const displayUrl = selectedPreview || slot.url
  const removeLabel = slot.isPlaceholder
    ? 'Remove draft'
    : websiteMediaSlotIndex(slot.slotKey) <= 5
      ? 'Restore fallback'
      : 'Remove photo'

  return (
    <article className={`${adminPanel} overflow-hidden`}>
      <div className={`relative overflow-hidden bg-black ${slot.kind === 'image' ? 'aspect-[4/5]' : 'aspect-video'}`}>
        {slot.kind === 'image' && displayUrl ? (
          <Image src={displayUrl} alt={slot.altText} fill unoptimized={Boolean(selectedPreview)} sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw" className="object-cover" />
        ) : slot.kind === 'image' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white/[0.025] text-white/30">
            <ImageIcon className="size-10" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Choose a photo to publish</span>
          </div>
        ) : (
          <video key={displayUrl} src={displayUrl} controls playsInline preload="metadata" className="h-full w-full object-cover" aria-label={slot.altText} />
        )}
        <span className={`absolute left-3 top-3 rounded-md border px-2 py-1 text-[8px] font-bold uppercase tracking-wider backdrop-blur ${slot.isCustom ? 'border-emerald-500/30 bg-emerald-950/75 text-emerald-200' : 'border-white/15 bg-black/65 text-white/60'}`}>
          {selectedFile ? 'Optimized preview · Not live' : slot.isPlaceholder ? 'New slot · Not live' : slot.isCustom ? 'Custom · Live' : 'Bundled fallback · Live'}
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{slot.label}</p>
            <p className="mt-1 truncate text-[10px] text-white/35">{selectedFile?.name || slot.fileName} · {formatBytes(selectedFile?.size ?? slot.fileSize)}</p>
          </div>
          {onRemove && (slot.isPlaceholder || slot.isCustom) ? (
            <button type="button" onClick={onRemove} disabled={Boolean(busy) || removing} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/20 px-2.5 py-2 text-[9px] font-bold uppercase text-red-200/75 transition hover:border-red-300/40 hover:bg-red-400/[0.07] hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40">
              <Trash2 className="size-3" /> {removing ? 'Removing…' : removeLabel}
            </button>
          ) : null}
        </div>

        <label className="block space-y-2" htmlFor={`${inputId}-description`}>
          <span className={adminLabel}>{slot.kind === 'image' ? 'Photo description' : 'Video description'}</span>
          <div className="flex gap-2">
            <input
              id={`${inputId}-description`}
              value={altText}
              maxLength={180}
              onChange={(event) => onAltText(event.target.value)}
              className={adminInput}
              placeholder="Describe what visitors see"
            />
            <button type="button" onClick={onSaveDescription} disabled={!slot.isCustom || savingDescription || altText.trim() === slot.altText} className={`${adminBtnGhost} inline-flex shrink-0 items-center gap-1.5 px-3`} aria-label={`Save ${slot.label} description`}>
              <Save className="size-3.5" /> {savingDescription ? 'Saving…' : 'Save'}
            </button>
          </div>
        </label>

        <div className="space-y-2">
          <label htmlFor={inputId} className={`${adminBtnGhost} flex cursor-pointer items-center justify-center gap-2 px-4 py-3`}>
            <Upload className="size-3.5" /> Choose replacement
          </label>
          <input
            id={inputId}
            type="file"
            accept={slot.kind === 'image' ? IMAGE_ACCEPT : VIDEO_ACCEPT}
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={(event) => {
              onFile(event.target.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          {selectedFile ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="truncate text-xs font-medium text-white/75">{selectedFile.name}</p>
              <p className="mt-1 text-[10px] text-white/35">{formatBytes(selectedFile.size)}</p>
              {!busy ? (
                <button type="button" onClick={onPublish} className={`${adminBtnPrimary} mt-3 flex w-full items-center justify-center gap-2 px-4 py-3`}>
                  <Upload className="size-3.5" /> {upload?.status === 'failed' ? 'Retry Publish' : 'Publish Replacement'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {upload ? (
          <div className={`rounded-lg border p-3 ${upload.status === 'failed' ? 'border-red-500/30 bg-red-500/10' : 'border-[#C4CEFF]/20 bg-[#0500D0]/10'}`} role="status">
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <span className={upload.status === 'failed' ? 'text-red-200' : 'text-[#C4CEFF]'}>{upload.message}</span>
              {upload.status === 'uploading' ? <span className="tabular-nums text-white/55">{upload.percent}%</span> : null}
            </div>
            {upload.status !== 'failed' ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/35">
                <div className="h-full rounded-full bg-[#C4CEFF] transition-[width] duration-200" style={{ width: `${Math.max(3, upload.percent)}%` }} />
              </div>
            ) : null}
            {busy ? (
              <button type="button" onClick={onCancel} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-white/45 hover:text-white">
                <X className="size-3" /> Cancel upload
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function MediaSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Loading website media">
      <div className="h-4 w-52 rounded bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={`${adminPanel} overflow-hidden`}>
            <div className="aspect-[4/5] bg-white/[0.06]" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-28 rounded bg-white/10" />
              <div className="h-10 rounded bg-white/[0.06]" />
              <div className="h-10 rounded bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
