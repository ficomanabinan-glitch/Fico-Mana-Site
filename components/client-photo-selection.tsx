'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Image as ImageIcon, Lock, Plus, ShoppingBag, ZoomIn } from 'lucide-react'

import { PhotoSelectButton, PortalPhotoPreview } from '@/components/portal-photo-preview'
import { calculateClientAddons, initialEditingPreference, portalPaymentSummary, type AddonPreview } from '@/lib/client-selection-summary'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { clearPortalDraft, portalDraftKey, readPortalDraft, writePortalDraft, type PortalDraftChoices } from '@/lib/portal-selection-draft'

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
  paymentSummary,
  onLoadMore,
  onSubmitted,
  onPricingChange,
}: {
  publicId: string
  selection: ClientSelection | null
  gallery: ClientGalleryFile[]
  galleryTotal: number
  loadingMore: boolean
  addons: ClientAddon[]
  paymentSummary: { packageAmount: number; amountPaid: number }
  onLoadMore: () => void
  onSubmitted: (photos?: { url?: string; warning?: string }) => Promise<void>
  onPricingChange?: (summary: AddonPreview) => void
}) {
  const locked = selection?.status === 'SUBMITTED' || selection?.status === 'SUBMITTING'
  const includedLimit = Math.min(5, Math.max(0, selection?.includedLimit || 5))
  const initialItems = selection?.selectedItems || []
  const [step, setStep] = useState<Step>(locked ? 'review' : 'photos')
  const [included, setIncluded] = useState<string[]>(() => initialItems.filter((item) => !item.extraEdit).map((item) => item.fileId))
  const [extras, setExtras] = useState<string[]>(() => initialItems.filter((item) => item.extraEdit).map((item) => item.fileId))
  const [editingPreference, setEditingPreference] = useState<Preference | ''>(() => initialEditingPreference(initialItems))
  const [previewFile, setPreviewFile] = useState<ClientGalleryFile | null>(null)
  const [printSelections, setPrintSelections] = useState<Partial<Record<PrintCategory, string>>>(() => Object.fromEntries((selection?.printAllocations || []).map((item) => [item.category, item.fileId])))
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>(() => Object.fromEntries((selection?.addonOrders || []).filter((item) => item.addonId && item.name.toLowerCase() !== 'extra edit').map((item) => [String(item.addonId), item.quantity])))
  const [acknowledged, setAcknowledged] = useState(Boolean(selection?.noRevisionAcknowledged))
  const [submitting, setSubmitting] = useState(false)
  // PINs are transient: never put them in the 15-minute draft or a URL.
  const [submissionPin, setSubmissionPin] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const confirmationTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { setSubmissionPin('') }, [publicId, step, locked])
  const [message, setMessage] = useState('')
  const [hydratedDraftKey, setHydratedDraftKey] = useState('')
  const [draftExpiresAt, setDraftExpiresAt] = useState<number | null>(null)
  const [draftFinished, setDraftFinished] = useState(false)
  const lastSavedDraft = useRef('')
  const draftKey = portalDraftKey(publicId, selection?.id || '', selection?.reopenedAt, includedLimit)
  const draft = useMemo<PortalDraftChoices>(() => ({ included, extras, editingPreference, printSelections, addonQuantities, acknowledged, step }),
    [included, extras, editingPreference, printSelections, addonQuantities, acknowledged, step])

  useEffect(() => {
    if (!selection?.id) return
    if (locked) clearPortalDraft(draftKey)
    const hydrationKey = locked ? `${draftKey}:locked` : draftKey
    if (hydratedDraftKey === hydrationKey) return
    const saved = locked ? null : readPortalDraft(draftKey)
    const choices: PortalDraftChoices = saved?.choices || {
      included: selection.selectedItems.filter(item => !item.extraEdit).map(item => item.fileId),
      extras: selection.selectedItems.filter(item => item.extraEdit).map(item => item.fileId),
      editingPreference: initialEditingPreference(selection.selectedItems),
      printSelections: Object.fromEntries(selection.printAllocations.map(item => [item.category, item.fileId])),
      addonQuantities: Object.fromEntries(selection.addonOrders.filter(item => item.addonId && item.name.toLowerCase() !== 'extra edit').map(item => [String(item.addonId), item.quantity])),
      acknowledged: selection.noRevisionAcknowledged,
      step: locked ? 'review' : 'photos',
    }
    lastSavedDraft.current = JSON.stringify(choices)
    setIncluded(choices.included)
    setExtras(choices.extras)
    setEditingPreference(choices.editingPreference)
    setPrintSelections(choices.printSelections)
    setAddonQuantities(choices.addonQuantities)
    setAcknowledged(choices.acknowledged)
    setStep(choices.step)
    setDraftExpiresAt(saved?.expiresAt || null)
    setDraftFinished(false)
    setHydratedDraftKey(hydrationKey)
  }, [selection, locked, draftKey, hydratedDraftKey])

  useEffect(() => {
    if (!selection?.id || locked || draftFinished || hydratedDraftKey !== draftKey) return
    const fingerprint = JSON.stringify(draft)
    if (lastSavedDraft.current === fingerprint) return
    // Refreshing, loading more photos and price refetches do not extend the 15-minute timer.
    setDraftExpiresAt(writePortalDraft(draftKey, draft))
    lastSavedDraft.current = fingerprint
  }, [selection?.id, locked, draftFinished, hydratedDraftKey, draftKey, draft])

  useEffect(() => {
    if (!draftExpiresAt) return
    const timer = setTimeout(() => clearPortalDraft(draftKey), Math.max(0, draftExpiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [draftKey, draftExpiresAt])

  const galleryMap = useMemo(() => new Map(gallery.map((file) => [file.id, file])), [gallery])
  const extraEditAddon = addons.find((addon) => addon.name.trim().toLowerCase() === 'extra edit')
  const optionalAddons = addons.filter((addon) => addon.id !== extraEditAddon?.id)
  const chosenAddonIds = Object.entries(addonQuantities).filter(([, quantity]) => quantity > 0).map(([id]) => id)
  const addonTypeCount = chosenAddonIds.length + (extras.length > 0 ? 1 : 0)
  const printsComplete = PRINTS.every((item) => Boolean(printSelections[item.category]))
  const selectedAll = [...included, ...extras]
  const pricing = useMemo<AddonPreview>(() => locked ? {
    total: Number(selection?.totalAddonAmount || 0),
    lines: (selection?.addonOrders || []).map((order, index) => ({
      id: order.addonId || String(index), name: order.name, quantity: order.quantity, amount: order.total,
    })),
  } : calculateClientAddons(addons, addonQuantities, extras.length), [locked, selection, addons, addonQuantities, extras.length])
  const addonTotal = pricing.total
  const payment = portalPaymentSummary(paymentSummary.packageAmount, paymentSummary.amountPaid, addonTotal)
  useEffect(() => { onPricingChange?.(pricing) }, [onPricingChange, pricing])
  const canSubmit = !locked && !draftFinished && Boolean(editingPreference) && included.length === includedLimit && printsComplete && acknowledged && addonTypeCount <= 4
  const selectedPhoto = (id: string): ClientGalleryFile => galleryMap.get(id) || {
    id, fileName: 'Selected photo', mimeType: 'image/jpeg',
    previewUrl: `/api/editor-workflow/portal/${encodeURIComponent(publicId)}/file/${encodeURIComponent(id)}?kind=gallery`,
  }

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
    if (!canSubmit || !selection || submitting) return
    if (!/^[0-9]{4}$/.test(submissionPin)) {
      setMessage('Enter the last 4 digits of the phone number used for this booking to submit your final selection.')
      return
    }
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
          pin: submissionPin,
          fileIds: selectedAll,
          includedFileIds: included,
          extraEditFileIds: extras,
          preferences: selectedAll.map((fileId) => ({ fileId, preference: editingPreference })),
          printAllocations: PRINTS.map((item) => ({ category: item.category, fileId: printSelections[item.category], quantity: item.quantity })),
          addons: requestedAddons,
          acknowledgeNoRevision: acknowledged,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string; allPhotosUrl?: string; allPhotosWarning?: string }
      if (response.ok || body.code === 'SELECTION_SUBMITTED_REFRESH_FAILED') {
        clearPortalDraft(draftKey)
        setDraftFinished(true)
        setConfirmationOpen(false)
      }
      if (!response.ok) {
        if (body.code === 'RATE_LIMITED') throw new Error('Too many submission attempts. Try: wait 15 minutes before entering your PIN again. You can still view your photos.')
        if (body.code === 'RATE_LIMIT_UNAVAILABLE') throw new Error('Submission checks are temporarily unavailable. Try: wait a moment and submit again. Your choices have not been submitted.')
        throw new Error(body.error || 'Could not submit your selection. Try: wait a moment and submit again.')
      }
      await onSubmitted({ url: body.allPhotosUrl, warning: body.allPhotosWarning })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Selection submission failed.')
    } finally {
      setSubmissionPin('')
      setSubmitting(false)
    }
  }

  const requestSubmission = () => {
    if (!canSubmit || submitting) return
    setMessage('')
    setSubmissionPin('')
    setConfirmationOpen(true)
  }

  if (!selection) return <div className="mt-5 border border-white/[0.07] bg-black/10 p-8 text-center text-xs text-white/35">Photo selection is still being prepared for this booking.</div>

  return <section className="fico-card border border-white/10 bg-white/[0.02]">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex items-center gap-2"><ImageIcon className="size-4 text-[#C4CEFF]"/><h2 className="text-card-title font-semibold tracking-heading">Enhanced Photo Selection</h2></div><p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/45">Choose {includedLimit} included photos. After those are filled, any additional photo you select is automatically priced as an Extra Edit.</p></div>
      <div className={`shrink-0 border px-4 py-2.5 text-center ${locked ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-[#C4CEFF]/20 bg-[#C4CEFF]/5'}`}><p className="text-caption uppercase tracking-wider text-white/35">Included Photos</p><p className={`mt-1 text-sm font-bold ${locked ? 'text-emerald-300' : 'text-[#C4CEFF]'}`}>{included.length} / {includedLimit} selected</p>{extras.length ? <p className="mt-1 text-caption text-amber-300">+ {extras.length} Extra Edit</p> : null}</div>
    </div>

    {locked ? <div className="mt-4 flex items-start gap-2 border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-200"><Lock className="mt-0.5 size-3.5 shrink-0"/><span>Selection submitted and locked{selection.submittedAt ? ` · ${new Date(selection.submittedAt).toLocaleString('en-PH')}` : ''}. Status: {selection.clientStatus}.</span></div> : null}
    {selection.status === 'COPY_FAILED' ? <div className="mt-4 border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">Your previous submission could not be completed. Try: review your choices and submit again. If a photo is unavailable, ask the studio to restore the original first.</div> : null}
    {message ? <div role="alert" className="mt-4 flex items-start gap-2 border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-200"><AlertTriangle className="mt-0.5 size-3.5 shrink-0"/>{message}</div> : null}

    <label className="mt-5 block rounded-xl border border-white/[0.08] bg-black/10 p-4">
      <span className="text-caption font-semibold uppercase tracking-wider text-[#C4CEFF]">Editing preference</span>
      <select value={editingPreference} disabled={locked || submitting} onChange={(event) => setEditingPreference(event.target.value as Preference)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#252525] px-3 text-xs text-white outline-none focus:border-[#C4CEFF]/50">
        {!editingPreference ? <option value="">{locked ? 'Previously saved mixed preferences' : 'Choose one editing preference…'}</option> : null}
        {PREFERENCES.map((preference) => <option key={preference.id} value={preference.id}>{preference.label}</option>)}
      </select>
      <span className="mt-2 block text-caption text-white/35">{locked && !editingPreference ? 'Your previously submitted preferences are preserved.' : 'Applies to all included photos and Extra Edits.'}</span>
      {editingPreference === 'standard' ? <span className="mt-1 block text-caption text-white/25">See our posted samples on our Social Media.</span> : null}
    </label>

    <div className="mt-5 grid grid-cols-4 gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1" aria-label="Selection steps">{STEPS.map((item, index) => <button key={item.id} type="button" onClick={() => setStep(item.id)} aria-current={step === item.id ? 'step' : undefined} className={`rounded-lg px-2 py-2 text-caption font-semibold uppercase tracking-wider transition ${step === item.id ? 'bg-primary text-white' : 'text-white/35 hover:bg-white/5 hover:text-white'}`}><span className="hidden sm:inline">{index + 1}. </span>{item.label}</button>)}</div>

    {step === 'photos' ? <div className="mt-5">
      {gallery.length === 0 ? <div className="border border-white/[0.07] bg-black/10 p-8 text-center text-xs text-white/35">Your studio gallery is still being prepared.</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{gallery.map((file) => {
        const includedPhoto = included.includes(file.id)
        const extraPhoto = extras.includes(file.id)
        const active = includedPhoto || extraPhoto
        return <article key={file.id} className={`group overflow-hidden rounded-xl border transition-all ${includedPhoto ? 'border-[#C4CEFF] ring-2 ring-[#C4CEFF]/20' : extraPhoto ? 'border-amber-400/70 ring-2 ring-amber-400/15' : 'border-white/10 hover:-translate-y-0.5 hover:border-[#C4CEFF]/40'}`}>
          <PhotoSelectButton file={file} locked={locked || submitting} onSelect={() => togglePhoto(file.id)} onPreview={() => setPreviewFile(file)}>
            <div className="aspect-[4/5] overflow-hidden bg-black/20">
              {/* Authenticated portal previews intentionally bypass the public Next image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.previewUrl} alt={file.fileName} draggable={false} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"/>
            </div>
            <div className="absolute left-2 top-2 rounded-full border border-white/15 bg-black/75 px-2 py-1 text-caption font-semibold uppercase backdrop-blur">{includedPhoto ? 'Included' : extraPhoto ? `Extra ${money(extraEditAddon?.price || 0)}` : included.length < includedLimit ? 'Select' : `Extra ${money(extraEditAddon?.price || 0)}`}</div>
            {active ? <span className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-full ${extraPhoto ? 'bg-amber-300 text-black' : 'bg-[#C4CEFF] text-black'}`}><Check className="size-3.5"/></span> : null}
          </PhotoSelectButton>
          <div className="flex items-center justify-between gap-2 bg-[#1d1d1d] p-2.5"><p className="min-w-0 truncate text-caption text-white/45">{file.fileName}</p><button type="button" onClick={() => setPreviewFile(file)} aria-label={`Preview ${file.fileName}`} title="Preview photo (or press and hold the image)" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/10 text-[#C4CEFF] transition hover:border-[#C4CEFF]/40 hover:bg-white/5"><ZoomIn className="size-4"/></button></div>
        </article>
      })}</div>}
      {gallery.length < galleryTotal ? <button onClick={onLoadMore} disabled={loadingMore} className="mt-4 w-full cursor-pointer rounded-lg border border-white/10 px-4 py-3 text-caption font-semibold uppercase text-white/60 transition hover:border-[#C4CEFF]/35 hover:bg-[#C4CEFF]/[0.05] disabled:cursor-not-allowed disabled:opacity-40">{loadingMore ? 'Loading more…' : `Load More Photos (${gallery.length} / ${galleryTotal})`}</button> : null}
      <StepFooter back={null} next="prints" onStep={setStep} nextDisabled={included.length !== includedLimit} nextHint={included.length !== includedLimit ? `Select ${includedLimit - included.length} more included photo${includedLimit - included.length === 1 ? '' : 's'}.` : extras.length ? `${extras.length} extra edit${extras.length === 1 ? '' : 's'} added.` : 'Included selection complete.'}/>
    </div> : null}

    {step === 'prints' ? <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-[#C4CEFF]/15 bg-[#C4CEFF]/[0.04] p-4 text-xs leading-relaxed text-white/50">Allocate each free print from your {includedLimit} included enhanced photos. The same photo may be used in more than one category.</div>
      {PRINTS.map((print) => {
        const fileId = printSelections[print.category]
        const file = fileId ? selectedPhoto(fileId) : null
        return <div key={print.category} className="block rounded-xl border border-white/[0.08] bg-black/10 p-4">
          <label htmlFor={`print-${print.category}`} className="text-caption font-semibold uppercase tracking-wider text-[#C4CEFF]">{print.label}</label>
          <p className="mt-1 text-caption text-white/35">Choose {print.quantity} cop{print.quantity === 1 ? 'y' : 'ies'}.</p>
          <select id={`print-${print.category}`} disabled={locked || submitting || included.length !== includedLimit} value={fileId || ''} onChange={(event) => setPrintSelections((current) => ({ ...current, [print.category]: event.target.value }))} className="mt-3 h-11 w-full rounded-lg border border-white/10 bg-[#252525] px-3 text-xs text-white outline-none focus:border-[#C4CEFF]/50">
            <option value="">Choose an included photo…</option>{included.map((id, index) => <option key={id} value={id}>Photo {index + 1} · {galleryMap.get(id)?.fileName || id}</option>)}
          </select>
          {file ? <button type="button" onClick={() => setPreviewFile(file)} aria-label={`Preview ${print.label}: ${file.fileName}`} className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/10 p-2 text-left transition hover:border-[#C4CEFF]/40">
            {/* Authenticated images stay behind the private portal endpoint. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.previewUrl} alt={`Selected for ${print.label}`} width={72} height={90} loading="lazy" decoding="async" className="h-[90px] w-[72px] shrink-0 rounded object-contain"/>
            <span className="min-w-0"><span className="block break-all text-caption text-white/65">{file.fileName}</span><span className="mt-1 flex items-center gap-1 text-caption text-[#C4CEFF]"><ZoomIn className="size-3"/>View photo · {print.quantity} cop{print.quantity === 1 ? 'y' : 'ies'}</span></span>
          </button> : null}
        </div>
      })}
      <StepFooter back="photos" next="addons" onStep={setStep} nextDisabled={!printsComplete} nextHint={printsComplete ? 'All free prints allocated.' : 'Choose a photo for every free print category.'}/>
    </div> : null}

    {step === 'addons' ? <div className="mt-5"><div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-black/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold">Optional paid add-ons</p><p className="mt-1 text-caption text-white/35">Choose up to four different add-on types. Zero is okay.</p></div><p className="text-sm font-bold text-[#C4CEFF]">{addonTypeCount} / 4 types</p></div>{extras.length && extraEditAddon ? <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4"><div><p className="text-xs font-semibold text-amber-200">Extra Edit</p><p className="mt-1 text-caption text-white/40">{extras.length} additional photo{extras.length === 1 ? '' : 's'} × {money(extraEditAddon.price)}</p></div><p className="font-bold text-amber-200">{money(extras.length * extraEditAddon.price)}</p></div> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2">{optionalAddons.map((addon) => {const quantity = addonQuantities[addon.id] || 0;const active = quantity > 0;return <div key={addon.id} className={`rounded-xl border p-4 transition ${active ? 'border-[#C4CEFF]/45 bg-[#C4CEFF]/[0.06]' : 'border-white/[0.08] bg-black/10'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{addon.name}</p><p className="mt-1 text-caption leading-relaxed text-white/35">{addon.description}</p></div><button type="button" disabled={locked} onClick={() => toggleAddon(addon)} aria-pressed={active} className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition disabled:cursor-default ${active ? 'border-[#C4CEFF] bg-[#C4CEFF] text-black' : 'border-white/15 text-white/40 hover:border-white/40 hover:text-white'}`}>{active ? <Check className="size-4"/> : <Plus className="size-4"/>}</button></div><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-caption uppercase tracking-wider text-white/30">{addon.pricingType.replace('_', ' ')}</p><p className="mt-1 font-bold text-[#C4CEFF]">{money(addon.price)}{addon.pricingType === 'per_piece' ? ' each' : ''}</p></div>{active && addon.maxQuantity > 1 ? <label className="text-right"><span className="block text-caption font-semibold uppercase text-white/30">Quantity</span><input type="number" disabled={locked || submitting} min={1} max={addon.maxQuantity} value={quantity} onChange={(event) => setAddonQuantities((current) => ({ ...current, [addon.id]: Math.min(addon.maxQuantity, Math.max(1, Number(event.target.value) || 1)) }))} className="mt-1 h-9 w-20 rounded-lg border border-white/10 bg-[#252525] px-2 text-center text-xs outline-none focus:border-[#C4CEFF]/50"/></label> : null}</div></div>})}</div><div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4"><span className="text-xs text-white/45">Add-on total</span><strong className="text-xl text-[#C4CEFF]">{money(addonTotal)}</strong></div><StepFooter back="prints" next="review" onStep={setStep} nextDisabled={addonTypeCount > 4} nextHint={addonTypeCount > 4 ? 'Remove an add-on to continue.' : 'You can continue without paid add-ons.'}/></div> : null}

    {step === 'review' ? <div className="mt-5 space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Summary label="Included edits" value={String(included.length)}/><Summary label="Extra edits" value={String(extras.length)}/><Summary label="Add-on total" value={money(addonTotal)}/></div><div className="rounded-xl border border-white/[0.08] bg-black/10 p-4"><p className="text-caption font-semibold uppercase tracking-wider text-white/35">Editing preference</p><p className="mt-2 text-xs text-[#C4CEFF]">{PREFERENCES.find((item) => item.id === editingPreference)?.label || (locked ? 'Previously saved mixed preferences' : 'Choose one editing preference above.')}</p><div className="mt-3 space-y-2">{selectedAll.map((id, index) => <div key={id} className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2 text-caption last:border-0 last:pb-0"><span className="min-w-0 truncate">{index + 1}. {galleryMap.get(id)?.fileName || id}</span><span className={extras.includes(id) ? 'shrink-0 text-amber-300' : 'shrink-0 text-[#C4CEFF]'}>{extras.includes(id) ? 'Extra · ' : ''}{!editingPreference && locked ? PREFERENCES.find((item) => item.id === initialItems.find((photo) => photo.fileId === id)?.preference)?.label : ''}</span></div>)}</div></div><div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-wider text-amber-200">Important Note</p><p className="mt-2 text-xs leading-relaxed text-white/65">Once the enhanced copies have been released, we will no longer entertain any re-edit concerns or revision requests.</p></div></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/15 p-3"><input type="checkbox" checked={acknowledged} disabled={locked} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-4 accent-[#6678FF]"/><span className="text-caption leading-relaxed text-white/65">I have reviewed my photos, editing preferences, free print allocations, and paid add-ons. I understand and acknowledge the no-revision policy above.</span></label></div>{locked ? <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-xs text-emerald-200"><CheckCircle2 className="size-4"/>Your final selection has been submitted. Duplicate submission is blocked.</div> : <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setStep('addons')} className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-3 text-caption font-semibold uppercase text-white/55 transition hover:border-white/30 hover:text-white"><ChevronLeft className="size-3.5"/>Back</button><button type="button" onClick={requestSubmission} disabled={!canSubmit || submitting} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-caption font-semibold uppercase tracking-wider text-white transition hover:-translate-y-0.5 hover:bg-[#0300a8] hover:shadow-[0_10px_28px_rgba(5,0,208,0.35)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:shadow-none"><ShoppingBag className="size-4"/>{submitting ? 'Submitting…' : 'Submit Final Selection'}</button></div>}</div> : null}
    <Sheet open={confirmationOpen} onOpenChange={(next) => { if (!submitting) { setConfirmationOpen(next); if (!next) setSubmissionPin('') } }}>
      {confirmationOpen ? <SheetContent side="bottom" initialFocus={confirmationTitle} showCloseButton={!submitting} className="client-portal max-h-[90dvh] gap-0 overflow-hidden rounded-t-card border-white/15 bg-[#171717] text-white sm:mx-auto sm:max-w-lg" overlayClassName="bg-black/70">
        <SheetHeader className="shrink-0 border-b border-white/10 p-4 pr-14">
          <SheetTitle ref={confirmationTitle} tabIndex={-1} className="font-sans text-sm font-semibold text-white outline-none">Confirm final selection</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-white/50">Review your balance before submitting.</SheetDescription>
        </SheetHeader>
        <div className="fico-portal-sheet-content min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
          <dl className="space-y-3 text-small">{[
            ['Package', money(paymentSummary.packageAmount)],
            ['Extra Edits & Add-ons', money(addonTotal)],
            ['Booking Total', money(payment.total)],
            ['Paid', money(paymentSummary.amountPaid)],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-white/[0.06] pb-3"><dt className="text-white/45">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}</dl>
          <div data-testid="submission-balance" className="flex items-center justify-between gap-4 rounded-xl border border-[#C4CEFF]/20 bg-[#C4CEFF]/5 p-4"><span className="text-sm text-white/65">Remaining balance</span><strong className="text-2xl text-[#C4CEFF]">{money(payment.remaining)}</strong></div>
          <p className="text-caption leading-relaxed text-white/45">Submitting saves your selection and add-ons. It does not collect a payment.</p>
          <label className="block"><span className="text-caption font-semibold text-[#C4CEFF]">Final submission PIN</span><span id="mobile-submission-pin-help" className="mt-1 block text-caption text-white/45">Last 4 digits of the phone number used for this booking.</span>
            <input id="mobile-submission-pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={submissionPin} disabled={submitting} aria-describedby="mobile-submission-pin-help" onChange={(event) => setSubmissionPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#252525] px-3 text-center text-lg tracking-[0.5em] text-white outline-none focus:border-[#C4CEFF]/50"/>
          </label>
          {message ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-200">{message}</p> : null}
          <div className="grid grid-cols-2 gap-3"><button type="button" disabled={submitting} onClick={() => { setConfirmationOpen(false); setSubmissionPin('') }} className="min-h-11 cursor-pointer rounded-lg border border-white/15 px-3 py-3 text-caption font-semibold text-white/65 disabled:opacity-40">Go back</button><button type="button" onClick={() => void submit()} disabled={!canSubmit || submitting} className="min-h-11 cursor-pointer rounded-lg bg-primary px-3 py-3 text-caption font-semibold text-white disabled:opacity-40">{submitting ? 'Submitting…' : 'Confirm & Submit'}</button></div>
        </div>
      </SheetContent> : null}
    </Sheet>
    {previewFile ? <PortalPhotoPreview key={previewFile.id} file={previewFile} onClose={() => setPreviewFile(null)}/> : null}
  </section>
}

function StepFooter({ back, next, onStep, nextDisabled, nextHint }: { back: Step | null; next: Step; onStep: (step: Step) => void; nextDisabled: boolean; nextHint: string }) {
  return <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-caption text-white/35">{nextHint}</p><div className="flex gap-2">{back ? <button type="button" onClick={() => onStep(back)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-4 py-2.5 text-caption font-semibold uppercase text-white/55 transition hover:border-white/30 hover:text-white"><ChevronLeft className="size-3.5"/>Back</button> : null}<button type="button" disabled={nextDisabled} onClick={() => onStep(next)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-caption font-semibold uppercase text-white transition hover:bg-[#0300a8] disabled:cursor-not-allowed disabled:opacity-35">Continue<ChevronRight className="size-3.5"/></button></div></div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-black/10 p-4"><p className="text-caption font-semibold uppercase tracking-wider text-white/30">{label}</p><p className="mt-1 text-lg font-bold text-[#C4CEFF]">{value}</p></div>
}
