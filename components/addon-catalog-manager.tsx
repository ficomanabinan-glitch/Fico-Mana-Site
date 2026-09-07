'use client'

import { useCallback, useEffect, useState } from 'react'
import { Archive, Check, Eye, EyeOff, PackagePlus, Pencil, Save, X } from 'lucide-react'
import { useAdminToast } from '@/components/admin-toast-provider'
import { adminBtnGhost, adminBtnPrimary, adminInput, adminLabel, adminPanel, adminSelect } from '@/lib/admin-ui'

type AddonStatus = 'active' | 'disabled' | 'archived'
type Addon = { id: string; name: string; description: string; priceAmount: number; pricingType: 'fixed' | 'per_photo' | 'per_piece'; displayOrder: number; maxQuantity: number; status: AddonStatus; updatedAt: string }
type Draft = { id?: string; name: string; description: string; priceAmount: string; pricingType: Addon['pricingType']; displayOrder: string; maxQuantity: string; status: AddonStatus }

const emptyDraft = (): Draft => ({ name: '', description: '', priceAmount: '', pricingType: 'fixed', displayOrder: '100', maxQuantity: '1', status: 'active' })
const toDraft = (addon: Addon): Draft => ({ id: addon.id, name: addon.name, description: addon.description, priceAmount: String(addon.priceAmount), pricingType: addon.pricingType, displayOrder: String(addon.displayOrder), maxQuantity: String(addon.maxQuantity), status: addon.status })
function money(value: number) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value) }

export default function AddonCatalogManager() {
  const toast = useAdminToast()
  const [addons, setAddons] = useState<Addon[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/addons', { cache: 'no-store', credentials: 'include' })
      const body = (await response.json().catch(() => [])) as Addon[] & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not load add-ons.')
      setAddons(body)
    } catch (error) {
      toast.error('Add-ons unavailable', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/addons', {
        method: draft.id ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name.trim(),
          description: draft.description.trim(),
          priceAmount: Number(draft.priceAmount),
          pricingType: draft.pricingType,
          displayOrder: Number(draft.displayOrder),
          maxQuantity: Number(draft.maxQuantity),
          status: draft.status,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as Addon & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not save the add-on.')
      setAddons((current) => [...current.filter((item) => item.id !== body.id), body].sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)))
      setDraft(toDraft(body))
      toast.success(draft.id ? 'Add-on updated' : 'Add-on created', `${body.name} is ${body.status}.`)
    } catch (error) {
      toast.error('Add-on not saved', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (addon: Addon, status: AddonStatus) => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/addons', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: addon.id,
          name: addon.name,
          description: addon.description,
          priceAmount: addon.priceAmount,
          pricingType: addon.pricingType,
          displayOrder: addon.displayOrder,
          maxQuantity: addon.maxQuantity,
          status,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as Addon & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not update add-on status.')
      setAddons((current) => current.map((item) => item.id === body.id ? body : item))
      toast.success('Add-on status updated', `${body.name} is ${body.status}.`)
    } catch (error) {
      toast.error('Status not changed', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSaving(false)
    }
  }

  return <section className={`${adminPanel} overflow-hidden`}>
    <div className="flex flex-col gap-3 border-b border-white/[0.08] p-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">Client Add-ons</p><h2 className="mt-1 text-lg font-semibold">Add-on Catalog Manager</h2><p className="mt-1 max-w-2xl text-caption leading-relaxed text-white/40">Prices shown in the client portal are saved as snapshots when submitted. Later price changes never alter an existing order.</p></div><button type="button" onClick={() => setDraft(emptyDraft())} className={`${adminBtnPrimary} inline-flex items-center justify-center gap-2 px-4 py-2.5`}><PackagePlus className="size-4"/>Add Add-on</button></div>
    {loading ? <div className="grid gap-3 p-5 sm:grid-cols-2 animate-pulse">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 rounded-xl bg-white/[0.05]"/>)}</div> : <div className="grid gap-3 p-5 sm:grid-cols-2">{addons.map((addon) => <article key={addon.id} className={`rounded-xl border p-4 ${addon.status === 'active' ? 'border-white/[0.09] bg-black/10' : addon.status === 'disabled' ? 'border-amber-500/15 bg-amber-500/[0.03]' : 'border-white/[0.05] bg-black/5 opacity-65'}`}><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{addon.name}</p><span className={`rounded border px-2 py-0.5 text-caption font-semibold uppercase ${addon.status === 'active' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : addon.status === 'disabled' ? 'border-amber-500/25 bg-amber-500/10 text-amber-300' : 'border-white/10 text-white/35'}`}>{addon.status}</span></div><p className="mt-1 text-caption leading-relaxed text-white/35">{addon.description || 'No description'}</p></div><button type="button" onClick={() => setDraft(toDraft(addon))} className={`${adminBtnGhost} inline-flex shrink-0 items-center gap-1.5 px-3 py-2`}><Pencil className="size-3.5"/>Edit</button></div><div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-white/[0.07] pt-3"><div><p className="text-lg font-bold text-[#C4CEFF]">{money(addon.priceAmount)}</p><p className="text-caption font-semibold uppercase tracking-wider text-white/30">{addon.pricingType.replace('_', ' ')} · max {addon.maxQuantity} · order {addon.displayOrder}</p></div><div className="flex gap-1">{addon.status !== 'active' ? <button type="button" disabled={saving} onClick={() => void changeStatus(addon, 'active')} title="Enable add-on" className="cursor-pointer rounded-lg border border-emerald-500/20 p-2 text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed"><Eye className="size-3.5"/></button> : <button type="button" disabled={saving} onClick={() => void changeStatus(addon, 'disabled')} title="Disable add-on" className="cursor-pointer rounded-lg border border-amber-500/20 p-2 text-amber-300 hover:bg-amber-500/10 disabled:cursor-not-allowed"><EyeOff className="size-3.5"/></button>}{addon.status !== 'archived' ? <button type="button" disabled={saving} onClick={() => void changeStatus(addon, 'archived')} title="Archive add-on" className="cursor-pointer rounded-lg border border-white/10 p-2 text-white/35 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed"><Archive className="size-3.5"/></button> : null}</div></div></article>)}{addons.length === 0 ? <p className="col-span-full p-8 text-center text-xs text-white/35">No add-ons configured yet.</p> : null}</div>}

    {draft ? <div className="fixed inset-0 z-[60] flex justify-end bg-black/75 backdrop-blur-sm"><button type="button" aria-label="Close add-on editor" className="absolute inset-0" onClick={() => !saving && setDraft(null)}/><aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-white/10 bg-[#222222]"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">System Management</p><h2 className="mt-1 text-lg font-semibold">{draft.id ? 'Edit Add-on' : 'Add Add-on'}</h2></div><button type="button" onClick={() => setDraft(null)} disabled={saving} aria-label="Close editor" className="cursor-pointer rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed"><X className="size-5"/></button></div><div className="flex-1 space-y-5 overflow-y-auto p-5"><Field label="Add-on Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={adminInput} placeholder="11x14 Frame"/></Field><Field label="Description"><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={adminInput}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Price (PHP)"><input type="number" min="0" value={draft.priceAmount} onChange={(event) => setDraft({ ...draft, priceAmount: event.target.value })} className={adminInput}/></Field><Field label="Pricing Type"><select value={draft.pricingType} onChange={(event) => setDraft({ ...draft, pricingType: event.target.value as Addon['pricingType'] })} className={adminSelect}><option value="fixed">Fixed</option><option value="per_photo">Per Photo</option><option value="per_piece">Per Piece</option></select></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Maximum Quantity"><input type="number" min="1" max="500" value={draft.maxQuantity} onChange={(event) => setDraft({ ...draft, maxQuantity: event.target.value })} className={adminInput}/></Field><Field label="Display Order"><input type="number" min="0" max="9999" value={draft.displayOrder} onChange={(event) => setDraft({ ...draft, displayOrder: event.target.value })} className={adminInput}/></Field></div><Field label="Status"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AddonStatus })} className={adminSelect}><option value="active">Active</option><option value="disabled">Disabled</option><option value="archived">Archived</option></select></Field><div className="rounded-xl border border-[#C4CEFF]/15 bg-[#C4CEFF]/[0.04] p-4 text-caption leading-relaxed text-white/45"><Check className="mr-2 inline size-3.5 text-[#C4CEFF]"/>Submitted orders keep this name, description, pricing type, unit price, quantity, and total as historical snapshots.</div></div><div className="flex justify-end gap-2 border-t border-white/10 p-5"><button type="button" onClick={() => setDraft(null)} disabled={saving} className={`${adminBtnGhost} px-5 py-3`}>Cancel</button><button type="button" onClick={() => void save()} disabled={saving} className={`${adminBtnPrimary} inline-flex items-center gap-2 px-5 py-3`}><Save className="size-4"/>{saving ? 'Saving…' : 'Save Add-on'}</button></div></aside></div> : null}
  </section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2"><span className={adminLabel}>{label}</span>{children}</label> }
