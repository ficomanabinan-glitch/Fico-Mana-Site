'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, FolderSync, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminInput, adminPage } from '@/lib/admin-ui'

type Item = {
  bookingId: string
  customerName: string
  customerEmail: string
  shootDate: string
  packageName: string
  bookingStatus: string
  paymentStatus: string
  requiredDeposit: number
  price: number
  driveLink: string | null
  provisioningStatus: 'NOT_STARTED' | 'PROVISIONING' | 'ACTIVE' | 'PARTIAL_FAILURE' | 'FAILED'
  driveClientFolderId: string | null
  driveClientFolderUrl: string | null
  lastError: string | null
  provisionedAt: string | null
  lastRetryAt: string | null
  portal: null | {
    id: string
    publicId: string
    status: 'active' | 'disabled' | 'expired'
    expiresAt: string | null
    createdAt: string
    lastAccessedAt: string | null
  }
}

type Overview = {
  items: Item[]
  googleDrive: {
    rootFolderId: string | null
    rootFolderName: string
    portalExpiryDays: number
    oauthConfigured: boolean
  }
}

type Snapshot = {
  clientPortalUrl?: string
  driveClientFolderUrl?: string
  status?: string
  lastError?: string
}

function statusClass(status: Item['provisioningStatus']) {
  if (status === 'ACTIVE') return 'border-green-500/30 bg-green-500/10 text-green-300'
  if (status === 'PROVISIONING') return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
  if (status === 'PARTIAL_FAILURE') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (status === 'FAILED') return 'border-red-500/30 bg-red-500/10 text-red-300'
  return 'border-white/10 bg-white/[0.03] text-white/45'
}

export default function ProvisioningPage() {
  const toast = useAdminToast()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [search, setSearch] = useState('')
  const [rootFolderId, setRootFolderId] = useState('')
  const [expiryDays, setExpiryDays] = useState('30')
  const [savingSettings, setSavingSettings] = useState(false)

  const load = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const response = await fetch('/api/provisioning', { cache: 'no-store', credentials: 'include' })
      const data = (await response.json().catch(() => ({}))) as Overview & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not load provisioning.')
      setOverview(data)
      setRootFolderId(data.googleDrive.rootFolderId || '')
      setExpiryDays(String(data.googleDrive.portalExpiryDays || 30))
    } catch (error) {
      toast.error('Provisioning unavailable', error instanceof Error ? error.message : 'Could not load provisioning.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load(true) }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return overview?.items || []
    return (overview?.items || []).filter((item) =>
      [item.bookingId, item.customerName, item.customerEmail, item.packageName, item.shootDate]
        .some((value) => value.toLowerCase().includes(q)),
    )
  }, [overview, search])

  const counts = useMemo(() => {
    const items = overview?.items || []
    return {
      active: items.filter((item) => item.provisioningStatus === 'ACTIVE').length,
      attention: items.filter((item) => ['FAILED', 'PARTIAL_FAILURE'].includes(item.provisioningStatus)).length,
      notStarted: items.filter((item) => item.provisioningStatus === 'NOT_STARTED').length,
    }
  }, [overview])

  const runAction = async (bookingId: string, action: 'retry' | 'disable_portal' | 'enable_portal') => {
    setBusyId(bookingId)
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/provisioning`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = (await response.json().catch(() => ({}))) as Snapshot & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Provisioning action failed.')
      toast.success(
        action === 'retry' ? 'Provisioning updated' : 'Portal updated',
        data.status === 'ACTIVE' ? `${bookingId} is fully active.` : data.lastError || `${bookingId} updated.`,
      )
      await load(true)
    } catch (error) {
      toast.error('Action failed', error instanceof Error ? error.message : 'Could not update provisioning.')
    } finally {
      setBusyId('')
    }
  }

  const getPortalUrl = async (bookingId: string) => {
    const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/provisioning`, {
      cache: 'no-store',
      credentials: 'include',
    })
    const data = (await response.json().catch(() => ({}))) as Snapshot & { error?: string }
    if (!response.ok || !data.clientPortalUrl) throw new Error(data.error || 'Client Portal is not available yet.')
    return data.clientPortalUrl
  }

  const openPortal = async (bookingId: string) => {
    try {
      const url = await getPortalUrl(bookingId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      toast.error('Portal unavailable', error instanceof Error ? error.message : 'Portal unavailable.')
    }
  }

  const copyPortal = async (bookingId: string) => {
    try {
      const url = await getPortalUrl(bookingId)
      await navigator.clipboard.writeText(url)
      toast.success('Portal link copied', `${bookingId} private Client Portal link copied.`)
    } catch (error) {
      toast.error('Copy failed', error instanceof Error ? error.message : 'Portal unavailable.')
    }
  }

  const saveSettings = async (initializeRoot = false) => {
    setSavingSettings(true)
    try {
      const response = await fetch('/api/integrations/google-drive', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootFolderId: rootFolderId.trim() || undefined,
          portalExpiryDays: Number(expiryDays) || 30,
          initializeRoot,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as { root_folder_id?: string; error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not save Google Drive settings.')
      toast.success('Provisioning settings saved', data.root_folder_id ? 'FICOMANA SHOOTS root verified.' : 'Settings updated.')
      await load(true)
    } catch (error) {
      toast.error('Settings failed', error instanceof Error ? error.message : 'Could not save settings.')
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) {
    return <div className="p-10 text-sm text-white/45">Loading provisioning state…</div>
  }

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Booking Provisioning"
        subtitle="Google Drive and Client Portal automation after confirmed deposits."
        onRefresh={() => load()}
        refreshing={refreshing}
      />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="border border-white/10 bg-white/[0.02] p-5"><p className="text-[10px] uppercase tracking-wider text-white/40">Active projects</p><p className="text-2xl font-bold mt-2 text-green-300">{counts.active}</p></div>
        <div className="border border-white/10 bg-white/[0.02] p-5"><p className="text-[10px] uppercase tracking-wider text-white/40">Needs attention</p><p className="text-2xl font-bold mt-2 text-amber-300">{counts.attention}</p></div>
        <div className="border border-white/10 bg-white/[0.02] p-5"><p className="text-[10px] uppercase tracking-wider text-white/40">Not provisioned</p><p className="text-2xl font-bold mt-2 text-white/70">{counts.notStarted}</p></div>
      </div>

      <section className="border border-white/10 bg-white/[0.02] p-5 md:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <FolderSync className="w-5 h-5 text-[#C4CEFF] mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold">Google Drive automation</h2>
            <p className="text-xs text-white/45 mt-1">FICOMANA SHOOTS → MONTH → DAY → CLIENT NAME</p>
          </div>
          <span className={`ml-auto border px-2 py-1 text-[9px] font-bold uppercase ${overview?.googleDrive.oauthConfigured ? 'border-green-500/30 bg-green-500/10 text-green-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
            {overview?.googleDrive.oauthConfigured ? 'OAuth configured' : 'OAuth env missing'}
          </span>
        </div>
        {!overview?.googleDrive.oauthConfigured ? (
          <div className="border border-amber-500/25 bg-amber-500/10 p-3 flex gap-2 text-xs text-amber-200">
            <TriangleAlert className="w-4 h-4 shrink-0" />
            <p>Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to the Production environment, then redeploy. Secrets are never stored in this page.</p>
          </div>
        ) : null}
        <div className="grid md:grid-cols-[1fr_160px_auto] gap-3 items-end">
          <label className="space-y-1.5"><span className="text-[9px] uppercase tracking-wider text-white/40">FICOMANA SHOOTS root folder ID</span><input value={rootFolderId} onChange={(e) => setRootFolderId(e.target.value)} placeholder="Google Drive folder ID" className={adminInput} /></label>
          <label className="space-y-1.5"><span className="text-[9px] uppercase tracking-wider text-white/40">Portal expiry days</span><input type="number" min={1} max={3650} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className={adminInput} /></label>
          <div className="flex gap-2">
            <button disabled={savingSettings} onClick={() => saveSettings(false)} className="border border-white/15 px-4 py-2.5 text-[10px] font-bold uppercase hover:border-white/30 disabled:opacity-50">Save</button>
            {!rootFolderId && overview?.googleDrive.oauthConfigured ? <button disabled={savingSettings} onClick={() => saveSettings(true)} className="bg-primary px-4 py-2.5 text-[10px] font-bold uppercase disabled:opacity-50">Create / Find Root</button> : null}
          </div>
        </div>
      </section>

      <div className="border border-white/10 bg-white/[0.02] p-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search booking, client, package, date…" className={adminInput} />
      </div>

      <div className="border border-white/10 bg-white/[0.02] overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-xs">
          <thead><tr className="border-b border-white/10 bg-white/[0.03] text-[9px] uppercase tracking-wider text-white/40"><th className="p-4">Booking</th><th className="p-4">Shoot</th><th className="p-4">Payment</th><th className="p-4">Provisioning</th><th className="p-4">Drive</th><th className="p-4">Client Portal</th><th className="p-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((item) => (
              <tr key={item.bookingId} className="align-top hover:bg-white/[0.02]">
                <td className="p-4"><p className="font-mono font-bold text-[#C4CEFF]">{item.bookingId}</p><p className="font-semibold mt-1">{item.customerName}</p><p className="text-[10px] text-white/40 mt-0.5">{item.packageName}</p></td>
                <td className="p-4"><p className="font-semibold">{item.shootDate}</p><p className="text-[10px] text-white/40 mt-1">{item.bookingStatus}</p></td>
                <td className="p-4"><p>{item.paymentStatus}</p><p className="text-[10px] text-white/40 mt-1">Required deposit ₱{item.requiredDeposit.toFixed(2)}</p></td>
                <td className="p-4 max-w-[260px]"><span className={`inline-flex border px-2 py-1 text-[9px] font-bold uppercase ${statusClass(item.provisioningStatus)}`}>{item.provisioningStatus.replace('_', ' ')}</span>{item.lastError ? <p className="text-[10px] text-red-300 mt-2 leading-relaxed">{item.lastError}</p> : null}</td>
                <td className="p-4">{item.driveClientFolderUrl ? <a href={item.driveClientFolderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-green-300 hover:underline">Open folder <ExternalLink className="w-3 h-3" /></a> : <span className="text-white/35">Not created</span>}</td>
                <td className="p-4">{item.portal ? <div><p className="capitalize font-semibold">{item.portal.status}</p>{item.portal.expiresAt ? <p className="text-[10px] text-white/40 mt-1">Expires {new Date(item.portal.expiresAt).toLocaleDateString()}</p> : <p className="text-[10px] text-white/40 mt-1">No expiry yet</p>}</div> : <span className="text-white/35">Not created</span>}</td>
                <td className="p-4"><div className="flex justify-end flex-wrap gap-2">
                  <button disabled={busyId === item.bookingId} onClick={() => runAction(item.bookingId, 'retry')} className="inline-flex items-center gap-1 border border-white/15 px-2.5 py-2 text-[9px] font-bold uppercase hover:border-white/30 disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${busyId === item.bookingId ? 'animate-spin' : ''}`} />{item.provisioningStatus === 'NOT_STARTED' ? 'Provision' : 'Retry'}</button>
                  {item.portal ? <><button onClick={() => openPortal(item.bookingId)} className="inline-flex items-center gap-1 border border-white/15 px-2.5 py-2 text-[9px] font-bold uppercase hover:border-white/30"><ExternalLink className="w-3 h-3" />Portal</button><button onClick={() => copyPortal(item.bookingId)} className="inline-flex items-center gap-1 border border-white/15 px-2.5 py-2 text-[9px] font-bold uppercase hover:border-white/30"><Copy className="w-3 h-3" />Copy</button><button onClick={() => runAction(item.bookingId, item.portal?.status === 'active' ? 'disable_portal' : 'enable_portal')} className="inline-flex items-center gap-1 border border-white/15 px-2.5 py-2 text-[9px] font-bold uppercase hover:border-white/30"><ShieldCheck className="w-3 h-3" />{item.portal.status === 'active' ? 'Disable' : 'Enable'}</button></> : null}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
