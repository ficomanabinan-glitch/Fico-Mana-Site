'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, Download, ExternalLink, FileText, Package, WalletCards,
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

type PortalResource={id:string;resource_type:string;title:string;url?:string|null;content?:string|null;created_at:string}
type PortalData={
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
  warnings?:string[]
}

function money(value:number){return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value)}
function stageLabel(status:string){return status.replace(/_/g,' ').replace(/\b\w/g,(char)=>char.toUpperCase())}
function AccessMessage({title,message,onRetry}:{title:string;message:string;onRetry?:()=>void}){return <main className="flex min-h-screen items-center justify-center bg-[#171717] p-6 text-white"><div className="w-full max-w-lg rounded-card border border-white/10 bg-white/[0.03] p-8 text-center"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-relaxed text-white/50">{message}</p>{onRetry?<button type="button" onClick={onRetry} className={`${portalPrimaryAction} mt-5 px-5 py-2.5 text-xs font-bold uppercase`}>Try Again</button>:null}</div></main>}

const portalPrimaryAction='min-h-11 cursor-pointer rounded-control bg-primary text-white transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#0300a8] hover:shadow-[0_10px_28px_rgba(5,0,208,0.35)] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171717] disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none'
export default function ClientPortalPage() {
  const params = useParams<{ id: string }>()
  const publicId = decodeURIComponent(params.id || '')
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['client-portal', publicId] as const, [publicId])
  const [data, setData] = useState<PortalData | null>(() => publicId ? queryClient.getQueryData<PortalData>(queryKey) ?? null : null)
  const [loading, setLoading] = useState(() => !data)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [draftPricing, setDraftPricing] = useState<AddonPreview | null>(null)
  const [selectionProgress, setSelectionProgress] = useState<ClientSelectionProgress | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [driveAccess, setDriveAccess] = useState<{ publicId: string; url?: string; warning?: string } | null>(null)
  const [resetting, setResetting] = useState(false)
  const readSequence = useRef(0)

  const load = useCallback(async (offset = 0, silent = false) => {
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
  }, [publicId, queryClient, queryKey])

  useEffect(() => {
    if (publicId) {
      const cached = queryClient.getQueryData<PortalData>(queryKey) ?? null
      setData(cached)
      setLoading(!cached)
      void load(0, Boolean(cached)).catch(() => {})
    }
    else setLoading(false)
  }, [load, publicId, queryClient, queryKey])

  usePortalPhotoSync(publicId, data ? {
    generation: data.selection?.rawUploadGeneration || 0,
    reopenedAt: data.selection?.reopenedAt || null,
    galleryCount: data.galleryTotal,
    expiresAt: data.expiry?.expiresAt,
    portalReadyEmailSentAt: data.expiry?.portalReadyEmailSentAt,
  } : null, () => {
    readSequence.current++
    if (data?.selection) clearPortalDraft(portalDraftKey(publicId, data.selection.id, data.selection.reopenedAt, data.selection.includedLimit))
    setResetting(true)
    setLoading(false)
    setLoadingMore(false)
    setDraftPricing(null)
    setDriveAccess(null)
  }, async () => {
    setDriveAccess(null)
    await load(0, true)
  })

  const addonAmount = draftPricing?.total ?? Number(data?.selection?.totalAddonAmount || 0)
  const payment = portalPaymentSummary(data?.booking.price || 0, data?.booking.amountPaid || 0, addonAmount)
  const selectionLocked = data?.selection?.status === 'SUBMITTED' || data?.selection?.status === 'SUBMITTING'

  if (loading) return <PortalPageSkeleton />
  if (resetting) return <AccessMessage title="Your photos are being updated" message="The studio is clearing the previous uploads. This portal will refresh automatically when it is ready." />
  if (error && !data) return <AccessMessage title="Portal unavailable" message={error} onRetry={() => void load(0)} />
  if (!data) return <AccessMessage title="Portal unavailable" message="This project could not be loaded. Try: refresh this page or ask FICO MANA staff to reopen your private portal link." onRetry={() => void load(0)} />

  const selectedCount = selectionProgress?.selectedCount ?? data.selection?.selectedItems.filter(item => !item.extraEdit).length ?? 0
  const includedLimit = selectionProgress?.includedLimit ?? data.selection?.includedLimit ?? 5

  return (
    <main className="client-portal client-portal-page min-h-screen overflow-x-clip bg-[#171717] text-body text-white">
      <div className="w-full px-3 py-5 sm:px-5 sm:py-8 xl:px-6 2xl:px-8">
        <header className="sticky top-0 z-30 -mx-3 mb-4 flex min-h-[5.75rem] items-center justify-between gap-4 border-b border-white/10 bg-[#171717]/95 px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.2)] backdrop-blur-xl sm:-mx-5 sm:px-5 md:static md:mx-0 md:min-h-0 md:bg-transparent md:px-0 md:py-0 md:pb-4 md:shadow-none md:backdrop-blur-none xl:hidden">
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">FICO MANA</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-heading">{data.booking.customerName}</h1>
            <p className="mt-1 font-mono text-caption text-white/35">{data.booking.id}</p>
          </div>
          <div className="shrink-0 text-right"><p className="text-sm font-semibold text-[#C4CEFF]">{selectedCount} / {includedLimit}</p><p className="text-caption text-white/35">Selected</p></div>
        </header>

        {error ? <div className="mb-4 rounded-control border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-200" role="alert">{error}</div> : null}
        {data.warnings?.length ? <div className="mb-4 rounded-control border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-100" role="status"><strong>Some project details are temporarily unavailable:</strong> {data.warnings.join(', ')}.</div> : null}

        <div className={`grid min-w-0 gap-4 ${sidebarCollapsed ? 'xl:grid-cols-[3.5rem_minmax(0,1fr)] xl:gap-4 2xl:grid-cols-[3.5rem_minmax(0,1fr)] 2xl:gap-4' : 'xl:grid-cols-[minmax(250px,300px)_minmax(0,1fr)] xl:gap-5 2xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] 2xl:gap-6'}`}>
          <PortalSidebar remaining={money(payment.remaining)} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed}>
            <PortalContext
              data={data}
              selectionProgress={selectionProgress}
              addonAmount={addonAmount}
              payment={payment}
              selectionLocked={selectionLocked}
            />
          </PortalSidebar>

          <section className="min-w-0 space-y-5">
            {data.expiry ? <PortalExpiryNotice expiry={data.expiry} /> : null}
            <ClientPhotoSelection
              paymentSummary={{ packageAmount: data.booking.price, amountPaid: data.booking.amountPaid }}
              publicId={publicId}
              selection={data.selection}
              gallery={data.gallery}
              galleryTotal={data.galleryTotal}
              loadingMore={loadingMore}
              addons={data.addonCatalog}
              projectStatus={stageLabel(data.editingStatus)}
              onLoadMore={() => void load(data.gallery.length)}
              onSubmitted={photos => { setDriveAccess({ publicId, ...photos }); return load(0) }}
              onPricingChange={setDraftPricing}
              onProgressChange={setSelectionProgress}
            />
            {data.selection?.status === 'SUBMITTED' && data.deliverables.length > 0 ? <PortalDrivePhotos key={publicId} publicId={publicId} initialUrl={driveAccess?.publicId === publicId ? driveAccess.url : undefined} warning={driveAccess?.publicId === publicId ? driveAccess.warning : undefined} /> : null}
            {data.deliverables.length > 0 ? <section className="fico-card border border-white/10 bg-white/[0.02]"><h2 className="text-card-title font-semibold tracking-heading">Final Deliverables</h2><div className="mt-4 flex flex-col gap-3 rounded-control border border-emerald-500/20 bg-emerald-500/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-emerald-200">Your Photos Are Ready</p><p className="mt-1 text-caption text-white/40">{data.deliverables.length} edited photo{data.deliverables.length === 1 ? '' : 's'}</p></div><a href={data.downloadAllUrl} className={`${portalPrimaryAction} inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-caption font-semibold uppercase`}><Download className="size-3.5" />Download All</a></div><PortalDeliverableGallery key={publicId} files={data.deliverables} /></section> : null}
            {data.resources.length > 0 ? <section className="fico-card border border-white/10 bg-white/[0.02]"><div className="flex items-center gap-2"><FileText className="size-4 text-[#C4CEFF]" /><h2 className="text-card-title font-semibold tracking-heading">Project Files &amp; Updates</h2></div><div className="mt-4 divide-y divide-white/[0.07] overflow-hidden rounded-control border border-white/[0.07]">{data.resources.map(resource => <div key={resource.id} className="p-4"><p className="text-caption font-semibold uppercase tracking-wider text-white/35">{resource.resource_type.replace(/_/g, ' ')}</p><p className="mt-1 text-sm font-semibold">{resource.title}</p>{resource.content ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-white/45">{resource.content}</p> : null}{resource.url ? <a href={resource.url} target="_blank" rel="noopener noreferrer" className="group mt-3 inline-flex items-center gap-1.5 rounded-control border border-transparent px-2 py-1.5 text-caption font-semibold uppercase text-[#C4CEFF] transition hover:border-[#C4CEFF]/20 hover:bg-[#C4CEFF]/[0.07] hover:text-white">Open Resource <ExternalLink className="size-3" /></a> : null}</div>)}</div></section> : null}
          </section>
        </div>
      </div>
    </main>
  )
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
    <div className="px-1 pb-2"><p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">FICO MANA Client Portal</p><h1 className="mt-2 break-words text-2xl font-semibold tracking-heading">{data.booking.customerName}</h1><p className="mt-1 font-mono text-caption text-white/35">{data.booking.id}</p></div>
    <section className="rounded-card border border-white/10 bg-white/[0.025] p-4"><div><p className="text-caption font-semibold uppercase tracking-wider text-white/40">Enhanced Photo Selection</p><p className="mt-2 text-lg font-semibold text-[#C4CEFF]">{selected} / {limit} Selected</p></div>{selectionProgress?.editingPreference ? <div className="mt-3 border-t border-white/[0.07] pt-3"><p className="text-caption text-white/35">Editing Preference</p><p className="mt-1 text-caption font-semibold text-white/70">{selectionProgress.editingPreference}</p></div> : null}{selectionLocked ? <div className="mt-3 rounded-control border border-emerald-500/15 bg-emerald-500/[0.05] p-3 text-caption text-emerald-200"><p className="font-semibold">Selection submitted and locked</p>{data.selection?.submittedAt ? <p className="mt-1 text-emerald-100/55">{new Date(data.selection.submittedAt).toLocaleString('en-PH')}</p> : null}</div> : null}</section>
    <section className="rounded-card border border-white/10 bg-white/[0.025] p-4"><div className="grid grid-cols-2 gap-4"><div className="min-w-0"><div className="flex items-center gap-2 text-white/40"><Package className="size-3.5 shrink-0" /><p className="text-caption font-semibold uppercase tracking-wider">Package</p></div><p className="mt-2 break-words text-sm font-semibold">{data.booking.packageName}</p><p className="mt-1 text-caption text-white/40">Booking {data.booking.bookingStatus}</p></div><div className="min-w-0"><div className="flex items-center gap-2 text-white/40"><CalendarDays className="size-3.5 shrink-0" /><p className="text-caption font-semibold uppercase tracking-wider">Shoot Day</p></div><p className="mt-2 break-words text-sm font-semibold">{data.booking.bookingDate}</p></div></div></section>
    <InfoCard icon={WalletCards} label="Payment Summary"><dl className="space-y-3 text-caption tabular-nums"><Row label="Package" value={money(data.booking.price)} /><Row label="Extras" value={money(addonAmount)} /><Row label="Booking Total" value={money(payment.total)} /><Row label="Paid" value={money(data.booking.amountPaid)} accent="text-emerald-300" /><Row label="Remaining" value={money(payment.remaining)} accent="text-[#C4CEFF]" /><Row label="Status" value={data.booking.paymentStatus} /></dl></InfoCard>
    <PortalQrCode compact portalUrl={data.shareUrl} customerName={data.booking.customerName} bookingId={data.booking.id} />
  </>
}

function InfoCard({icon:Icon,label,children}:{icon:React.ComponentType<{className?:string}>;label:string;children:React.ReactNode}){return <div className="fico-card border border-white/10 bg-white/[0.02]"><div className="flex items-center gap-2 text-white/45"><Icon className="size-4"/><span className="text-caption font-semibold uppercase tracking-wider">{label}</span></div><div className="mt-4">{children}</div></div>}
function Row({label,value,accent='text-white'}:{label:string;value:string;accent?:string}){return <div className="flex justify-between gap-4 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0"><dt className="text-white/40">{label}</dt><dd className={`text-right font-semibold ${accent}`}>{value}</dd></div>}
