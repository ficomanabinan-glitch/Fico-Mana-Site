'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Cloud, ExternalLink, LoaderCircle, QrCode, RefreshCw, ShieldCheck, X } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import PortalQrCode from '@/components/portal-qr-code'
import { useCachedPageRead } from '@/components/use-cached-page-read'
import { adminInput, adminPanel, adminSelect } from '@/lib/admin-ui'
import { filterAndSortClientPortals, provisioningStatuses, type PortalListSort, type ProvisioningStatus } from '@/lib/client-portal-list'

type Portal = { id: string; publicId: string; status: 'active' | 'disabled' | 'expired'; expiresAt: string | null }
type Item = {
  bookingId: string; customerName: string; customerEmail: string; shootDate: string; packageName: string
  bookingStatus: string; paymentStatus: string; requiredDeposit: number
  provisioningStatus: 'NOT_STARTED' | 'PROVISIONING' | 'ACTIVE' | 'PARTIAL_FAILURE' | 'FAILED'
  storageProvider: string | null; storageStatus: string; lastError: string | null; portal: Portal | null
}
type StorageOverview = { provider: string; configured: boolean; privateBucket: boolean; portalExpiryDays: number; signedUrlTtlSeconds: number }
type Overview = { items: Item[]; storage: StorageOverview }
type Snapshot = { clientPortalUrl?: string; status?: string; lastError?: string }
type QrPortal = { bookingId: string; customerName: string; portalUrl: string; status: Portal['status']; expiresAt: string | null }

function statusClass(status: Item['provisioningStatus']) {
  return status === 'ACTIVE' ? 'border-green-500/30 bg-green-500/10 text-green-300'
    : status === 'PROVISIONING' ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
      : status === 'PARTIAL_FAILURE' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : status === 'FAILED' ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : 'border-white/10 bg-white/[0.03] text-white/45'
}

const actionButton = 'inline-flex cursor-pointer items-center justify-center gap-1 rounded-control border border-white/15 px-2.5 py-2 text-caption font-semibold uppercase transition-all duration-200 hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.06] hover:text-white active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

export default function ProvisioningPage() {
  const toast = useAdminToast()
  const [overview, setOverview, loading, setLoading, refreshing] = useCachedPageRead<Overview | null>('editor:client-portals', null)
  const [busyId, setBusyId] = useState('')
  const [portalAction, setPortalAction] = useState<{ bookingId: string; kind: 'open' | 'qr' } | null>(null)
  const [qrPortal, setQrPortal] = useState<QrPortal | null>(null)
  const [search, setSearch] = useState('')
  const [expiryDays, setExpiryDays] = useState(String(overview?.storage.portalExpiryDays || 30))
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProvisioningStatus>('ALL')
  const [sortBy, setSortBy] = useState<PortalListSort>('newest')
  const settingsRevision = useRef(0)

  const load = async () => {
    setLoading(true)
    const revision = settingsRevision.current
    try {
      const response = await fetch('/api/provisioning', { cache: 'no-store', credentials: 'include' })
      const data = await response.json().catch(() => ({})) as Overview & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not load provisioning.')
      setOverview(data)
      if (revision === settingsRevision.current) setExpiryDays(String(data.storage.portalExpiryDays || 30))
    } catch (error) {
      toast.error('Provisioning unavailable', error instanceof Error ? error.message : 'Try again.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => filterAndSortClientPortals(overview?.items || [], search, statusFilter, sortBy), [overview, search, statusFilter, sortBy])
  const counts = useMemo(() => {
    const items = overview?.items || []
    return {
      active: items.filter(item => item.provisioningStatus === 'ACTIVE').length,
      attention: items.filter(item => ['FAILED', 'PARTIAL_FAILURE'].includes(item.provisioningStatus)).length,
      waiting: items.filter(item => item.provisioningStatus === 'NOT_STARTED').length,
    }
  }, [overview])

  const runAction = async (bookingId: string, action: 'retry' | 'disable_portal' | 'enable_portal') => {
    setBusyId(bookingId)
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/provisioning`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const data = await response.json().catch(() => ({})) as Snapshot & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Provisioning action failed.')
      toast.success(action === 'retry' ? 'Provisioning updated' : 'Portal updated', data.status === 'ACTIVE' ? `${bookingId} is fully active.` : data.lastError || `${bookingId} updated.`)
      await load()
    } catch (error) { toast.error('Action failed', error instanceof Error ? error.message : 'Try again.') }
    finally { setBusyId('') }
  }

  const getPortalUrl = async (bookingId: string) => {
    const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/provisioning`, { cache: 'no-store', credentials: 'include' })
    const data = await response.json().catch(() => ({})) as Snapshot & { error?: string }
    if (!response.ok || !data.clientPortalUrl) throw new Error(data.error || 'Client Portal is not active. Enable or reprovision it, then try again.')
    return data.clientPortalUrl
  }
  const openPortal = (bookingId: string) => {
    setPortalAction({ bookingId, kind: 'open' })
    const portalTab = window.open(`/admin/portal/${encodeURIComponent(bookingId)}`, '_blank', 'noopener,noreferrer')
    if (!portalTab) toast.error('Portal tab blocked', 'Allow pop-ups for admin.ficomana.com, then try again.')
    window.setTimeout(() => setPortalAction(null), 350)
  }
  const showPortalQr = async (item: Item, portal: Portal) => {
    const expiry = portal.expiresAt ? Date.parse(portal.expiresAt) : Number.NaN
    if (portal.status === 'expired' || (Number.isFinite(expiry) && expiry <= Date.now())) {
      toast.error('Portal QR expired', 'Press Enable to renew the portal, then open the QR again.'); return
    }
    if (portal.status !== 'active') { toast.error('Portal QR unavailable', 'Press Enable, then open the QR again.'); return }
    setPortalAction({ bookingId: item.bookingId, kind: 'qr' })
    try {
      setQrPortal({ bookingId: item.bookingId, customerName: item.customerName, portalUrl: await getPortalUrl(item.bookingId), status: portal.status, expiresAt: portal.expiresAt })
    } catch (error) { toast.error('QR unavailable', error instanceof Error ? error.message : 'Provision or enable the portal, then try again.') }
    finally { setPortalAction(null) }
  }
  const saveSettings = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/storage/settings', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalExpiryDays: Number(expiryDays) }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not save storage settings.')
      toast.success('Settings saved', 'The portal expiry policy is updated for future access periods.')
      await load()
    } catch (error) { toast.error('Settings failed', error instanceof Error ? error.message : 'Try again.') }
    finally { setSaving(false) }
  }

  const storage = overview?.storage
  return <div className="w-full min-w-0 space-y-6 font-sans" data-testid="client-portals-page">
    <AdminPageHeader title="Client Portals" subtitle="Manage client links and private photo storage." onRefresh={load} refreshing={refreshing} />
    <div aria-busy={!overview && loading} className="grid gap-4 md:grid-cols-3"><Metric label="Active projects" value={overview ? counts.active : null} /><Metric label="Needs attention" value={overview ? counts.attention : null} /><Metric label="Not provisioned" value={overview ? counts.waiting : null} /></div>
    <section className={`${adminPanel} p-5 md:p-6`}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] xl:items-center">
        <div className="flex min-w-0 items-start gap-3"><Cloud className="mt-0.5 size-5 shrink-0 text-[#C4CEFF]" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Private photo storage</h2><p className="mt-1 text-sm text-white/65">Cloudflare R2 · Private bucket · Temporary signed access</p><p role="status" className={`mt-2 text-sm ${!storage ? 'text-white/65' : storage.configured ? 'text-green-300' : 'text-amber-200'}`}>{!storage ? (loading ? 'Checking storage configuration…' : 'Storage configuration could not be loaded. Use Sync to try again.') : storage.configured ? 'Storage credentials are configured on the server.' : 'Storage credentials are missing. Uploads and downloads remain disabled.'}</p></div>{storage ? <ShieldCheck className={`mt-0.5 size-5 shrink-0 ${storage.configured ? 'text-emerald-300' : 'text-amber-300'}`} /> : <LoaderCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-white/65" />}</div>
        <div className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5"><span className="text-caption uppercase tracking-wider text-white/40">Portal expiry days</span><input type="number" min={1} max={3650} value={expiryDays} onChange={event => { settingsRevision.current++; setExpiryDays(event.target.value) }} className={adminInput} /></label>
            <button disabled={saving} onClick={() => void saveSettings()} className={`${actionButton} min-h-11 w-full px-4 sm:w-auto sm:min-w-32`}>{saving ? 'Saving…' : 'Save policy'}</button>
          </div>
          <p className="mt-1.5 text-caption leading-relaxed text-white/35">Applies after the first successful portal-ready email.</p>
        </div>
      </div>
    </section>
    <div className={`${adminPanel} p-4`}><div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_200px_230px]"><label className="text-xs text-white/50">Search clients<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Booking, client, package, or shoot date…" className={`${adminInput} mt-2`} /></label><label className="text-xs text-white/50">Provisioning status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'ALL' | ProvisioningStatus)} className={`${adminSelect} mt-2`}><option value="ALL">All statuses</option>{provisioningStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><label className="text-xs text-white/50">Sort by<select value={sortBy} onChange={event => setSortBy(event.target.value as PortalListSort)} className={`${adminSelect} mt-2`}><option value="newest">Shoot date: newest first</option><option value="oldest">Shoot date: oldest first</option><option value="status">Status: needs attention first</option><option value="client">Client name: A–Z</option></select></label></div><p className="mt-3 text-xs text-white/40" role="status">Showing {filtered.length} of {overview?.items.length || 0} clients</p></div>
    <div className={`${adminPanel} overflow-x-auto`}><table className="w-full min-w-[1100px] text-left text-xs"><thead><tr className="border-b border-white/10 bg-white/[0.03] text-caption uppercase tracking-wider text-white/40"><th className="p-4">Booking</th><th className="p-4">Shoot</th><th className="p-4">Provisioning</th><th className="p-4">Storage</th><th className="p-4">Client Portal</th><th className="min-w-[330px] p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-white/5">{filtered.map(item => {
      const rowBusy = busyId === item.bookingId
      const portalOpening = portalAction?.bookingId === item.bookingId && portalAction.kind === 'open'
      const portalQrLoading = portalAction?.bookingId === item.bookingId && portalAction.kind === 'qr'
      const portalBusy = portalOpening || portalQrLoading
      return <tr key={item.bookingId} className="align-middle transition-colors hover:bg-white/[0.02]"><td className="p-4"><p className="font-mono font-bold text-[#C4CEFF]">{item.bookingId}</p><p className="mt-1 font-semibold">{item.customerName}</p><p className="mt-0.5 text-caption text-white/40">{item.packageName}</p></td><td className="p-4"><p className="font-semibold">{item.shootDate}</p><p className="mt-1 text-caption text-white/40">{item.bookingStatus} · {item.paymentStatus}</p></td><td className="max-w-[260px] p-4"><span className={`inline-flex rounded-md border px-2 py-1 text-caption font-semibold uppercase ${statusClass(item.provisioningStatus)}`}>{item.provisioningStatus.replaceAll('_', ' ')}</span>{item.lastError ? <p className="mt-2 text-caption leading-relaxed text-red-300">{item.lastError}</p> : null}</td><td className="p-4"><span className="capitalize text-white/65">{item.storageStatus.replaceAll('_', ' ')}</span></td><td className="p-4">{item.portal ? <p className="flex items-center gap-2 whitespace-nowrap"><span className={`inline-flex rounded-md border px-2 py-1 text-caption font-semibold capitalize ${item.portal.status === 'active' ? 'border-green-500/30 bg-green-500/10 text-green-300' : item.portal.status === 'expired' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-white/10 bg-white/[0.03] text-white/45'}`}>{item.portal.status}</span>{item.portal.expiresAt ? <span className="text-caption text-white/40">Expires {new Date(item.portal.expiresAt).toLocaleDateString('en-PH')}</span> : null}</p> : <span className="text-white/35">Not created</span>}</td><td className="min-w-[330px] p-4"><div className="flex flex-wrap items-center justify-end gap-3">{['NOT_STARTED', 'FAILED', 'PARTIAL_FAILURE'].includes(item.provisioningStatus) ? <button disabled={rowBusy || !storage?.configured} onClick={() => void runAction(item.bookingId, 'retry')} className={actionButton}><RefreshCw className={`size-3 ${rowBusy ? 'animate-spin' : ''}`} />{item.provisioningStatus === 'NOT_STARTED' ? 'Provision' : 'Retry setup'}</button> : null}{item.portal ? <><button disabled={portalBusy || rowBusy} onClick={() => openPortal(item.bookingId)} className={actionButton}>{portalOpening ? <LoaderCircle className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}{portalOpening ? 'Opening…' : 'Portal'}</button><button disabled={portalBusy || rowBusy} onClick={() => void showPortalQr(item, item.portal!)} className={actionButton}>{portalQrLoading ? <LoaderCircle className="size-3 animate-spin" /> : <QrCode className="size-3" />}{portalQrLoading ? 'Loading…' : 'QR'}</button><button disabled={rowBusy || portalBusy} onClick={() => void runAction(item.bookingId, item.portal!.status === 'active' ? 'disable_portal' : 'enable_portal')} className={`${actionButton} ${item.portal.status === 'active' ? 'border-red-500/25 text-red-200 hover:bg-red-500/10' : ''}`}>{rowBusy ? 'Updating…' : item.portal.status === 'active' ? 'Disable portal' : 'Enable portal'}</button></> : null}</div></td></tr>
    })}{!loading && !filtered.length ? <tr><td colSpan={6} className="p-10 text-center text-sm text-white/45">No clients match these filters. Choose All statuses or change your search.</td></tr> : null}</tbody></table></div>
    {qrPortal ? <PortalQrDialog portal={qrPortal} onClose={() => setQrPortal(null)} /> : null}
  </div>
}

function Metric({ label, value }: { label: string; value: number | null }) { return <div className="rounded-card border border-white/10 bg-white/[0.02] p-5"><p className="text-sm text-white/65">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value ?? '—'}</p></div> }

function PortalQrDialog({ portal, onClose }: { portal: QrPortal; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm" onClick={onClose}><div role="dialog" aria-modal="true" aria-labelledby="portal-qr-title" className="relative my-auto w-full max-w-md rounded-card border border-white/15 bg-[#1d1d1d] p-5 shadow-2xl sm:p-7" onClick={event => event.stopPropagation()}><button type="button" onClick={onClose} aria-label="Close client portal QR" className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full border border-white/10 text-white/55 hover:bg-white/[0.06]"><X className="size-4" /></button><p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">Client Portal Access</p><h2 id="portal-qr-title" className="mt-2 pr-10 text-xl font-semibold">{portal.customerName}</h2><p className="mt-1 font-mono text-caption text-white/35">{portal.bookingId}</p><PortalQrCode portalUrl={portal.portalUrl} customerName={portal.customerName} bookingId={portal.bookingId} heading="Scan Client Portal" className="mt-5" /><div className="mt-4 rounded-control border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-caption leading-relaxed text-emerald-200">Portal is active{portal.expiresAt ? ` until ${new Date(portal.expiresAt).toLocaleDateString('en-PH')}` : ''}. Only show this QR to the named client.</div></div></div>
}
