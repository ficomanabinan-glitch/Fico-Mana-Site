'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import {
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  Package,
  WalletCards,
} from 'lucide-react'
import PortalQrCode from '@/components/portal-qr-code'
import PortalSidebar from '@/components/portal-sidebar'
import PortalDrivePhotos from '@/components/portal-drive-photos'
import PortalExpiryNotice from '@/components/portal-expiry-notice'
import PortalDeliverableGallery from '@/components/portal-deliverable-gallery'
import PortalPageSkeleton from '@/components/portal-page-skeleton'
import type { PortalExpiry } from '@/lib/portal-expiry'
import { usePortalPhotoSync } from '@/components/use-portal-photo-sync'
import { clearPortalDraft, portalDraftKey } from '@/lib/portal-selection-draft'
import { portalPaymentSummary, type AddonPreview } from '@/lib/client-selection-summary'
import {
  ClientPhotoSelection,
  type ClientAddon,
  type ClientGalleryFile,
  type ClientSelection,
  type ClientSelectionProgress,
} from '@/components/client-photo-selection'

type PortalResource = {
  id: string
  resource_type: string
  title: string
  url?: string | null
  content?: string | null
  created_at: string
}

type PortalData = {
  booking: {
    id: string
    customerName: string
    packageName: string
    bookingDate: string
    bookingTime: string
    bookingStatus: string
    paymentStatus: string
    price: number
    depositAmount: number
    amountPaid: number
  }
  portalId: string
  shareUrl: string
  expiry: PortalExpiry | null
  selection: ClientSelection | null
  gallery: ClientGalleryFile[]
  galleryTotal: number
  galleryOffset: number
  galleryLimit: number
  editingStatus: string
  addonCatalog: ClientAddon[]
  deliverables: Array<{
    id: string
    fileName: string
    mimeType: string
    fileSize: number
    publishedAt: string
    previewUrl: string
  }>
  resources: PortalResource[]
  downloadAllUrl: string
  warnings?: string[]
}

function money(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}

function stageLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function AccessMessage({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry?: () => void
}) {
  return (
    <main className="client-portal flex min-h-screen items-center justify-center p-6 text-white">
      <div className="w-full max-w-lg border-t border-white/10 py-10 text-center">
        <p className="portal-kicker">FICO MANA</p>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-[-0.025em]">{title}</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/50">{message}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="portal-primary-action mt-6">
            Try Again
          </button>
        ) : null}
      </div>
    </main>
  )
}

export default function ClientPortalPage() {
  const params = useParams<{ id: string }>()
  const publicId = decodeURIComponent(params.id || '')
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['client-portal', publicId] as const, [publicId])
  const [data, setData] = useState<PortalData | null>(() =>
    publicId ? queryClient.getQueryData<PortalData>(queryKey) ?? null : null,
  )
  const [loading, setLoading] = useState(() => !data)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [draftPricing, setDraftPricing] = useState<AddonPreview | null>(null)
  const [selectionProgress, setSelectionProgress] = useState<ClientSelectionProgress | null>(null)
  const [driveAccess, setDriveAccess] = useState<{
    publicId: string
    url?: string
    warning?: string
  } | null>(null)
  const [resetting, setResetting] = useState(false)
  const [headerCompact, setHeaderCompact] = useState(false)
  const readSequence = useRef(0)
  const headerSentinel = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const load = useCallback(
    async (offset = 0, silent = false) => {
      const sequence = ++readSequence.current
      if (offset === 0) {
        if (!silent) setLoading(true)
        setError('')
        if (!silent) setDraftPricing(null)
      } else {
        setLoadingMore(true)
      }

      try {
        const response = await fetch(
          `/api/editor-workflow/portal/${encodeURIComponent(publicId)}?offset=${offset}&limit=48`,
          { cache: 'no-store', credentials: 'include' },
        )
        const body = (await response.json().catch(() => ({}))) as PortalData & { error?: string }
        if (sequence !== readSequence.current) return
        if (!response.ok) {
          const reason = body.error || 'This client portal is unavailable.'
          throw new Error(
            `${reason} Try: refresh this page. If it continues, ask FICO MANA staff to reopen or regenerate your private portal link.`,
          )
        }

        setData((previous) => {
          const next =
            offset === 0
              ? body
              : { ...body, gallery: [...(previous?.gallery || []), ...body.gallery] }
          queryClient.setQueryData(queryKey, next)
          return next
        })
        setResetting(false)
      } catch (loadError) {
        if (sequence !== readSequence.current) return
        const message =
          loadError instanceof Error ? loadError.message : 'This client portal is unavailable.'
        setError(
          message.includes('Try:')
            ? message
            : `${message} Try: refresh this page. If it continues, ask FICO MANA staff to reopen your private portal link.`,
        )
        if (silent) throw loadError
      } finally {
        if (sequence === readSequence.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [publicId, queryClient, queryKey],
  )

  useEffect(() => {
    if (publicId) {
      const cached = queryClient.getQueryData<PortalData>(queryKey) ?? null
      setData(cached)
      setLoading(!cached)
      void load(0, Boolean(cached)).catch(() => {})
    } else {
      setLoading(false)
    }
  }, [load, publicId, queryClient, queryKey])

  useEffect(() => {
    const sentinel = headerSentinel.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      ([entry]) => setHeaderCompact(!entry.isIntersecting),
      { threshold: 0.01 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [data])

  usePortalPhotoSync(
    publicId,
    data
      ? {
          generation: data.selection?.rawUploadGeneration || 0,
          reopenedAt: data.selection?.reopenedAt || null,
          galleryCount: data.galleryTotal,
          expiresAt: data.expiry?.expiresAt,
          portalReadyEmailSentAt: data.expiry?.portalReadyEmailSentAt,
        }
      : null,
    () => {
      readSequence.current++
      if (data?.selection) {
        clearPortalDraft(
          portalDraftKey(
            publicId,
            data.selection.id,
            data.selection.reopenedAt,
            data.selection.includedLimit,
          ),
        )
      }
      setResetting(true)
      setLoading(false)
      setLoadingMore(false)
      setDraftPricing(null)
      setDriveAccess(null)
    },
    async () => {
      setDriveAccess(null)
      await load(0, true)
    },
  )

  const addonAmount =
    draftPricing?.total ?? Number(data?.selection?.totalAddonAmount || 0)
  const payment = portalPaymentSummary(
    data?.booking.price || 0,
    data?.booking.amountPaid || 0,
    addonAmount,
  )
  const selectionLocked =
    data?.selection?.status === 'SUBMITTED' || data?.selection?.status === 'SUBMITTING'

  if (loading) return <PortalPageSkeleton />
  if (resetting) {
    return (
      <AccessMessage
        title="Your photos are being updated"
        message="The studio is clearing the previous uploads. This portal will refresh automatically when it is ready."
      />
    )
  }
  if (error && !data) {
    return <AccessMessage title="Portal unavailable" message={error} onRetry={() => void load(0)} />
  }
  if (!data) {
    return (
      <AccessMessage
        title="Portal unavailable"
        message="This project could not be loaded. Try: refresh this page or ask FICO MANA staff to reopen your private portal link."
        onRetry={() => void load(0)}
      />
    )
  }

  const selectedCount =
    selectionProgress?.selectedCount ??
    data.selection?.selectedItems.filter((item) => !item.extraEdit).length ??
    0
  const includedLimit =
    selectionProgress?.includedLimit ?? data.selection?.includedLimit ?? 5
  const hasDeliverables = data.deliverables.length > 0
  const hasActiveExpiry = Boolean(hasDeliverables && data.expiry?.expiresAt)

  const workflow = (
    <div className="portal-workflow">
      <ClientPhotoSelection
        paymentSummary={{
          packageAmount: data.booking.price,
          amountPaid: data.booking.amountPaid,
        }}
        publicId={publicId}
        selection={data.selection}
        gallery={data.gallery}
        galleryTotal={data.galleryTotal}
        loadingMore={loadingMore}
        addons={data.addonCatalog}
        projectStatus={stageLabel(data.editingStatus)}
        onLoadMore={() => void load(data.gallery.length)}
        onSubmitted={(photos) => {
          setDriveAccess({ publicId, ...photos })
          return load(0)
        }}
        onPricingChange={setDraftPricing}
        onProgressChange={setSelectionProgress}
      />
    </div>
  )

  return (
    <main
      className={`client-portal client-portal-page overflow-x-clip ${headerCompact ? 'portal-header-compact' : ''}`}
    >
      <div className="portal-shell">
        <div ref={headerSentinel} className="portal-header-sentinel" aria-hidden="true" />

        <motion.header
          layout={!reduceMotion}
          transition={{
            duration: reduceMotion ? 0 : 0.24,
            ease: [0.2, 0.8, 0.2, 1],
          }}
          className="portal-editorial-header"
        >
          <div className="min-w-0">
            <p className="portal-brand-label">FICO MANA</p>
            <h1 className="portal-client-name">{data.booking.customerName}</h1>
            <p className="portal-project-id">{data.booking.id}</p>
          </div>

          <div className="portal-header-actions">
            <div className="portal-selection-count" aria-label={`${selectedCount} of ${includedLimit} selected`}>
              <strong>{selectedCount} / {includedLimit}</strong>
              <span>Selected</span>
            </div>
            <PortalSidebar remaining={money(payment.remaining)}>
              <PortalContext
                data={data}
                selectionProgress={selectionProgress}
                addonAmount={addonAmount}
                payment={payment}
                selectionLocked={selectionLocked}
              />
            </PortalSidebar>
          </div>
        </motion.header>

        <div className="portal-main">
          {error ? (
            <div
              className="mb-5 rounded-control border border-red-500/20 bg-red-500/[0.05] px-4 py-3 text-xs text-red-100"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {data.warnings?.length ? (
            <div
              className="mb-5 rounded-control border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-xs leading-relaxed text-amber-100"
              role="status"
            >
              <strong>Some project details are temporarily unavailable:</strong>{' '}
              {data.warnings.join(', ')}.
            </div>
          ) : null}

          <section className="portal-intro" aria-labelledby="portal-workspace-title">
            <div>
              <p className="portal-kicker">
                {hasDeliverables ? 'Final gallery' : 'Private selection gallery'}
              </p>
              <h2 id="portal-workspace-title" className="portal-editorial-title">
                {hasDeliverables ? 'Your finished photographs.' : 'Curate your final photographs.'}
              </h2>
            </div>
            <p className="portal-intro-copy">
              {hasDeliverables
                ? 'Your editor has completed the project. Review and download your finished photographs while your private gallery access is active.'
                : 'Choose your included photographs for professional enhancement, assign your free prints, add anything optional, and review everything before submission.'}
            </p>
          </section>

          <div className="space-y-8">
            {hasDeliverables ? (
              <motion.section
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.36, ease: [0.2, 0.8, 0.2, 1] }}
                className="portal-delivery-section"
                aria-labelledby="final-deliverables-title"
              >
                <div className="portal-delivery-heading">
                  <div>
                    <p className="portal-kicker">Delivered by FICO MANA</p>
                    <h2 id="final-deliverables-title" className="portal-delivery-title">
                      Final Deliverables
                    </h2>
                    <p className="portal-ready-copy">
                      {data.deliverables.length} edited photo
                      {data.deliverables.length === 1 ? '' : 's'} ready for you.
                    </p>
                  </div>
                  <a href={data.downloadAllUrl} className="portal-primary-action">
                    <Download className="size-3.5" aria-hidden="true" />
                    Download All
                  </a>
                </div>

                <PortalDeliverableGallery key={publicId} files={data.deliverables} />
                {hasActiveExpiry && data.expiry ? <PortalExpiryNotice expiry={data.expiry} /> : null}
              </motion.section>
            ) : null}

            {workflow}

            {data.selection?.status === 'SUBMITTED' && hasDeliverables ? (
              <PortalDrivePhotos
                key={publicId}
                publicId={publicId}
                initialUrl={driveAccess?.publicId === publicId ? driveAccess.url : undefined}
                warning={driveAccess?.publicId === publicId ? driveAccess.warning : undefined}
              />
            ) : null}

            {data.resources.length > 0 ? (
              <section className="portal-resource-section" aria-labelledby="project-resources-title">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-[#C4CEFF]" aria-hidden="true" />
                  <div>
                    <p className="portal-kicker">Project archive</p>
                    <h2 id="project-resources-title" className="mt-1 text-sm font-semibold">
                      Files &amp; Updates
                    </h2>
                  </div>
                </div>

                <div className="portal-resource-list">
                  {data.resources.map((resource) => (
                    <div key={resource.id} className="portal-resource-row">
                      <p className="portal-meta-label text-white/35">
                        {resource.resource_type.replace(/_/g, ' ')}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{resource.title}</p>
                      {resource.content ? (
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/45">
                          {resource.content}
                        </p>
                      ) : null}
                      {resource.url ? (
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[#C4CEFF] transition hover:text-white"
                        >
                          Open Resource
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}

function PortalContext({
  data,
  selectionProgress,
  addonAmount,
  payment,
  selectionLocked,
}: {
  data: PortalData
  selectionProgress: ClientSelectionProgress | null
  addonAmount: number
  payment: ReturnType<typeof portalPaymentSummary>
  selectionLocked: boolean
}) {
  const selected =
    selectionProgress?.selectedCount ??
    data.selection?.selectedItems.filter((item) => !item.extraEdit).length ??
    0
  const limit = selectionProgress?.includedLimit ?? data.selection?.includedLimit ?? 5

  return (
    <>
      <div className="portal-overview-identity">
        <p className="portal-kicker">FICO MANA Client Portal</p>
        <h2>{data.booking.customerName}</h2>
        <p className="portal-project-id">{data.booking.id}</p>
      </div>

      <section className="portal-overview-card">
        <p className="portal-meta-label text-white/40">Enhanced Photo Selection</p>
        <p className="mt-2 text-lg font-semibold text-[#C4CEFF]">
          {selected} / {limit} Selected
        </p>
        {selectionProgress?.editingPreference ? (
          <div className="mt-4 border-t border-white/[0.07] pt-4">
            <p className="text-xs text-white/35">Editing Preference</p>
            <p className="mt-1 text-xs font-semibold text-white/70">
              {selectionProgress.editingPreference}
            </p>
          </div>
        ) : null}
        {selectionLocked ? (
          <div className="mt-4 border-l-2 border-emerald-300/60 pl-3 text-xs text-emerald-100/80">
            <p className="font-semibold">Selection submitted and locked</p>
            {data.selection?.submittedAt ? (
              <p className="mt-1 text-emerald-100/45">
                {new Date(data.selection.submittedAt).toLocaleString('en-PH')}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="portal-overview-card">
        <div className="grid grid-cols-2 gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white/40">
              <Package className="size-3.5 shrink-0" aria-hidden="true" />
              <p className="portal-meta-label">Package</p>
            </div>
            <p className="mt-2 break-words text-sm font-semibold">{data.booking.packageName}</p>
            <p className="mt-1 text-xs text-white/40">Booking {data.booking.bookingStatus}</p>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-white/40">
              <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
              <p className="portal-meta-label">Shoot Day</p>
            </div>
            <p className="mt-2 break-words text-sm font-semibold">{data.booking.bookingDate}</p>
          </div>
        </div>
      </section>

      <InfoCard icon={WalletCards} label="Payment Summary">
        <dl className="space-y-3 text-xs tabular-nums">
          <Row label="Package" value={money(data.booking.price)} />
          <Row label="Extras" value={money(addonAmount)} />
          <Row label="Booking Total" value={money(payment.total)} />
          <Row label="Paid" value={money(data.booking.amountPaid)} accent="text-emerald-300" />
          <Row label="Remaining" value={money(payment.remaining)} accent="text-[#C4CEFF]" />
          <Row label="Status" value={data.booking.paymentStatus} />
        </dl>
      </InfoCard>

      <div className="portal-overview-card">
        <PortalQrCode
          compact
          portalUrl={data.shareUrl}
          customerName={data.booking.customerName}
          bookingId={data.booking.id}
        />
      </div>
    </>
  )
}

function InfoCard({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="portal-overview-card">
      <div className="flex items-center gap-2 text-white/45">
        <Icon className="size-4" aria-hidden="true" />
        <span className="portal-meta-label">{label}</span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  accent = 'text-white',
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0">
      <dt className="text-white/40">{label}</dt>
      <dd className={`text-right font-semibold ${accent}`}>{value}</dd>
    </div>
  )
}
