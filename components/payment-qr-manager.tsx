'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, LoaderCircle, RefreshCw, Upload, X } from 'lucide-react'
import * as tus from 'tus-js-client'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminBtnGhost, adminBtnPrimary, adminPanel } from '@/lib/admin-ui'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { getSupabaseKey } from '@/lib/supabase/env'
import {
  DEFAULT_WEBSITE_MEDIA,
  PAYMENT_QR_SLOT_KEY,
  mergeWebsiteMedia,
  type WebsiteMediaSlot,
} from '@/lib/website-media'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const MAX_FILE_BYTES = 15 * 1024 * 1024

type UploadSession = {
  bucket: string
  path: string
  endpoint: string
  error?: string
}

type UploadState = {
  phase: 'uploading' | 'publishing'
  progress: number
}

function fallbackPaymentQr() {
  return DEFAULT_WEBSITE_MEDIA.find((slot) => slot.slotKey === PAYMENT_QR_SLOT_KEY)!
}

function formatBytes(value: number | null) {
  if (!value) return 'Bundled fallback'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(value / 1024))} KB`
}

export default function PaymentQrManager() {
  const toast = useAdminToast()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const activeUpload = useRef<tus.Upload | null>(null)
  const [current, setCurrent] = useState<WebsiteMediaSlot>(fallbackPaymentQr)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedPreview, setSelectedPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [upload, setUpload] = useState<UploadState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/admin/website-media', {
        credentials: 'include',
        cache: 'no-store',
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'The payment QR could not be loaded.')
      const paymentQr = mergeWebsiteMedia(body).find((slot) => slot.slotKey === PAYMENT_QR_SLOT_KEY)
      setCurrent(paymentQr ?? fallbackPaymentQr())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'The payment QR could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => () => {
    void activeUpload.current?.abort(true)
  }, [])

  useEffect(() => {
    if (!selectedFile) {
      setSelectedPreview('')
      return
    }
    const objectUrl = URL.createObjectURL(selectedFile)
    setSelectedPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  const chooseFile = (file: File | undefined) => {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('QR image not accepted', 'Choose a JPG, PNG, WebP, or AVIF image.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('QR image is too large', 'Choose an image smaller than 15 MB.')
      return
    }
    setSelectedFile(file)
  }

  const runUpload = (file: File, session: UploadSession, accessToken: string) => new Promise<void>((resolve, reject) => {
    const uploader = new tus.Upload(file, {
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
        setUpload({ phase: 'uploading', progress: total ? Math.min(99, Math.round((uploaded / total) * 100)) : 0 })
      },
      onError: reject,
      onSuccess: () => resolve(),
    })
    activeUpload.current = uploader
    uploader.start()
  })

  const publish = async () => {
    if (!selectedFile || upload) return
    try {
      setUpload({ phase: 'uploading', progress: 0 })
      const sessionResponse = await fetch('/api/admin/website-media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_upload',
          slotKey: PAYMENT_QR_SLOT_KEY,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
        }),
      })
      const session = (await sessionResponse.json().catch(() => ({}))) as UploadSession
      if (!sessionResponse.ok) throw new Error(session.error || 'A secure upload could not be prepared.')

      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (error || !accessToken) throw new Error('Your secure session expired. Sign in again.')

      await runUpload(selectedFile, session, accessToken)
      setUpload({ phase: 'publishing', progress: 100 })
      const finalizeResponse = await fetch('/api/admin/website-media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize_upload',
          slotKey: PAYMENT_QR_SLOT_KEY,
          path: session.path,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          altText: 'BPI payment QR code for FICO MANA deposit',
        }),
      })
      const published = (await finalizeResponse.json().catch(() => ({}))) as WebsiteMediaSlot & { error?: string }
      if (!finalizeResponse.ok) throw new Error(published.error || 'The payment QR could not be published.')

      setCurrent(published)
      setSelectedFile(null)
      toast.success('Payment QR updated', 'New bookings now show this QR for the deposit payment.')
    } catch (error) {
      toast.error('Payment QR not updated', `${error instanceof Error ? error.message : 'The upload failed.'} Try: keep this page open and upload again.`)
    } finally {
      activeUpload.current = null
      setUpload(null)
    }
  }

  const cancel = async () => {
    await activeUpload.current?.abort(true)
    activeUpload.current = null
    setUpload(null)
  }

  const displayUrl = selectedPreview || current.url

  return (
    <section className={`${adminPanel} overflow-hidden`} aria-labelledby="payment-qr-title">
      <div className="grid lg:grid-cols-[minmax(240px,320px)_1fr]">
        <div className="relative aspect-square bg-white p-4 sm:p-6">
          {loading ? (
            <div className="flex h-full items-center justify-center text-[#11131A]/45">
              <LoaderCircle className="size-7 animate-spin" aria-label="Loading payment QR" />
            </div>
          ) : (
            <Image
              src={displayUrl}
              alt="BPI payment QR code preview"
              fill
              unoptimized={Boolean(selectedPreview)}
              sizes="(max-width: 1024px) 100vw, 320px"
              className="object-contain p-4 sm:p-6"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-6 p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="payment-qr-title" className="text-base font-semibold text-white">Payment QR</h2>
                <p className="mt-1 max-w-2xl text-caption leading-relaxed text-white/50">
                  This is the BPI QR shown while clients submit a booking deposit. Uploading a replacement publishes it to the booking page immediately.
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-caption font-semibold ${selectedFile ? 'border-amber-400/25 bg-amber-400/10 text-amber-200' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'}`}>
                {selectedFile ? <ImagePlus className="size-3.5" /> : <Check className="size-3.5" />}
                {selectedFile ? 'Preview · Not live' : 'Active on booking page'}
              </span>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
              <p className="truncate text-xs font-semibold text-white/75">{selectedFile?.name || current.fileName}</p>
              <p className="mt-1 text-caption text-white/40">
                {formatBytes(selectedFile?.size ?? current.fileSize)} · JPG, PNG, WebP, or AVIF · Maximum 15 MB
              </p>
            </div>

            {loadError ? (
              <div className="mt-4 rounded-xl border border-red-400/25 bg-red-400/[0.08] p-3" role="alert">
                <p className="text-xs font-semibold text-red-200">Could not confirm the saved QR</p>
                <p className="mt-1 text-caption leading-relaxed text-red-100/65">{loadError} The bundled QR remains visible as a safe fallback.</p>
                <button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-1.5 text-caption font-semibold text-red-100">
                  <RefreshCw className="size-3.5" /> Try again
                </button>
              </div>
            ) : null}
          </div>

          <div>
            {upload ? (
              <div className="mb-3 rounded-xl border border-[#C4CEFF]/20 bg-[#0500D0]/10 p-3" role="status">
                <div className="flex items-center justify-between gap-3 text-caption text-[#C4CEFF]">
                  <span>{upload.phase === 'publishing' ? 'Publishing to the booking page…' : `Uploading ${upload.progress}%`}</span>
                  <span className="tabular-nums text-white/55">{upload.progress}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/35">
                  <div className="h-full rounded-full bg-[#C4CEFF] transition-[width] duration-200" style={{ width: `${Math.max(3, upload.progress)}%` }} />
                </div>
                <button type="button" onClick={() => void cancel()} className="mt-3 inline-flex items-center gap-1.5 text-caption font-semibold text-white/50 hover:text-white">
                  <X className="size-3.5" /> Cancel upload
                </button>
              </div>
            ) : null}

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="sr-only"
              onChange={(event) => {
                chooseFile(event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" disabled={Boolean(upload)} onClick={() => inputRef.current?.click()} className={`${adminBtnGhost} inline-flex items-center justify-center gap-2 px-4 py-3 sm:flex-1`}>
                <ImagePlus className="size-4" /> {selectedFile ? 'Choose another image' : 'Choose new QR'}
              </button>
              {selectedFile ? (
                <button type="button" disabled={Boolean(upload)} onClick={() => void publish()} className={`${adminBtnPrimary} inline-flex items-center justify-center gap-2 px-5 py-3 sm:flex-1`}>
                  <Upload className="size-4" /> Publish new QR
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
