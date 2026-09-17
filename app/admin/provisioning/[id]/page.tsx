'use client'
import { useCachedPageRead } from '@/components/use-cached-page-read'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, FilePlus2, RefreshCw, Trash2 } from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminInput, adminPage, adminSelect } from '@/lib/admin-ui'

type Snapshot = {
  bookingId: string
  required?: boolean
  status: string
  storageStatus?: string
  clientPortalUrl?: string
  clientPortalStatus?: string
  confirmedPayments: number
  requiredDeposit: number
  lastError?: string
}

type Booking = {
  id: string
  customerName: string
  customerEmail: string
  bookingDate: string
  packageName: string
  bookingStatus: string
  paymentStatus: string
  price: number
}

type PortalOverviewItem = {
  bookingId: string
  customerName: string
  customerEmail: string
  shootDate: string
  packageName: string
  bookingStatus: string
  paymentStatus: string
  price: number
}

type Resource = {
  id: string
  resource_type: 'photos' | 'video' | 'invoice' | 'agreement' | 'meeting_document' | 'project_update' | 'other'
  title: string
  url: string | null
  content: string | null
  is_visible: boolean
  created_at: string
}

type Audit = {
  id: number
  action: string
  actor_type: string
  actor_id: string | null
  external_resource_id: string | null
  metadata: Record<string, unknown>
  error: string | null
  created_at: string
}

const resourceTypes: Array<{ value: Resource['resource_type']; label: string }> = [
  { value: 'photos', label: 'Photos' },
  { value: 'video', label: 'Video' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'meeting_document', label: 'Meeting document' },
  { value: 'project_update', label: 'Project update' },
  { value: 'other', label: 'Other' },
]

export default function ProvisioningBookingPage() {
  const params = useParams<{ id: string }>()
  const bookingId = decodeURIComponent(params.id)
  const toast = useAdminToast()
  const [details, setDetails, loading, setLoading] = useCachedPageRead<{
    booking: Booking; snapshot: Snapshot | null; resources: Resource[]; audit: Audit[]
  } | null>(`editor:client-portals:${bookingId}`, null)
  const booking = details?.booking
  const snapshot = details?.snapshot
  const resources = details?.resources ?? []
  const audit = details?.audit ?? []
  const [busy, setBusy] = useState(false)
  const [resourceType, setResourceType] = useState<Resource['resource_type']>('other')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')

  const load = async () => {
    try {
      const [overviewRes, snapshotRes, resourcesRes, auditRes] = await Promise.all([
        fetch('/api/provisioning', { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/bookings/${encodeURIComponent(bookingId)}/provisioning`, { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/bookings/${encodeURIComponent(bookingId)}/portal-resources`, { cache: 'no-store', credentials: 'include' }),
        fetch(`/api/bookings/${encodeURIComponent(bookingId)}/provisioning/audit`, { cache: 'no-store', credentials: 'include' }),
      ])
      const overviewData = await overviewRes.json().catch(() => ({})) as { items?: PortalOverviewItem[]; error?: string }
      const snapshotData = await snapshotRes.json().catch(() => ({}))
      const resourcesData = await resourcesRes.json().catch(() => [])
      const auditData = await auditRes.json().catch(() => [])
      if (!overviewRes.ok) throw new Error(overviewData.error || 'Client Portal could not be loaded.')
      const portalBooking = overviewData.items?.find(item => item.bookingId === bookingId)
      if (!portalBooking) throw new Error('Client Portal not found.')
      setDetails(previous => ({
        booking: {
          id: portalBooking.bookingId,
          customerName: portalBooking.customerName,
          customerEmail: portalBooking.customerEmail,
          bookingDate: portalBooking.shootDate,
          packageName: portalBooking.packageName,
          bookingStatus: portalBooking.bookingStatus,
          paymentStatus: portalBooking.paymentStatus,
          price: Number(portalBooking.price || 0),
        },
        snapshot: snapshotRes.ok ? snapshotData as Snapshot : previous?.snapshot ?? null,
        resources: resourcesRes.ok ? resourcesData as Resource[] : previous?.resources ?? [],
        audit: auditRes.ok ? auditData as Audit[] : previous?.audit ?? [],
      }))
    } catch (error) {
      toast.error('Load failed', error instanceof Error ? error.message : 'Could not load provisioning details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [bookingId])

  const retry = async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/provisioning`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Provisioning retry failed.')
      toast.success('Provisioning refreshed', data.status === 'ACTIVE' ? 'Private storage and Client Portal are active.' : data.lastError || data.status)
      await load()
    } catch (error) {
      toast.error('Retry failed', error instanceof Error ? error.message : 'Provisioning retry failed.')
    } finally {
      setBusy(false)
    }
  }

  const addResource = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/portal-resources`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType,
          title: title.trim(),
          url: url.trim() || undefined,
          content: content.trim() || undefined,
          isVisible: true,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Resource could not be added.')
      setTitle('')
      setUrl('')
      setContent('')
      toast.success('Portal resource added', 'The client can now see this approved resource.')
      await load()
    } catch (error) {
      toast.error('Resource failed', error instanceof Error ? error.message : 'Resource could not be added.')
    } finally {
      setBusy(false)
    }
  }

  const removeResource = async (resourceId: string) => {
    if (!window.confirm('Remove this resource from the Client Portal?')) return
    setBusy(true)
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/portal-resources`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Resource could not be removed.')
      toast.success('Resource removed', 'It is no longer visible in the Client Portal.')
      await load()
    } catch (error) {
      toast.error('Remove failed', error instanceof Error ? error.message : 'Resource could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="p-10 text-sm text-white/45">Loading project provisioning…</div>
  if (!booking) return <div className="p-10 text-sm text-white/45">Booking not found.</div>

  return (
    <div className={adminPage}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/editor/client-portals" className="inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-wider text-white/45 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" />Client Portals</Link>
          <h1 className="text-2xl font-semibold mt-3">{booking.customerName}</h1>
          <p className="text-xs font-mono text-[#C4CEFF] mt-1">{booking.id}</p>
          <p className="text-xs text-white/45 mt-1">{booking.packageName} · {booking.bookingDate}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {snapshot?.clientPortalUrl ? <a href={snapshot.clientPortalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 border border-white/15 px-3 py-2 text-caption font-semibold uppercase hover:border-white/30">Client Portal <ExternalLink className="w-3.5 h-3.5" /></a> : null}
          <button disabled={busy || snapshot?.required === false} onClick={retry} className="inline-flex items-center gap-1.5 bg-primary px-3 py-2 text-caption font-semibold uppercase disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />{snapshot?.required === false ? 'Portal not required' : 'Retry / Reconcile'}</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="border border-white/10 bg-white/[0.02] p-4"><p className="text-caption uppercase tracking-wider text-white/40">Provisioning</p><p className="font-semibold mt-2">{snapshot?.required === false ? 'Not required' : snapshot?.status || 'NOT_STARTED'}</p></div>
        <div className="border border-white/10 bg-white/[0.02] p-4"><p className="text-caption uppercase tracking-wider text-white/40">Portal</p><p className="font-semibold mt-2 capitalize">{snapshot?.required === false ? 'Not required' : snapshot?.clientPortalStatus || 'Not created'}</p></div>
        <div className="border border-white/10 bg-white/[0.02] p-4"><p className="text-caption uppercase tracking-wider text-white/40">Confirmed payments</p><p className="font-semibold mt-2">₱{Number(snapshot?.confirmedPayments || 0).toFixed(2)}</p></div>
        <div className="border border-white/10 bg-white/[0.02] p-4"><p className="text-caption uppercase tracking-wider text-white/40">Required deposit</p><p className="font-semibold mt-2">₱{Number(snapshot?.requiredDeposit || 0).toFixed(2)}</p></div>
      </div>
      {snapshot?.lastError ? <div className="border border-red-500/25 bg-red-500/10 p-4 text-xs text-red-200">{snapshot.lastError}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="border border-white/10 bg-white/[0.02] p-5 space-y-5">
          <div><h2 className="text-sm font-semibold">Approved Client Portal resources</h2><p className="text-xs text-white/45 mt-1">Only add files, links, documents, or updates the client is allowed to see.</p></div>
          <form onSubmit={addResource} className="space-y-3 border border-white/10 bg-black/10 p-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1.5"><span className="text-caption uppercase tracking-wider text-white/40">Type</span><select value={resourceType} onChange={(e) => setResourceType(e.target.value as Resource['resource_type'])} className={adminSelect}>{resourceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-caption uppercase tracking-wider text-white/40">Title</span><input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Official Invoice" className={adminInput} /></label>
            </div>
            <label className="space-y-1.5 block"><span className="text-caption uppercase tracking-wider text-white/40">HTTPS link (optional)</span><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className={adminInput} /></label>
            <label className="space-y-1.5 block"><span className="text-caption uppercase tracking-wider text-white/40">Client-facing update text (optional)</span><textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Approved project update…" className={`${adminInput} resize-y`} /></label>
            <button disabled={busy || !title.trim() || (!url.trim() && !content.trim())} className="inline-flex items-center gap-1.5 bg-primary px-4 py-2.5 text-caption font-semibold uppercase disabled:opacity-50"><FilePlus2 className="w-3.5 h-3.5" />Add approved resource</button>
          </form>

          <div className="space-y-2">
            {resources.length === 0 ? <p className="text-xs text-white/40">No approved resources attached yet.</p> : resources.map((resource) => (
              <div key={resource.id} className="border border-white/10 bg-white/[0.025] p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0"><p className="text-xs font-semibold">{resource.title}</p><p className="text-caption uppercase tracking-wider text-white/35 mt-1">{resource.resource_type.replace(/_/g, ' ')}</p>{resource.content ? <p className="text-caption text-white/55 mt-2 whitespace-pre-wrap">{resource.content}</p> : null}{resource.url ? <a href={resource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-caption text-[#C4CEFF] hover:underline mt-2">Open resource <ExternalLink className="w-3 h-3" /></a> : null}</div>
                <button disabled={busy} onClick={() => removeResource(resource.id)} className="p-2 text-white/35 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-white/10 bg-white/[0.02] p-5">
          <div><h2 className="text-sm font-semibold">Provisioning audit trail</h2><p className="text-xs text-white/45 mt-1">Payment, booking, storage, portal, retry, resource, and access events.</p></div>
          <div className="mt-5 space-y-2 max-h-[760px] overflow-y-auto pr-1">
            {audit.length === 0 ? <p className="text-xs text-white/40">No audit events yet.</p> : audit.map((event) => (
              <div key={event.id} className="border-l-2 border-white/10 pl-3 py-2">
                <div className="flex items-start justify-between gap-3"><p className="text-caption font-semibold text-white/80">{event.action.replace(/_/g, ' ')}</p><time className="text-caption text-white/30 whitespace-nowrap">{new Date(event.created_at).toLocaleString()}</time></div>
                <p className="text-caption uppercase tracking-wider text-white/30 mt-1">{event.actor_type}{event.actor_id ? ` · ${event.actor_id.slice(0, 8)}…` : ''}</p>
                {event.error ? <p className="text-caption text-red-300 mt-1">{event.error}</p> : null}
                {event.external_resource_id ? <p className="text-caption font-mono text-white/30 mt-1 break-all">Resource: {event.external_resource_id}</p> : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
