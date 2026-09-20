'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Download, ExternalLink, FileText,
} from 'lucide-react'
import PortalQrCode from '@/components/portal-qr-code'
import PortalOverview from '@/components/portal-overview'
import styles from '@/components/portal-workspace.module.css'
import PortalExpiryNotice from '@/components/portal-expiry-notice'
import PortalDeliverableGallery from '@/components/portal-deliverable-gallery'
import PortalOriginalDownload from '@/components/portal-original-download'
import PortalPageSkeleton from '@/components/portal-page-skeleton'
import { PortalPreviewProvider } from '@/components/portal-preview-cache'
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
import type { PortalRawDownloadAccess } from '@/lib/portal-raw-downloads'

type PortalResource={id:string;resource_type:string;title:string;url?:string|null;content?:string|null;created_at:string}
export type PortalData={
  booking:{id:string;customerName:string;packageName:string;bookingDate:string;bookingTime:string;bookingStatus:string;paymentStatus:string;price:number;depositAmount:number;amountPaid:number}
  portalId:string
  shareUrl:string
  expiry:PortalExpiry|null
  selection:ClientSelection|null
  gallery:ClientGalleryFile[]
  galleryTotal:number
  galleryOffset:number
  galleryLimit:number
  editingStatus:string
  addonCatalog:ClientAddon[]
  deliverables:Array<{id:string;fileName:string;mimeType:string;fileSize:number;publishedAt:string;previewUrl:string}>
  resources:PortalResource[]
  downloadAllUrl:string
  rawDownloadAllUrl:string|null
  rawDownloadRequestUrl:string|null
  rawDownloadAccess:PortalRawDownloadAccess|null
  warnings?:string[]
}

function money(value:number){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value)}
function stageLabel(status:string){return status.replace(/_/g,' ').replace(/\b\w/g,(char)=>char.toUpperCase())}
function AccessMessage({title,message,onRetry}:{title:string;message:string;onRetry?:()=>void}){return <main className="flex min-h-screen items-center justify-center bg-[#171717] p-6 text-white"><div className="w-full max-w-lg rounded-card border border-white/10 bg-white/[0.03] p-8 text-center shadow-[inset_0_1px_rgba(255,255,255,0.05)]"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-relaxed text-white/50">{message}</p>{onRetry?<button type="button" onClick={onRetry} className={`${portalPrimaryAction} mt-5 px-5 py-2.5 text-xs font-semibold`}>Try Again</button>:null}</div></main>}

const portalPrimaryAction='min-h-11 cursor-pointer rounded-control bg-primary text-white shadow-[inset_0_1px_rgba(255,255,255,0.16)] transition-[background-color,transform,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-[#0903e8] hover:shadow-[inset_0_1px_rgba(255,255,255,0.2),0_10px_28px_rgba(5,0,208,0.2)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171717] disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none'
export default function ClientPortalPage({ publicId, initialData = null, initialError = '', sampleMode = false }: { publicId: string; initialData?: PortalData | null; initialError?: string; sampleMode?: boolean }) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['client-portal', publicId] as const, [publicId])
  const [data, setData] = useState<PortalData | null>(initialData)
  const [loading, setLoading] = useState(() => !initialData && !initialError)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(initialError)
  const [draftPricing, setDraftPricing] = useState<AddonPreview | null>(null)
  const [selectionProgress, setSelectionProgress] = useState<ClientSelectionProgress | null>(null)
  const [resetting, setResetting] = useState(false)
  const readSequence = useRef(0)
  const previewSources = useMemo(() => data?.gallery.map(file => file.previewUrl) || [], [data?.gallery])

  const load = useCallback(async (offset = 0, silent = false) => {
    if (sampleMode) {
      setLoading(false)
      setLoadingMore(false)
      return
    }
    const sequence = ++readSequence.current
    if (offset === 0) {
      if (!silent) setLoading(true)
      setError('')
      if (!silent) setDraftPricing(null)
    } else setLoadingMore(true)
    try {
      const response = await fetch(`/api/editor-workflow/portal/${encodeURIComponent(publicId)}?offset=${offset}&limit=48`, { cache: 'no-store', credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as PortalData & { error?: string }
      if (sequence !== readSequence.current) return
      if (!response.ok) {
        const reason = body.error || 'This client portal is unavailable.'
        throw new Error(`${reason} Try: refresh this page. If it continues, ask FICO MANA staff to reopen or regenerate your private portal link.`)
      }
      setData(previous => {
        const next = offset === 0 ? body : { ...body, gallery: [...(previous?.gallery || []), ...body.gallery] }
        queryClient.setQueryData(queryKey, next)
        return next
      })
      setResetting(false)
    } catch (loadError) {
      if (sequence !== readSequence.current) return
      const message = loadError instanceof Error ? loadError.message : 'This client portal is unavailable.'
      setError(message.includes('Try:') ? message : `${message} Try: refresh this page. If it continues, ask FICO MANA staff to reopen or regenerate your private portal link.`)
      if (silent) throw loadError
    } finally {
      if (sequence === readSequence.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [publicId, queryClient, queryKey, sampleMode])

  const refreshRawDownloadAccess = useCallback(async () => {
    if (sampleMode) return
    const response = await fetch(`/api/editor-workflow/portal/${encodeURIComponent(publicId)}/raw-download-state`, {
      cache: 'no-store', credentials: 'include',
    })
    if (!response.ok) return
    const access = (await response.json()) as PortalRawDownloadAccess
    setData((previous) => {
      if (!previous) return previous
      const rawDownloadAllUrl = previous.selection?.status === 'SUBMITTED' && access.allowed
        ? `/api/editor-workflow/portal/${encodeURIComponent(publicId)}/raw-photos.zip`
        : null
      const next = { ...previous, rawDownloadAccess: access, rawDownloadAllUrl }
      queryClient.setQueryData(queryKey, next)
      return next
    })
  }, [publicId, queryClient, queryKey, sampleMode])

  useEffect(() => {
    if (!data?.rawDownloadAccess?.activeDownloads || sampleMode) return
    const timer = window.setInterval(() => void refreshRawDownloadAccess(), 10_000)
    return () => window.clearInterval(timer)
  }, [data?.rawDownloadAccess?.activeDownloads, refreshRawDownloadAccess, sampleMode])

  useEffect(() => {
    // Hydrate the authorized server snapshot without immediately fetching it again.
    if (initialData) { queryClient.setQueryData(queryKey, initialData); return }
    if (initialError) return
    if (publicId) {
      const cached = queryClient.getQueryData<PortalData>(queryKey) ?? null
      setData(cached)
      setLoading(!cached)
      void load(0, Boolean(cached)).catch(() => {})
    }
    else setLoading(false)
  }, [load, publicId, queryClient, queryKey, initialData, initialError])

  usePortalPhotoSync(sampleMode ? '' : publicId, data ? {
    generation: data.selection?.rawUploadGeneration || 0,
    reopenedAt: data.selection?.reopenedAt || null,
    galleryCount: data.galleryTotal,
    expiresAt: data.expiry?.expiresAt,
    portalReadyEmailSentAt: data.expiry?.portalReadyEmailSentAt,
    deliverablesUploadedAt: data.expiry?.deliverablesUploadedAt,
  } : null, () => {
    readSequence.current++
    if (data?.selection) clearPortalDraft(portalDraftKey(publicId, data.selection.id, data.selection.reopenedAt, data.selection.includedLimit))
    setResetting(true)
    setLoading(false)
    setLoadingMore(false)
    setDraftPricing(null)
  }, async () => {
    await load(0, true)
  })

  const addonAmount = draftPricing?.total ?? Number(data?.selection?.totalAddonAmount || 0)
  const payment = portalPaymentSummary(data?.booking.price || 0, data?.booking.amountPaid || 0, addonAmount)
  const selectionLocked = data?.selection?.status === 'SUBMITTED' || data?.selection?.status === 'SUBMITTING'

  if (loading) return <PortalPageSkeleton />
  if (resetting) return <AccessMessage title="Your photos are being updated" message="The studio is clearing the previous uploads. This portal will refresh automatically when it is ready." />
  if (error && !data) return <AccessMessage title="Portal unavailable" message={error} onRetry={() => void load(0)} />
  if (!data) return <AccessMessage title="Portal unavailable" message="This project could not be loaded. Try: refresh this page or ask FICO MANA staff to reopen your private portal link." onRetry={() => void load(0)} />

  return <PortalPreviewProvider scope={`${publicId}:${data.selection?.rawUploadGeneration || 0}:${data.selection?.reopenedAt || ''}`} sources={previewSources} expiresAt={data.expiry?.expiresAt}><main className={`client-portal ${styles.clientPortal}`}>
    <ClientPhotoSelection
      publicId={publicId} selection={data.selection} gallery={data.gallery} galleryTotal={data.galleryTotal}
      loadingMore={loadingMore} addons={data.addonCatalog} projectStatus={stageLabel(data.editingStatus)}
      sampleMode={sampleMode}
      paymentSummary={{ packageAmount: data.booking.price, amountPaid: data.booking.amountPaid }}
      onLoadMore={() => { if (!sampleMode) void load(data.gallery.length) }}
      onSubmitted={async () => { if (!sampleMode) await load(0) }}
      onPricingChange={setDraftPricing} onProgressChange={setSelectionProgress}
      headerContent={<div className={styles.identity}>
        <div className={styles.identityText}><p className={styles.brand}>FICO MANA</p><div className={styles.clientLine}><p className={styles.clientName}>{data.booking.customerName}</p><span className={styles.metadata}>{data.booking.id}</span></div></div>
        <PortalOverview><PortalContext data={data} selectionProgress={selectionProgress} addonAmount={addonAmount} payment={payment} selectionLocked={selectionLocked} />{data.expiry ? <PortalExpiryNotice expiry={data.expiry} /> : null}</PortalOverview>
      </div>}
      notices={<>{sampleMode ? <aside className={styles.sampleNotice} aria-label="Sample portal information"><div><strong>Sample portal</strong><p>Practice the full selection flow with example photos. Nothing here is submitted or saved to a booking.</p></div><Link href="/portal">Exit sample</Link></aside> : null}{error ? <div className={styles.notice} data-tone="error" role="alert">{error}<button type="button" className={styles.secondary} onClick={() => void load(0, true).catch(() => {})}>Try again</button></div> : null}{data.warnings?.length ? <div className={styles.notice} role="status">Some project details are temporarily unavailable: {data.warnings.join(', ')}.</div> : null}{data.expiry?.expiresAt ? <PortalExpiryNotice expiry={data.expiry} /> : null}</>}
      footerContent={<div className="mt-10 space-y-8">
            {data.selection?.status === 'SUBMITTED' ? <PortalOriginalDownload total={data.galleryTotal} access={data.rawDownloadAccess} downloadUrl={data.rawDownloadAllUrl} requestUrl={data.rawDownloadRequestUrl} onAccessChanged={refreshRawDownloadAccess} /> : null}
            {data.deliverables.length > 0 ? <section className="fico-card border border-white/10 bg-white/[0.02] shadow-[inset_0_1px_rgba(255,255,255,0.04)]"><h2 className="text-card-title font-semibold tracking-heading">Final Deliverables</h2><div className="mt-4 flex flex-col gap-3 rounded-control border border-emerald-500/20 bg-emerald-500/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-emerald-200">Your photos are ready</p><p className="mt-1 text-caption text-white/45">{data.deliverables.length} edited photo{data.deliverables.length === 1 ? '' : 's'}</p></div><a href={data.downloadAllUrl} className={`${portalPrimaryAction} inline-flex items-center justify-center gap-2 px-4 py-2.5 text-caption font-semibold`}><Download className="size-3.5" strokeWidth={1.5} />Download All</a></div><PortalDeliverableGallery key={publicId} files={data.deliverables} /></section> : null}
            {data.resources.length > 0 ? <section className="fico-card border border-white/10 bg-white/[0.02] shadow-[inset_0_1px_rgba(255,255,255,0.04)]"><div className="flex items-center gap-2"><FileText className="size-4 text-[#C4CEFF]" strokeWidth={1.5} /><h2 className="text-card-title font-semibold tracking-heading">Project files and updates</h2></div><div className="mt-4 divide-y divide-white/[0.07]">{data.resources.map(resource => <div key={resource.id} className="py-4 first:pt-0 last:pb-0"><p className="text-caption font-medium tracking-[0.04em] text-white/40">{resource.resource_type.replace(/_/g, ' ')}</p><p className="mt-1 text-sm font-semibold">{resource.title}</p>{resource.content ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/50">{resource.content}</p> : null}{resource.url ? <a href={resource.url} target="_blank" rel="noopener noreferrer" className="group mt-3 inline-flex min-h-11 items-center gap-2 rounded-control border border-transparent px-2 text-caption font-semibold text-[#C4CEFF] transition-[transform,background-color,border-color,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-[#C4CEFF]/20 hover:bg-[#C4CEFF]/[0.07] hover:text-white">Open resource <ExternalLink className="size-3" strokeWidth={1.5} /></a> : null}</div>)}</div></section> : null}</div>}
    />
  </main></PortalPreviewProvider>
}

function PortalContext({ data, selectionProgress, addonAmount, payment, selectionLocked }: {
  data: PortalData
  selectionProgress: ClientSelectionProgress | null
  addonAmount: number
  payment: ReturnType<typeof portalPaymentSummary>
  selectionLocked: boolean
}) {
  const selected = selectionProgress?.selectedCount ?? data.selection?.selectedItems.filter(item => !item.extraEdit).length ?? 0
  const limit = selectionProgress?.includedLimit ?? data.selection?.includedLimit ?? 5
  return <>
    <section className={styles.overviewSection}><p className={styles.brand}>FICO MANA Client Portal</p><h2 className={styles.clientName}>{data.booking.customerName}</h2><p className={styles.metadata}>{data.booking.id}</p></section>
    <section className={styles.overviewSection}><p className={styles.kicker}>Your session</p><dl><div className={styles.summaryRow}><dt>Package</dt><dd>{data.booking.packageName}</dd></div><div className={styles.summaryRow}><dt>Shoot day</dt><dd>{data.booking.bookingDate}</dd></div><div className={styles.summaryRow}><dt>Booking</dt><dd>{data.booking.bookingStatus}</dd></div><div className={styles.summaryRow}><dt>Project status</dt><dd>{selectionLocked ? 'Selection submitted' : stageLabel(data.editingStatus)}</dd></div><div className={styles.summaryRow}><dt>Included photographs</dt><dd>{selected} of {limit}</dd></div>{selectionProgress?.editingPreference ? <div className={styles.summaryRow}><dt>Editing preference</dt><dd>{selectionProgress.editingPreference}</dd></div> : null}</dl></section>
    <section className={styles.overviewSection}><p className={styles.kicker}>Payment details</p><dl>{[['Package', money(data.booking.price)], ['Extras', money(addonAmount)], ['Booking total', money(payment.total)], ['Paid', money(data.booking.amountPaid)], ['Remaining', money(payment.remaining)], ['Status', data.booking.paymentStatus]].map(([label,value]) => <div className={styles.summaryRow} key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
    <PortalQrCode compact className={styles.overviewQr} portalUrl={data.shareUrl} customerName={data.booking.customerName} bookingId={data.booking.id} />
  </>
}
