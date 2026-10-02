'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'
import { adminPage, adminPanel, adminSelect, adminBtnPrimary, adminBtnGhost } from '@/lib/admin-ui'
import type { ClientWorkspaceCore, ClientWorkspaceDetails, WorkspaceSection } from '@/lib/client-workspace-types'
import { deriveWorkflowLifecycle, deriveWorkflowNextAction, type WorkflowFacts } from '@/lib/workflow-next-action'
import { staffWorkflowHref } from '@/lib/client-workspace-navigation'
import { studioDay } from '@/lib/new-admin/presentation-data'
import ProductionMilestones from '@/components/production-milestones'

const pesos = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
function dateLabel(value?: string | null) {
  if (!value) return 'Not recorded'
  const date = new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value)
  if (!Number.isFinite(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', ...(value.length === 10 ? {} : { timeStyle: 'short' as const }), timeZone: 'Asia/Manila' }).format(date)
}
const readable = (value?: string | null) => value ? value.replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Not recorded'
const DetailRetryContext = createContext<(() => void) | null>(null)
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-white/65">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-white">{children ?? 'Not recorded'}</dd></div>
}
function SectionState<T>({ section, empty, children }: { section?: WorkspaceSection<T>; empty: string; children: (data: T) => ReactNode }) {
  const retry = useContext(DetailRetryContext)
  const notice = (message: string) => <div className="space-y-2"><p role="alert" className="text-sm leading-6 text-amber-200">{message}</p>{retry && <button type="button" onClick={retry} className={`${adminBtnGhost} inline-flex min-h-11 items-center gap-2 px-3 !normal-case !tracking-normal`}><RefreshCw className="size-4" aria-hidden="true"/>Retry additional details</button>}</div>
  if (!section) return <p role="status" className="text-sm text-white/70">Loading details…</p>
  if (section.status === 'unavailable') return notice(section.message || 'This detail is unavailable. Retry details; other records remain usable.')
  if (section.status === 'empty' || section.data === null) return <p className="text-sm leading-6 text-white/70">{empty}</p>
  return <>{section.status === 'partial' && <div className="mb-4">{notice(section.message || 'Some details are unavailable; known records are shown.')}</div>}{children(section.data)}</>
}
function WorkspaceSection({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return <details open={open} className={`${adminPanel} group overflow-hidden`}>
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-6"><h2 className="text-base font-semibold text-white">{title}</h2><span aria-hidden="true" className="text-lg text-primary group-open:rotate-90">›</span></summary>
    <div className="space-y-6 border-t border-white/10 p-5 sm:p-6">{children}</div>
  </details>
}

export default function ClientWorkspace({ clientId, bookingId }: { clientId: string; bookingId?: string }) {
  const router = useRouter()
  const heading = useRef<HTMLHeadingElement>(null)
  const [headingVisible, setHeadingVisible] = useState(true)
  const [core, setCore] = useState<ClientWorkspaceCore | null>(null)
  const [details, setDetails] = useState<ClientWorkspaceDetails | null>(null)
  const [coreError, setCoreError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [coreRetry, setCoreRetry] = useState(0)
  const [detailRetry, setDetailRetry] = useState(0)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  useEffect(() => {
    const controller = new AbortController()
    setCore(null); setDetails(null); setCoreError(''); setDetailError('')
    const query = new URLSearchParams(bookingId ? { booking: bookingId } : {})
    fetch(`/api/admin/client-workspace/${encodeURIComponent(clientId)}?${query}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'The client workspace is unavailable.'); return body as ClientWorkspaceCore })
      .then(value => { if (!controller.signal.aborted) setCore(value) })
      .catch(cause => { if (!controller.signal.aborted) setCoreError(cause instanceof Error ? cause.message : 'Client workspace could not be loaded.') })
    return () => controller.abort()
  }, [clientId, bookingId, coreRetry])
  useEffect(() => {
    if (!core) return
    const controller = new AbortController()
    setDetails(null); setDetailError('')
    const query = new URLSearchParams({ booking: core.booking.id, section: 'details' })
    fetch(`/api/admin/client-workspace/${encodeURIComponent(clientId)}?${query}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error('Production and payment details could not be loaded.'); return body as ClientWorkspaceDetails })
      .then(value => { if (!controller.signal.aborted && value.bookingId === core.booking.id) setDetails(value) })
      .catch(() => { if (!controller.signal.aborted) setDetailError('Some details could not be loaded. The booking above is still available. Retry details.') })
    return () => controller.abort()
  }, [clientId, core, detailRetry])
  const selectedBookingId = core?.selectedBookingId
  useEffect(() => {
    const element = heading.current
    if (!selectedBookingId || !element) return
    element.focus({ preventScroll: true })
    setHeadingVisible(true)
    const observer = new IntersectionObserver(([entry]) => setHeadingVisible(entry.isIntersecting), {
      root: element.closest('main'),
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [selectedBookingId])

  const back = <Link href="/admin/clients" className="inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft className="size-4" aria-hidden="true"/>All clients</Link>
  if (coreError) return <div className={adminPage}>{back}<h1 className="text-page-title font-semibold text-white">Client workspace unavailable</h1><p role="alert" className="max-w-prose text-sm leading-6 text-amber-200">{coreError}</p><button type="button" className={`${adminBtnGhost} px-4`} onClick={() => setCoreRetry(n => n + 1)}>Retry workspace</button></div>
  if (!core) return <div className={adminPage}>{back}<div role="status" aria-label="Loading client workspace" className="space-y-5"><div className="h-12 w-2/3 animate-pulse rounded-control bg-white/10"/><div className="h-44 animate-pulse rounded-card bg-white/5"/><div className="h-36 animate-pulse rounded-card bg-white/5"/></div></div>
  const s = details?.sections, b = core.booking, links = details?.links || core.links
  const facts: WorkflowFacts = {
    bookingStatus: b.bookingStatus, paymentStatus: b.paymentStatus, shootDate: b.bookingDate, today: studioDay(),
    rawStatus: b.rawPhotoStatus, rawCount: s?.files.data?.rawCount,
    usesSelectionWorkflow: core.package.data?.usesSelectionWorkflow,
    selectionStatus: s?.selection.data?.status || s?.selection.data?.clientStatus,
    reviewStatus: s?.selection.data?.reviewStatus, productionStatus: s?.production.data?.status,
    uploadFailed: s?.production.data?.uploads?.some(job => job.status.toLowerCase() === 'failed' || (job.failedFiles ?? 0) > 0),
    storageFailed: s?.storage.data?.hasError,
    delivered: b.editedPhotoDeliveredAt || s?.production.data?.deliveredAt || s?.portal.data?.deliverablesUploadedAt ? true : s?.production.status === 'ready' && s?.portal.status === 'ready' ? false : undefined,
    portalExpired: s?.portal.data?.expired,
    detailsUnavailable: Boolean(detailError || !details || Object.values(s || {}).some(section => section.status === 'unavailable')),
    pendingDownloadRequests: s?.portal.data?.pendingDownloadRequests,
    shootRecorded: b.shootTime || b.bookingStatus.toLowerCase() === 'completed' ? true : undefined,
    selectionSubmitted: b.rawPhotoSubmittedAt || s?.selection.data?.submittedAt ? true : undefined,
    selectionApproved: b.rawPhotoApprovedAt || s?.selection.data?.approvedAt ? true : undefined,
    enhancedCount: s?.files.data?.enhancedCount,
    editingStartedAt: s?.production.data?.editingStartedAt,
  }
  const next = deriveWorkflowNextAction(facts)
  const lifecycle = deriveWorkflowLifecycle(facts)
  const stageLabels = { recorded: 'Recorded', waiting: 'Awaiting record', unknown: 'Not checked', 'not-required': 'Not required' }
  const contextual = (path: string) => {
    if (path.startsWith('/editor/') || path.startsWith('/admin/') && !path.startsWith('/admin/clients/')) path += `${path.includes('?') ? '&' : '?'}return=${encodeURIComponent(core.links.workspace)}`
    return staffWorkflowHref(path, origin || undefined)
  }
  const actionHref = next.id === 'download-request' ? links.selection.replace('tab=queue', 'tab=downloads') : links[next.target] || links.queue
  const actionLabel = next.target === 'batch' && !links.batch ? 'Open editing queue' : next.target === 'retryUpload' && !links.retryUpload ? 'Review failed upload' : next.label
  const link = (label: string, path: string | null, primary = false) => path ? <Link href={contextual(path)} className={`${primary ? adminBtnPrimary : adminBtnGhost} inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 !normal-case !tracking-normal`} prefetch={false}>{label}<ArrowRight className="size-4" aria-hidden="true"/></Link> : null
  const selectedCount = s?.selection.data?.selectedCount
  return <DetailRetryContext.Provider value={() => setDetailRetry(n => n + 1)}><div className={`${adminPage} mx-auto max-w-6xl`} role="region" aria-label="Client workspace">
    <div role="group" aria-label="Current client and booking" className="sticky top-0 z-10 flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-white/10 bg-[#222222] py-2 text-sm">{back}{!headingVisible && <span className="min-w-0 truncate font-medium text-white">{core.client.name}</span>}<span className="shrink-0 font-mono text-xs text-primary">{b.id}</span></div>
    <header className="space-y-5">
      <div><p className="mb-2 text-sm text-white/70">Client workspace</p><h1 ref={heading} tabIndex={-1} className="break-words text-page-title font-semibold tracking-heading text-white outline-none">{core.client.name}</h1><p className="mt-3 break-words text-sm leading-6 text-white/75">{core.client.email || 'Email not recorded'}{core.client.phone ? ` · ${core.client.phone}` : ''}</p></div>
      <div className="grid gap-4 border-y border-white/10 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div><label htmlFor="workspace-booking-selector" className="mb-2 block text-xs font-semibold text-primary">Booking · {core.bookings.length} linked to this client</label><select id="workspace-booking-selector" value={core.selectedBookingId} className={adminSelect} onChange={event => router.push(`/admin/clients/${encodeURIComponent(clientId)}?booking=${encodeURIComponent(event.target.value)}`)}>{core.bookings.map(booking => <option key={booking.id} value={booking.id}>{booking.id} · {booking.bookingDate} · {booking.packageName}</option>)}</select>{core.client.identitySource === 'booking' && <p className="mt-2 text-xs leading-5 text-white/65">Legacy booking record. Other people are not merged by matching name or email.</p>}</div>
        <dl className="grid grid-cols-2 gap-4"><Field label="Package">{b.packageName}</Field><Field label="Shoot date">{dateLabel(b.bookingDate)}</Field><Field label="Booking">{b.bookingStatus}</Field><Field label="Payment">{b.paymentStatus}</Field></dl>
      </div>
    </header>
    <section aria-labelledby="next-action-title" className="rounded-card border border-primary/25 bg-primary/[0.06] p-5 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center"><div className="max-w-prose"><h2 id="next-action-title" className="text-base font-semibold text-white">Next action · {next.owner === 'none' ? 'Record' : readable(next.owner)}</h2><p className="mt-2 text-sm leading-6 text-white/80">{next.explanation}</p></div>{next.target === 'workspace' ? <button type="button" onClick={() => setDetailRetry(n => n + 1)} className={`${adminBtnPrimary} shrink-0 px-4`}>Retry details</button> : link(actionLabel, actionHref, true)}</div>
      {!details && !detailError && <p role="status" className="mt-4 text-xs text-white/70">Checking production and file details… Booking information is available now.</p>}
    </section>
    <nav aria-label="Client workspace sections" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-white/10 pb-3 text-sm text-primary">{[['Booking and payments','booking'],['Production and files','production'],['Portal and delivery','portal'],['Activity','activity']].map(([label,id]) => <a key={id} href={`#workspace-${id}`} className="inline-flex min-h-11 items-center rounded-control px-1 outline-none focus-visible:ring-2 focus-visible:ring-primary">{label}</a>)}</nav>
    <WorkspaceSection title="Lifecycle · booking to delivery">
      <p className="text-sm leading-6 text-white/70">Current task and blockers are shown separately from each stage’s recorded evidence. Later work does not automatically confirm earlier stages.</p>
      <ol aria-label="Client workflow lifecycle" className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{lifecycle.map((stage, index) => <li key={stage.id} aria-current={stage.attention ? 'step' : undefined} className="min-w-0 border-t border-white/10 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">{index + 1}. {stage.label}</h3><span className={`text-xs ${stage.status === 'recorded' ? 'text-emerald-200' : stage.status === 'waiting' ? 'text-amber-200' : 'text-white/65'}`}>{stageLabels[stage.status]}</span></div>{stage.attention && <p className={`mt-2 text-xs font-medium leading-5 ${stage.attention.status === 'blocked' ? 'text-amber-200' : 'text-primary'}`}>{stage.attention.status === 'blocked' ? 'Blocked' : 'Current task'} · {stage.attention.label}</p>}<p className="mt-2 text-xs leading-5 text-white/70">{stage.detail}</p></li>)}</ol>
    </WorkspaceSection>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className={`text-sm leading-6 ${detailError ? 'text-amber-200' : 'text-white/70'}`} role={detailError ? 'alert' : undefined}>{detailError || (details ? 'Private staff overview. Open the related workflow to make changes.' : 'Loading additional details…')}</p>{next.target !== 'workspace' && <button type="button" onClick={() => setDetailRetry(n => n + 1)} disabled={!core} className={`${adminBtnGhost} inline-flex items-center gap-2 px-3 !normal-case !tracking-normal`}><RefreshCw className="size-4" aria-hidden="true"/>Retry details</button>}</div>
    <div id="workspace-booking" className="scroll-mt-16"><WorkspaceSection title="Booking and payments" open>
      <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3"><Field label="FM reference">{b.id}</Field><Field label="Session time">{b.bookingTime || 'Not assigned'}</Field><Field label="Queue position">{b.clientPriority ? `Client ${b.clientPriority}` : 'Not assigned'}</Field><Field label="Slot / arrival">{[b.slotId, b.arrivalTime].filter(Boolean).join(' · ') || 'Not assigned'}</Field><Field label="Booking total (net)">{pesos(b.price)}</Field><Field label="Discount">{b.discountAmount > 0 ? `${pesos(b.discountAmount)} · ${b.discountLabel || 'Studio discount'}` : 'No discount recorded'}</Field></dl>
      {b.customerFbName && <dl><Field label="Facebook profile name">{b.customerFbName}</Field></dl>}
      <SectionState section={s?.payments} empty="No confirmed payment records found.">{payment => <><dl className="grid gap-5 sm:grid-cols-3"><Field label="Verified / recorded paid">{pesos(payment.amountPaid)}</Field><Field label="Package balance">{pesos(payment.packageBalance)}</Field><Field label="Payment source">{payment.source === 'booking-history' ? 'Legacy booking history' : 'Payment records'}</Field></dl><ul className="mt-5 divide-y divide-white/10">{payment.records.map(record => <li key={record.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div><p className="text-white">{record.type} · {record.method}</p><p className="mt-1 break-words text-xs text-white/65">{dateLabel(record.date)} · {readable(record.status)}{record.transactionRef ? ` · Ref: ${record.transactionRef}` : ''}</p></div><span className="tabular-nums text-white">{pesos(record.amount)}</span></li>)}</ul></>}</SectionState>
      <div className="flex flex-wrap gap-3">{link('Manage booking', links.booking)}{link(b.bookingStatus === 'Pending Verification' || b.paymentStatus === 'Pending Verification' ? 'Review receipt' : 'Payment history', links.payment)}{b.receiptHref && link('View receipt', b.receiptHref)}</div>
      {(b.staffNotes || b.note || b.rejectionReason) && <dl className="grid gap-4"><Field label="Staff notes">{b.staffNotes}</Field>{b.note && <Field label="Booking notes">{b.note}</Field>}{b.rejectionReason && <Field label="Rejection reason">{b.rejectionReason}</Field>}</dl>}
      <SectionState section={core.package} empty="Current package inclusions are not recorded.">{packageDetails => <div><h3 className="text-sm font-semibold text-white">Package inclusions</h3><p className="mt-2 text-xs leading-5 text-white/65">Booking price above is historical. Current package inclusions are reference only.</p><ul className="mt-3 list-inside list-disc space-y-2 text-sm text-white/75">{packageDetails.features.map((feature,index) => <li key={index}>{feature}</li>)}</ul></div>}</SectionState>
      {(b.schoolName || b.course) && <dl className="grid gap-4 sm:grid-cols-2"><Field label="School / course">{[b.schoolName,b.course].filter(Boolean).join(' · ')}</Field><Field label="Shoot preferences">{[b.togaColor,b.hoodColor,b.tasselColor,b.backgroundColor].filter(Boolean).join(' · ')}</Field></dl>}
    </WorkspaceSection></div>
    <div id="workspace-production" className="scroll-mt-16"><WorkspaceSection title="Production and files">
      <div><h3 className="mb-4 text-sm font-semibold text-white">Originals and selections</h3><SectionState section={s?.files} empty="No photo files are indexed for this booking.">{files => <><dl className="grid gap-4 sm:grid-cols-3"><Field label="Original photos">{files.rawCount === null ? 'Count unavailable' : files.rawCount}</Field><Field label="Enhanced photos">{files.enhancedCount === null ? 'Count unavailable' : files.enhancedCount}</Field><Field label="Upload issues">{files.rawFailedCount === null || files.enhancedFailedCount === null ? 'Some counts unavailable' : files.rawFailedCount + files.enhancedFailedCount}</Field><Field label="Last original upload">{dateLabel(files.lastRawUploadAt)}</Field><Field label="Last enhanced upload">{dateLabel(files.lastEnhancedUploadAt)}</Field></dl>{files.recentFiles.length > 0 && <details className="mt-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary">Recent filenames ({files.recentFiles.length} shown)</summary><ul className="divide-y divide-white/10">{files.recentFiles.map(file => <li key={`${file.kind}-${file.id}`} className="break-words py-3 text-sm text-white/80">{file.fileName}<span className="mt-1 block text-xs text-white/65">{readable(file.kind)} · {readable(file.status)} · {file.size === null ? 'Size unavailable' : `${(file.size/1024/1024).toFixed(1)} MB`}</span></li>)}</ul></details>}</>}</SectionState></div>
      <dl className="grid gap-4 sm:grid-cols-3"><Field label="Original selection submitted">{dateLabel(b.rawPhotoSubmittedAt)}</Field><Field label="Selection approved">{dateLabel(b.rawPhotoApprovedAt)}</Field>{b.rawPhotoNotes && <Field label="Selection review notes">{b.rawPhotoNotes}</Field>}</dl>
      <SectionState section={s?.selection} empty={core.package.data?.usesSelectionWorkflow === false ? 'Download-only package: client selection and editing are not required.' : 'No client selection has been recorded yet.'}>{selection => <><dl className="grid gap-4 sm:grid-cols-3"><Field label="Client selection">{readable(selection.clientStatus || selection.status)}</Field><Field label="Staff review">{readable(selection.reviewStatus)}</Field><Field label="Included choices">{selectedCount === null ? 'Count unavailable' : `${selectedCount ?? 'Not recorded'} / ${selection.includedLimit}`}</Field><Field label="Submitted">{dateLabel(selection.submittedAt)}</Field><Field label="Extra edits">{selection.extraEditCount ?? 'Count unavailable'}</Field><Field label="No-revision acknowledgement">{selection.noRevisionAcknowledged ? 'Acknowledged' : 'Not acknowledged'}</Field></dl>{selection.photos && selection.photos.length > 0 && <ul className="mt-4 divide-y divide-white/10">{selection.photos.map(photo => <li key={photo.id} className="break-words py-3 text-sm text-white/80">{photo.fileName || 'Filename unavailable'}<span className="mt-1 block text-xs text-white/65">{readable(photo.preference)}{photo.extraEdit ? ' · Extra edit' : ''}</span></li>)}</ul>}</>}</SectionState>
      <SectionState section={s?.prints} empty="No print assignments recorded.">{prints => <div><h3 className="mb-3 text-sm font-semibold text-white">Print choices</h3><ul className="space-y-3 text-sm text-white/80">{prints.map((print,index) => <li key={`${print.fileId}-${index}`} className="break-words">{print.label} · {print.quantity} copies · {print.fileName || 'Filename unavailable'}</li>)}</ul></div>}</SectionState>
      <SectionState section={s?.addons} empty="No photo add-ons recorded.">{addons => <div><h3 className="mb-3 text-sm font-semibold text-white">Add-ons</h3><ul className="space-y-3 text-sm text-white/80">{addons.map((addon,index) => <li key={index} className="break-words">{addon.name} · {addon.quantity} · {pesos(addon.total)}{addon.photos.length > 0 && <p className="mt-1 text-xs text-white/65">{addon.photos.map(photo => photo.fileName || 'Filename unavailable').join(', ')}</p>}</li>)}</ul></div>}</SectionState>
      <SectionState section={s?.production} empty="No editing job recorded yet.">{production => <><dl className="grid gap-4 sm:grid-cols-3"><Field label="Editing">{readable(production.status)}</Field><Field label="Assigned editor">{production.assignedEditorName || 'Not assigned'}</Field><Field label="Photographer">{production.photographerName || 'Not assigned'}</Field><Field label="Batch">{production.batch?.id || 'Not assigned'}</Field><Field label="Expected enhanced files">{production.expectedOutputCount}</Field><Field label="Delivered">{dateLabel(production.deliveredAt)}</Field></dl><ProductionMilestones production={production}/>{production.uploads && production.uploads.length > 0 && <ul className="mt-4 space-y-3 text-sm text-white/80">{production.uploads.map(upload => <li key={upload.id}>{readable(upload.status)} · {upload.uploadedFiles} / {upload.expectedFiles} files · {upload.attemptCount} attempt{upload.attemptCount === 1 ? '' : 's'}{upload.failedFiles !== null ? ` · ${upload.failedFiles} failed` : ''}</li>)}</ul>}</>}</SectionState>
      <div className="flex flex-wrap gap-3">{link('Onsite upload',links.onsite)}{link('Files for this booking',links.files)}</div>
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary">Selection and editing workflows</summary><div className="flex flex-wrap gap-3 pt-2">{link('Review selections',links.selection)}{link('Editing queue',links.queue)}{link('Editing batch',links.batch)}{link('Upload enhanced photos',links.upload)}</div></details>
    </WorkspaceSection></div>
    <div id="workspace-portal" className="scroll-mt-16"><WorkspaceSection title="Portal and delivery">
      <SectionState section={s?.storage} empty="Photo storage has not been provisioned.">{storage => <dl className="grid gap-4 sm:grid-cols-3"><Field label="Portal setup">{readable(storage.provisioningStatus)}</Field><Field label="Storage state">{readable(storage.status)}</Field><Field label="Last retry">{dateLabel(storage.lastRetryAt)}</Field></dl>}</SectionState>
      <SectionState section={s?.portal} empty="No client portal session recorded.">{portal => <><dl className="grid gap-4 sm:grid-cols-3"><Field label="Portal access">{portal.expired ? 'Expired' : readable(portal.status)}</Field><Field label="Access email">{dateLabel(portal.accessEmailSentAt)}</Field><Field label="Last opened">{dateLabel(portal.lastAccessedAt)}</Field><Field label="Enhanced photos published">{dateLabel(portal.deliverablesUploadedAt)}</Field><Field label="Expires (Manila time)">{dateLabel(portal.expiresAt)}</Field><Field label="Download requests">{portal.pendingDownloadRequests ?? 'Count unavailable'}</Field><Field label="Completed originals downloads">{portal.completedOriginalDownloads ?? 'Count unavailable'}</Field></dl><p className="mt-4 max-w-prose text-sm leading-6 text-white/70">Published photos and completed client downloads are separate events. Portal expiry does not confirm which files are still retained.</p></>}</SectionState>
      <div className="flex flex-wrap gap-3">{link('Manage client portal',links.portalManagement)}{link('Open client portal',links.portal)}</div>
    </WorkspaceSection></div>
    <div id="workspace-activity" className="scroll-mt-16"><WorkspaceSection title="Activity">
      <SectionState section={s?.activity} empty="No lifecycle events recorded yet.">{events => <ol className="divide-y divide-white/10">{events.map(event => <li key={event.id} className="py-3"><p className="text-sm text-white">{event.label}</p><p className="mt-1 text-xs text-white/65">{dateLabel(event.timestamp)} · {readable(event.source)}</p></li>)}</ol>}</SectionState>
    </WorkspaceSection></div>
  </div></DetailRetryContext.Provider>
}
