'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Image as ImageIcon, Lock, Plus, ShoppingBag } from 'lucide-react'

export type ClientGalleryFile = { id: string; fileName: string; mimeType: string; previewUrl: string }
export type ClientAddon = { id: string; name: string; description: string; price: number; pricingType: 'fixed' | 'per_photo' | 'per_piece'; maxQuantity: number }
export type ClientSelection = {
  id: string
  status: 'OPEN' | 'SUBMITTED' | 'SUBMITTING' | 'COPY_FAILED'
  requiredCount: number
  includedLimit: number
  clientStatus: string
  noRevisionAcknowledged: boolean
  submittedAt?: string | null
  reopenedAt?: string | null
  selectedIds: string[]
  selectedItems: Array<{ fileId: string; preference: 'standard' | 'less' | 'raw'; extraEdit: boolean }>
  printAllocations: Array<{ category: PrintCategory; fileId: string; quantity: number; label: string }>
  addonOrders: Array<{ addonId: string | null; name: string; quantity: number; photoCount: number; total: number }>
  totalAddonAmount: number
}

type PrintCategory = 'TOGA_PICTURE_4R' | 'ALAMPAY_BARONG_4R' | 'FRAME_8R' | 'WALLET_SIZE'
type Preference = 'standard' | 'less' | 'raw'
type Step = 'photos' | 'prints' | 'addons' | 'review'

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'photos', label: 'Photos' },
  { id: 'prints', label: 'Free Prints' },
  { id: 'addons', label: 'Add-ons' },
  { id: 'review', label: 'Review' },
]
const PREFERENCES: Array<{ id: Preference; label: string; note?: string }> = [
  { id: 'standard', label: 'Standard Softness / Enhancement', note: 'See our posted samples on our Social Media' },
  { id: 'less', label: 'Less Softness / Enhancement' },
  { id: 'raw', label: 'RAW' },
]
const PRINTS: Array<{ category: PrintCategory; label: string; quantity: number }> = [
  { category: 'TOGA_PICTURE_4R', label: 'TOGA PICTURE — 4R Size Printed / FREE', quantity: 1 },
  { category: 'ALAMPAY_BARONG_4R', label: 'ALAMPAY / BARONG — 4R Size Printed / FREE', quantity: 1 },
  { category: 'FRAME_8R', label: 'FRAME — 8R Size Printed / FREE', quantity: 1 },
  { category: 'WALLET_SIZE', label: 'WALLET SIZE — 4 Copies / FREE', quantity: 4 },
]

function money(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value)
}

export function ClientPhotoSelection({
  publicId,
  selection,
  gallery,
  galleryTotal,
  loadingMore,
  addons,
  onLoadMore,
  onSubmitted,
}: {
  publicId: string
  selection: ClientSelection | null
  gallery: ClientGalleryFile[]
  galleryTotal: number
  loadingMore: boolean
  addons: ClientAddon[]
  onLoadMore: () => void
  onSubmitted: () => Promise<void>
}) {
  const locked = selection?.status === 'SUBMITTED' || selection?.status === 'SUBMITTING'
  const includedLimit = Math.min(5, Math.max(0, selection?.includedLimit || 5))
  const initialItems = selection?.selectedItems || []
  const [step, setStep] = useState<Step>(locked ? 'review' : 'photos')
  const [included, setIncluded] = useState<string[]>(() => initialItems.filter((item) => !item.extraEdit).map((item) => item.fileId))
  const [extras, setExtras] = useState<string[]>(() => initialItems.filter((item) => item.extraEdit).map((item) => item.fileId))
  const [preferences, setPreferences] = useState<Record<string, Preference>>(() => Object.fromEntries(initialItems.map((item) => [item.fileId, item.preference || 'standard'])))
  const [printSelections, setPrintSelections] = useState<Partial<Record<PrintCategory, string>>>(() => Object.fromEntries((selection?.printAllocations || []).map((item) => [item.category, item.fileId])))
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>(() => Object.fromEntries((selection?.addonOrders || []).filter((item) => item.addonId && item.name.toLowerCase() !== 'extra edit').map((item) => [String(item.addonId), item.quantity])))
  const [acknowledged, setAcknowledged] = useState(Boolean(selection?.noRevisionAcknowledged))
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const galleryMap = useMemo(() => new Map(gallery.map((file) => [file.id, file])), [gallery])
  const extraEditAddon = addons.find((addon) => addon.name.trim().toLowerCase() === 'extra edit')
  const optionalAddons = addons.filter((addon) => addon.id !== extraEditAddon?.id)
  const chosenAddonIds = Object.entries(addonQuantities).filter(([, quantity]) => quantity > 0).map(([id]) => id)
  const addonTypeCount = chosenAddonIds.length + (extras.length > 0 ? 1 : 0)
  const printsComplete = PRINTS.every((item) => Boolean(printSelections[item.category]))
  const selectedAll = [...included, ...extras]
  const calculatedAddonTotal = chosenAddonIds.reduce((sum, id) => {
    const addon = addons.find((item) => item.id === id)
    if (!addon) return sum
    const quantity = addonQuantities[id] || 0
    return sum + addon.price * (addon.pricingType === 'fixed' ? 1 : quantity)
  }, 0) + (extraEditAddon?.price || 0) * extras.length
  const addonTotal = locked ? Number(selection?.totalAddonAmount || 0) : calculatedAddonTotal
  const canSubmit = !locked && included.length === includedLimit && printsComplete && acknowledged && addonTypeCount <= 4

  const togglePhoto = (fileId: string) => {
    if (locked) return
    setMessage('')
    if (included.includes(fileId)) {
      setIncluded((current) => current.filter((id) => id !== fileId))
      setPrintSelections((current) => Object.fromEntries(Object.entries(current).filter(([, id]) => id !== fileId)))
      return
    }
    if (extras.includes(fileId)) {
      setExtras((current) => current.filter((id) => id !== fileId))
      return
    }
    setPreferences((current) => ({ ...current, [fileId]: current[fileId] || 'standard' }))
    if (included.length < includedLimit) {
      setIncluded((current) => [...current, fileId])
      return
    }
    if (!extraEditAddon) {
      setMessage('Extra Edit is not currently available. Please contact FICO MANA.')
      return
    }
    if (addonTypeCount >= 4 && extras.length === 0) {
      setMessage('You may select up to four different add-on types.')
      return
    }
    setExtras((current) => [...current, fileId])
  }

  const toggleAddon = (addon: ClientAddon) => {
    if (locked) return
    const active = Boolean(addonQuantities[addon.id])
    if (!active && addonTypeCount >= 4) {
      setMessage('You may select up to four different add-on types, including Extra Edit.')
      return
    }
    setMessage('')
    setAddonQuantities((current) => ({ ...current, [addon.id]: active ? 0 : 1 }))
  }

  const submit = async () => {
    if (!canSubmit || !selection) return
    setSubmitting(true)
    setMessage('')
    try {
      const requestedAddons = chosenAddonIds.map((id) => ({ addonId: id, quantity: addonQuantities[id], photoCount: 0 }))
      if (extras.length && extraEditAddon) requestedAddons.push({ addonId: extraEditAddon.id, quantity: extras.length, photoCount: extras.length })
      const response = await fetch(`/api/editor-workflow/portal/${encodeURIComponent(publicId)}/selection`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: selectedAll,
          includedFileIds: included,
          extraEditFileIds: extras,
          preferences: selectedAll.map((fileId) => ({ fileId, preference: preferences[fileId] || 'standard' })),
          printAllocations: PRINTS.map((item) => ({ category: item.category, fileId: printSelections[item.category], quantity: item.quantity })),
          addons: requestedAddons,
          acknowledgeNoRevision: acknowledged,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Could not submit your selection.')
      await onSubmitted()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Selection submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!selection) return <div className="mt-5 border border-white/[0.07] bg-black/10 p-8 text-center text-xs text-white/35">Photo selection is still being prepared for this booking.</div>

  return <section className="border border-white/10 bg-white/[0.02] p-4 sm:p-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><ImageIcon className="size-4 text-[#C4CEFF]"/><h2 className="text-sm font-semibold">Enhanced Photo Selection</h2></div><p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/45">Choose {includedLimit} included photos. After those are filled, any additional photo you select is automatically priced as an Extra Edit.</p></div>
      <div className={`shrink-0 border px-4 py-2.5 text-center ${locked ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-[#C4CEFF]/20 bg-[#C4CEFF]/5'}`}><p className="text-[9px] uppercase tracking-wider text-white/35">Included Photos</p><p className={`mt-1 text-sm font-bold ${locked ? 'text-emerald-300' : 'text-[#C4CEFF]'}`}>{included.length} / {includedLimit} selected</p>{extras.length ? <p className="mt-1 text-[9px] text-amber-300">+ {extras.length} Extra Edit</p> : null}</div>
    </div>

    {locked ? <div className="mt-4 flex items-start gap-2 border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-200"><Lock className="mt-0.5 size-3.5 shrink-0"/><span>Selection submitted and locked{selection.submittedAt ? ` · ${new Date(selection.submittedAt).toLocaleString('en-PH')}` : ''}. Status: {selection.clientStatus}.</span></div> : null}
    {selection.status === 'COPY_FAILED' ? <div className="mt-4 border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">Your choices were saved, but the studio Drive copy needs another attempt. You may submit again safely.</div> : null}
    {message ? <div role="alert" className="mt-4 flex items-start gap-2 border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-200"><AlertTriangle className="mt-0.5 size-3.5 shrink-0"/>{message}</div> : null}

    <div className="mt-5 grid grid-cols-4 gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1" aria-label="Selection steps">{STEPS.map((item, index) => <button key={item.id} type="button" onClick={() => setStep(item.id)} aria-current={step === item.id ? 'step' : undefined} className={`rounded-lg px-2 py-2 text-[9px] font-bold uppercase tracking-wider transition ${step === item.id ? 'bg-primary text-white' : 'text-white/35 hover:bg-white/5 hover:text-white'}`}><span className="hidden sm:inline">{index + 1}. </span>{item.label}</button>)}</div>

    {step === 'photos' ? <div className="mt-5">
      {gallery.length === 0 ? <div className="border border-white/[0.07] bg-black/10 p-8 text-center text-xs text-white/35">Your studio gallery is still being prepared.</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{gallery.map((file) => {
        const includedPhoto = included.includes(file.id)
        const extraPhoto = extras.includes(file.id)
        const active = includedPhoto || extraPhoto
        return <article key={file.id} className={`group overflow-hidden rounded-xl border transition-all ${includedPhoto ? 'border-[#C4CEFF] ring-2 ring-[#C4CEFF]/20' : extraPhoto ? 'border-amber-400/70 ring-2 ring-amber-400/15' : 'border-white/10 hover:-translate-y-0.5 hover:border-[#C4CEFF]/40'}`}>
          <button type="button" disabled={locked} onClick={() => togglePhoto(file.id)} className="relative block w-full cursor-pointer text-left disabled:cursor-default">
            <div className="aspect-[4/5] overflow-hidden bg-black/20">
              {/* Authenticated portal previews intentionally bypass the public Next image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.previewUrl} alt={file.fileName} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"/>
            </div>
            <div className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/75 px-2 py-1 text-[8px] font-bold uppercase backdrop-blur">{includedPhoto ? 'Included' : extraPhoto ? `Extra ${money(extraEditAddon?.price || 0)}` : included.length < includedLimit ? 'Select' : `Extra ${money(extraEditAddon?.price || 0)}`}</div>
            {active ? <span className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-full ${extraPhoto ? 'bg-amber-300 text-black' : 'bg-[#C4CEFF] text-black'}`}><Check className="size-3.5"/></span> : null}
          </button>
          <div className="space-y-2 bg-[#1d1d1d] p-2.5"><p className="truncate text-[9px] text-white/45">{file.fileName}</p>{active ? <label className="block"><span className="text-[8px] font-bold uppercase tracking-wider text-white/35">Editing preference</span><select value={preferences[file.id] || 'standard'} disabled={locked} onChange={(event) => setPreferences((current) => ({ ...current, [file.id]: event.target.value as Preference }))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#252525] px-2 py-2 text-[9px] text-white outline-none focus:border-[#C4CEFF]/50">{PREFERENCES.map((preference) => <option key={preference.id} value={preference.id}>{preference.label}</option>)}</select>{(preferences[file.id] || 'standard') === 'standard' ? <span className="mt-1 block text-[8px] text-white/25">See our posted samples on our Social Media</span> : null}</label> : null}</div>
        </article>
      })}</div>}
      {gallery.length < galleryTotal ? <button onClick={onLoadMore} disabled={loadingMore} className="mt-4 w-full cursor-pointer rounded-lg border border-white/10 px-4 py-3 text-[10px] font-bold uppercase text-white/60 transition hover:border-[#C4CEFF]/35 hover:bg-[#C4CEFF]/[0.05] disabled:cursor-not-allowed disabled:opacity-40">{loadingMore ? 'Loading more…' : `Load More Photos (${gallery.length} / ${galleryTotal})`}</button> : null}
      <StepFooter back={null} next="prints" onStep={setStep} nextDisabled={included.length !== includedLimit} nextHint={included.length !== includedLimit ? `Select ${includedLimit - included.length} more included photo${includedLimit - included.length === 1 ? '' : 's'}.` : extras.length ? `${extras.length} extra edit${extras.length === 1 ? '' : 's'} added.` : 'Included selection complete.'}/>
    </div> : null}

    {step === 'prints' ? <div className="mt-5 space-y-4"><div className="rounded-xl border border-[#C4CEFF]/15 bg-[#C4CEFF]/[0.04] p-4 text-xs leading-relaxed text-white/50">Allocate each free print from your {includedLimit} included enhanced photos. The same photo may be used in more than one category.</div>{PRINTS.map((print) => <label key={print.category} className="block rounded-xl border border-white/[0.08] bg-black/10 p-4"><span className="text-[10px] font-bold uppercase tracking-wider text-[#C4CEFF]">{print.label}</span><span className="mt-1 block text-[10px] text-white/35">Choose {print.quantity} cop{print.quantity === 1 ? 'y' : 'ies'}.</span><select disabled={locked || included.length !== includedLimit} value={printSelections[print.category] || ''} onChange={(event) => setPrintSelections((current) => ({ ...current, [print.category]: event.target.value }))} className="mt-3 h-11 w-full rounded-lg border border-white/10 bg-[#252525] px-3 text-xs text-white outline-none focus:border-[#C4CEFF]/50"><option value="">Choose an included photo…</option>{included.map((id, index) => <option key={id} value={id}>Photo {index + 1} · {galleryMap.get(id)?.fileName || id}</option>)}</select></label>)}<StepFooter back="photos" next="addons" onStep={setStep} nextDisabled={!printsComplete} nextHint={printsComplete ? 'All free prints allocated.' : 'Choose a photo for every free print category.'}/></div> : null}

    {step === 'addons' ? <div className="mt-5"><div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">Optional paid add-ons</p><p className="mt-1 text-[10px] text-white/35">Choose up to four different add-on types. Zero is okay.</p></div><p className="text-sm font-bold text-[#C4CEFF]">{addonTypeCount} / 4 types</p></div>{extras.length && extraEditAddon ? <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4"><div><p className="text-xs font-semibold text-amber-200">Extra Edit</p><p className="mt-1 text-[10px] text-white/40">{extras.length} additional photo{extras.length === 1 ? '' : 's'} × {money(extraEditAddon.price)}</p></div><p className="font-bold text-amber-200">{money(extras.length * extraEditAddon.price)}</p></div> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2">{optionalAddons.map((addon) => {const quantity = addonQuantities[addon.id] || 0;const active = quantity > 0;return <div key={addon.id} className={`rounded-xl border p-4 transition ${active ? 'border-[#C4CEFF]/45 bg-[#C4CEFF]/[0.06]' : 'border-white/[0.08] bg-black/10'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{addon.name}</p><p className="mt-1 text-[10px] leading-relaxed text-white/35">{addon.description}</p></div><button type="button" disabled={locked} onClick={() => toggleAddon(addon)} aria-pressed={active} className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition disabled:cursor-default ${active ? 'border-[#C4CEFF] bg-[#C4CEFF] text-black' : 'border-white/15 text-white/40 hover:border-white/40 hover:text-white'}`}>{active ? <Check className="size-4"/> : <Plus className="size-4"/>}</button></div><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-[9px] uppercase tracking-wider text-white/30">{addon.pricingType.replace('_', ' ')}</p><p className="mt-1 font-bold text-[#C4CEFF]">{money(addon.price)}{addon.pricingType === 'per_piece' ? ' each' : ''}</p></div>{active && addon.maxQuantity > 1 ? <label className="text-right"><span className="block text-[8px] font-bold uppercase text-white/30">Quantity</span><input type="number" min={1} max={addon.maxQuantity} value={quantity} onChange={(event) => setAddonQuantities((current) => ({ ...current, [addon.id]: Math.min(addon.maxQuantity, Math.max(1, Number(event.target.value) || 1)) }))} className="mt-1 h-9 w-20 rounded-lg border border-white/10 bg-[#252525] px-2 text-center text-xs outline-none focus:border-[#C4CEFF]/50"/></label> : null}</div></div>})}</div><div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4"><span className="text-xs text-white/45">Add-on total</span><strong className="text-xl text-[#C4CEFF]">{money(addonTotal)}</strong></div><StepFooter back="prints" next="review" onStep={setStep} nextDisabled={addonTypeCount > 4} nextHint={addonTypeCount > 4 ? 'Remove an add-on to continue.' : 'You can continue without paid add-ons.'}/></div> : null}

    {step === 'review' ? <div className="mt-5 space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Summary label="Included edits" value={String(included.length)}/><Summary label="Extra edits" value={String(extras.length)}/><Summary label="Add-on total" value={money(addonTotal)}/></div><div className="rounded-xl border border-white/[0.08] bg-black/10 p-4"><p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Editing preferences</p><div className="mt-3 space-y-2">{selectedAll.map((id, index) => <div key={id} className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2 text-[10px] last:border-0 last:pb-0"><span className="min-w-0 truncate">{index + 1}. {galleryMap.get(id)?.fileName || id}</span><span className={extras.includes(id) ? 'shrink-0 text-amber-300' : 'shrink-0 text-[#C4CEFF]'}>{extras.includes(id) ? 'Extra · ' : ''}{PREFERENCES.find((item) => item.id === (preferences[id] || 'standard'))?.label}</span></div>)}</div></div><div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-wider text-amber-200">Important Note</p><p className="mt-2 text-xs leading-relaxed text-white/65">Once the enhanced copies have been released, we will no longer entertain any re-edit concerns or revision requests.</p></div></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/15 p-3"><input type="checkbox" checked={acknowledged} disabled={locked} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-4 accent-[#6678FF]"/><span className="text-[11px] leading-relaxed text-white/65">I have reviewed my photos, editing preferences, free print allocations, and paid add-ons. I understand and acknowledge the no-revision policy above.</span></label></div>{locked ? <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-xs text-emerald-200"><CheckCircle2 className="size-4"/>Your final selection has been submitted. Duplicate submission is blocked.</div> : <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setStep('addons')} className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-3 text-[10px] font-bold uppercase text-white/55 transition hover:border-white/30 hover:text-white"><ChevronLeft className="size-3.5"/>Back</button><button type="button" onClick={() => void submit()} disabled={!canSubmit || submitting} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-[#0300a8] hover:shadow-[0_10px_28px_rgba(5,0,208,0.35)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:shadow-none"><ShoppingBag className="size-4"/>{submitting ? 'Submitting…' : 'Submit Final Selection'}</button></div>}</div> : null}
  </section>
}

function StepFooter({ back, next, onStep, nextDisabled, nextHint }: { back: Step | null; next: Step; onStep: (step: Step) => void; nextDisabled: boolean; nextHint: string }) {
  return <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] text-white/35">{nextHint}</p><div className="flex gap-2">{back ? <button type="button" onClick={() => onStep(back)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-4 py-2.5 text-[10px] font-bold uppercase text-white/55 transition hover:border-white/30 hover:text-white"><ChevronLeft className="size-3.5"/>Back</button> : null}<button type="button" disabled={nextDisabled} onClick={() => onStep(next)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-bold uppercase text-white transition hover:bg-[#0300a8] disabled:cursor-not-allowed disabled:opacity-35">Continue<ChevronRight className="size-3.5"/></button></div></div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-black/10 p-4"><p className="text-[8px] font-bold uppercase tracking-wider text-white/30">{label}</p><p className="mt-1 text-lg font-bold text-[#C4CEFF]">{value}</p></div>
}
