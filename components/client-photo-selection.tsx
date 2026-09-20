'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Lock } from 'lucide-react'

import { PortalPhotoPreview } from '@/components/portal-photo-preview'
import { availableSelectionStep, canVisitSelectionStep } from '@/lib/selection-step-navigation'
import { calculateClientAddons, initialEditingPreference, portalPaymentSummary, type AddonPreview } from '@/lib/client-selection-summary'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import PortalPhotoContactSheet from '@/components/portal-photo-contact-sheet'
import PortalPrintPicker from '@/components/portal-print-picker'
import PortalAddonPicker from '@/components/portal-addon-picker'
import PortalReview from '@/components/portal-review'
import { useAdminToast } from '@/components/admin-toast-provider'
import { addonPhotoError } from '@/lib/addon-photo-rules'
import styles from '@/components/portal-workspace.module.css'
import { clearPortalDraft, portalDraftKey, readPortalDraftState, writePortalDraft, type PortalDraftChoices } from '@/lib/portal-selection-draft'

export type ClientGalleryFile = { id: string; fileName: string; mimeType: string; previewUrl: string }
export type ClientAddon = { id: string; name: string; description: string; price: number; pricingType: 'fixed' | 'per_photo' | 'per_piece'; maxQuantity: number; photoLimit?: number }
export type ClientSelection = {
  id: string
  status: 'OPEN' | 'SUBMITTED' | 'SUBMITTING' | 'COPY_FAILED'
  requiredCount: number
  includedLimit: number
  clientStatus: string
  noRevisionAcknowledged: boolean
  submittedAt?: string | null
  reopenedAt?: string | null
  rawUploadGeneration?: number
  selectedIds: string[]
  selectedItems: Array<{ fileId: string; preference: 'standard' | 'less' | 'raw'; extraEdit: boolean }>
  printAllocations: Array<{ category: PrintCategory; fileId: string; quantity: number; label: string }>
  addonOrders: Array<{ addonId: string | null; name: string; quantity: number; photoCount: number; photoIds?: string[]; total: number }>
  totalAddonAmount: number
}

export type ClientSelectionProgress = {
  step: Step
  selectedCount: number
  includedLimit: number
  editingPreference: string
  locked: boolean
  submittedAt?: string | null
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
  { id: 'standard', label: 'Standard Softness / Enhancement', note: 'FICO MANA’s standard enhancement style.' },
  { id: 'less', label: 'Less Softness / Enhancement', note: 'A lighter enhancement with less softness than the standard style.' },
  { id: 'raw', label: 'RAW', note: 'Unedited photographs as they come from the camera.' },
]
const PRINTS: Array<{ category: PrintCategory; label: string; quantity: number }> = [
  { category: 'TOGA_PICTURE_4R', label: 'TOGA PICTURE — 4R Size Printed / FREE', quantity: 1 },
  { category: 'ALAMPAY_BARONG_4R', label: 'ALAMPAY / BARONG — 4R Size Printed / FREE', quantity: 1 },
  { category: 'FRAME_8R', label: 'FRAME — 8R Size Printed / FREE', quantity: 1 },
  { category: 'WALLET_SIZE', label: 'WALLET SIZE — 4 Copies / FREE', quantity: 4 },
]
const PHOTO_TIP_DURATION_MS = 8_000

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
  projectStatus,
  paymentSummary,
  sampleMode = false,
  onLoadMore,
  onSubmitted,
  onPricingChange,
  onProgressChange,
  headerContent,
  notices,
  footerContent,
}: {
  publicId: string
  selection: ClientSelection | null
  gallery: ClientGalleryFile[]
  galleryTotal: number
  loadingMore: boolean
  addons: ClientAddon[]
  projectStatus?: string
  paymentSummary: { packageAmount: number; amountPaid: number }
  sampleMode?: boolean
  onLoadMore: () => void
  onSubmitted: () => Promise<void>
  onPricingChange?: (summary: AddonPreview) => void
  onProgressChange?: (progress: ClientSelectionProgress) => void
  headerContent?: ReactNode
  notices?: ReactNode
  footerContent?: ReactNode
}) {
  const toast = useAdminToast()
  const locked = selection?.status === 'SUBMITTED' || selection?.status === 'SUBMITTING'
  const includedLimit = Math.min(5, Math.max(0, selection?.includedLimit || 5))
  const initialItems = selection?.selectedItems || []
  const [step, updateStep] = useState<Step>(locked ? 'review' : 'photos')
  const [included, setIncluded] = useState<string[]>(() => initialItems.filter((item) => !item.extraEdit).map((item) => item.fileId))
  const [extras, setExtras] = useState<string[]>(() => initialItems.filter((item) => item.extraEdit).map((item) => item.fileId))
  const [editingPreference, setEditingPreference] = useState<Preference | ''>(() => initialEditingPreference(initialItems))
  const [previewFile, setPreviewFile] = useState<ClientGalleryFile | null>(null)
  const [showPhotoTip, setShowPhotoTip] = useState(true)
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'selected'>('all')
  const [activeFileId, setActiveFileId] = useState<string>(() => initialItems[0]?.fileId || gallery[0]?.id || '')
  const [printSelections, setPrintSelections] = useState<Partial<Record<PrintCategory, string>>>(() => Object.fromEntries((selection?.printAllocations || []).filter(item => item.category !== 'WALLET_SIZE').map((item) => [item.category, item.fileId])))
  const [walletSelections, setWalletSelections] = useState<string[]>(() => [...new Set((selection?.printAllocations || []).filter(item => item.category === 'WALLET_SIZE').map(item => item.fileId))])

  useEffect(() => {
    if (!showPhotoTip) return
    const timeout = setTimeout(() => setShowPhotoTip(false), PHOTO_TIP_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [showPhotoTip])
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>(() => Object.fromEntries((selection?.addonOrders || []).filter((item) => item.addonId && item.name.toLowerCase() !== 'extra edit').map((item) => [String(item.addonId), item.quantity])))
  const [addonPhotos, setAddonPhotos] = useState<Record<string, string[]>>(() => Object.fromEntries((selection?.addonOrders || []).filter(item => item.addonId).map(item => [String(item.addonId), item.photoIds || []])))
  const [acknowledged, setAcknowledged] = useState(Boolean(selection?.noRevisionAcknowledged))
  const [submitting, setSubmitting] = useState(false)
  // PINs are transient: never put them in the 15-minute draft or a URL.
  const [submissionPin, setSubmissionPin] = useState('')
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const workspaceRoot = useRef<HTMLElement>(null)
  const workspaceHeader = useRef<HTMLElement>(null)
  useEffect(() => {
    const header = workspaceHeader.current
    const root = workspaceRoot.current
    if (!header || !root) return
    const measure = () => root.style.setProperty('--portal-header-height', `${header.getBoundingClientRect().height}px`)
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    measure()
    return () => observer.disconnect()
  }, [])
  const confirmationTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { setSubmissionPin('') }, [publicId, step, locked])
  const [message, setMessage] = useState('')
  const [hydratedDraftKey, setHydratedDraftKey] = useState('')
  const [draftExpiresAt, setDraftExpiresAt] = useState<number | null>(null)
  const [draftStatus, setDraftStatus] = useState<'saved' | 'empty' | 'expired' | 'unavailable'>('empty')
  const [draftFinished, setDraftFinished] = useState(false)
  const lastSavedDraft = useRef('')
  const draftKey = portalDraftKey(publicId, selection?.id || '', selection?.reopenedAt, includedLimit)
  const draft = useMemo<PortalDraftChoices>(() => ({ included, extras, editingPreference, printSelections, walletSelections, addonQuantities, addonPhotos, acknowledged, step }),
    [included, extras, editingPreference, printSelections, walletSelections, addonQuantities, addonPhotos, acknowledged, step])

  useEffect(() => {
    if (!selection?.id) return
    if (locked) clearPortalDraft(draftKey)
    const hydrationKey = locked ? `${draftKey}:locked` : draftKey
    if (hydratedDraftKey === hydrationKey) return
    const restored = locked ? null : readPortalDraftState(draftKey)
    const saved = restored?.record
    setDraftStatus(restored?.status || 'empty')
    const choices: PortalDraftChoices = saved?.choices || {
      included: selection.selectedItems.filter(item => !item.extraEdit).map(item => item.fileId),
      extras: selection.selectedItems.filter(item => item.extraEdit).map(item => item.fileId),
      editingPreference: initialEditingPreference(selection.selectedItems),
      printSelections: Object.fromEntries(selection.printAllocations.filter(item => item.category !== 'WALLET_SIZE').map(item => [item.category, item.fileId])),
      walletSelections: [...new Set(selection.printAllocations.filter(item => item.category === 'WALLET_SIZE').map(item => item.fileId))],
      addonQuantities: Object.fromEntries(selection.addonOrders.filter(item => item.addonId && item.name.toLowerCase() !== 'extra edit').map(item => [String(item.addonId), item.quantity])),
      addonPhotos: Object.fromEntries(selection.addonOrders.filter(item => item.addonId).map(item => [String(item.addonId), item.photoIds || []])),
      acknowledged: selection.noRevisionAcknowledged,
      step: locked ? 'review' : 'photos',
    }
    lastSavedDraft.current = JSON.stringify(choices)
    setIncluded(choices.included)
    setExtras(choices.extras)
    setEditingPreference(choices.editingPreference)
    setPrintSelections(choices.printSelections)
    setWalletSelections(choices.walletSelections)
    setAddonQuantities(choices.addonQuantities)
    setAddonPhotos(choices.addonPhotos || {})
    setAcknowledged(choices.acknowledged)
    updateStep(locked ? choices.step : availableSelectionStep(choices.step,
      choices.included.length === includedLimit && Boolean(choices.editingPreference),
      PRINTS.filter(item => item.category !== 'WALLET_SIZE').every(item => choices.included.includes(choices.printSelections[item.category] || '')) && choices.walletSelections.length >= 1 && choices.walletSelections.length <= 4 && choices.walletSelections.every(id => choices.included.includes(id)),
      Object.values(choices.addonQuantities).filter(quantity => quantity > 0).length + (choices.extras.length > 0 ? 1 : 0) <= 4))
    setDraftExpiresAt(saved?.expiresAt || null)
    setDraftFinished(false)
    setHydratedDraftKey(hydrationKey)
  }, [selection, locked, draftKey, hydratedDraftKey, includedLimit])

  useEffect(() => {
    if (!selection?.id || locked || draftFinished || hydratedDraftKey !== draftKey) return
    const fingerprint = JSON.stringify(draft)
    if (lastSavedDraft.current === fingerprint) return
    // Refreshing, loading more photos and price refetches do not extend the 15-minute timer.
    const expiresAt = writePortalDraft(draftKey, draft)
    setDraftExpiresAt(expiresAt)
    setDraftStatus(expiresAt ? 'saved' : 'unavailable')
    lastSavedDraft.current = fingerprint
  }, [selection?.id, locked, draftFinished, hydratedDraftKey, draftKey, draft])

  useEffect(() => {
    if (!draftExpiresAt) return
    const timer = setTimeout(() => { clearPortalDraft(draftKey); setDraftStatus('expired') }, Math.max(0, draftExpiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [draftKey, draftExpiresAt])

  const galleryMap = useMemo(() => new Map(gallery.map((file) => [file.id, file])), [gallery])
  const extraEditAddon = addons.find((addon) => addon.name.trim().toLowerCase() === 'extra edit')
  const optionalAddons = addons.filter((addon) => addon.id !== extraEditAddon?.id)
  const chosenAddonIds = Object.entries(addonQuantities).filter(([, quantity]) => quantity > 0).map(([id]) => id)
  const addonTypeCount = chosenAddonIds.length + (extras.length > 0 ? 1 : 0)
  const photosComplete = included.length === includedLimit && Boolean(editingPreference)
  const printsComplete = PRINTS.filter(item => item.category !== 'WALLET_SIZE').every((item) => included.includes(printSelections[item.category] || '')) && walletSelections.length >= 1 && walletSelections.length <= 4 && walletSelections.every(id => included.includes(id))
  const addonsComplete = addonTypeCount <= 4 && chosenAddonIds.every(id => {
    const addon = addons.find(item => item.id === id)
    return Boolean(addon && !addonPhotoError(addon, addonPhotos[id] || [], [...included, ...extras]))
  })
  const canVisitStep = (target: Step) => canVisitSelectionStep(step, target, photosComplete, printsComplete, addonsComplete, locked)
  const setStep = (target: Step) => {
    if (canVisitStep(target)) {
      updateStep(target)
      setMessage('')
      workspaceRoot.current?.scrollIntoView({ block: 'start' })
    }
  }
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
  useEffect(() => {
    onProgressChange?.({
      step,
      selectedCount: included.length,
      includedLimit,
      editingPreference: PREFERENCES.find(item => item.id === editingPreference)?.label || '',
      locked,
      submittedAt: selection?.submittedAt,
    })
  }, [step, included.length, includedLimit, editingPreference, locked, selection?.submittedAt, onProgressChange])
  const canSubmit = !locked && !draftFinished && Boolean(editingPreference) && included.length === includedLimit && printsComplete && acknowledged && addonsComplete
  const selectedPhoto = (id: string): ClientGalleryFile => galleryMap.get(id) || {
    id, fileName: 'Selected photo', mimeType: 'image/jpeg',
    previewUrl: `/api/editor-workflow/portal/${encodeURIComponent(publicId)}/file/${encodeURIComponent(id)}?kind=gallery`,
  }
  // Selected files outside the loaded page still use the ownership-checked image endpoint.
  const selectedFiles = selectedAll.map(selectedPhoto)
  const visibleFiles = galleryFilter === 'selected' ? selectedFiles : gallery
  const activeFile = visibleFiles.find(file => file.id === activeFileId) || visibleFiles[0] || null
  const previewFiles = step === 'review' ? selectedFiles : visibleFiles
  const saveDraftNow = () => {
    const expiresAt = writePortalDraft(draftKey, draft)
    setDraftExpiresAt(expiresAt)
    setDraftStatus(expiresAt ? 'saved' : 'unavailable')
  }
  useEffect(() => {
    if (!gallery.length) return
    if (!activeFileId || !galleryMap.has(activeFileId)) setActiveFileId(included[0] || gallery[0].id)
  }, [gallery, galleryMap, activeFileId, included])

  const togglePhoto = (fileId: string) => {
    if (locked || submitting || draftFinished) return
    setMessage('')
    if (included.includes(fileId) || extras.includes(fileId)) {
      setAddonPhotos(current => Object.fromEntries(Object.entries(current).map(([id, photos]) => [id, photos.filter(photo => photo !== fileId)])))
    }
    if (included.includes(fileId)) {
      // Keep ordered selection: the earliest extra fills a vacated included slot.
      setIncluded([...included.filter(id => id !== fileId), ...extras.slice(0, 1)])
      setExtras(extras.slice(1))
      setPrintSelections((current) => Object.fromEntries(Object.entries(current).filter(([, id]) => id !== fileId)))
      setWalletSelections(current => current.filter(id => id !== fileId))
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
    const extraLimit = Math.min(200, extraEditAddon.maxQuantity)
    if (extras.length >= extraLimit) {
      setMessage(`You may choose up to ${extraLimit} extra enhanced photos. Remove one before adding another.`)
      return
    }
    setExtras((current) => [...current, fileId])
    toast.success('Added as an extra photo', `${money(extraEditAddon.price)} added to your booking total.`)
  }

  const toggleAddon = (addon: ClientAddon) => {
    if (locked || submitting || draftFinished) return false
    const active = Boolean(addonQuantities[addon.id])
    if (!active && addonTypeCount >= 4) {
      setMessage('You may select up to four different add-on types, including Extra Edit.')
      return false
    }
    setMessage('')
    setAddonQuantities((current) => ({ ...current, [addon.id]: active ? 0 : 1 }))
    return true
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
      const requestedAddons = chosenAddonIds.map((id) => ({ addonId: id, quantity: addonQuantities[id], photoCount: 0, photoIds: addonPhotos[id] || [] }))
      if (extras.length && extraEditAddon) requestedAddons.push({ addonId: extraEditAddon.id, quantity: extras.length, photoCount: extras.length, photoIds: [] })
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
          printAllocations: [
            ...PRINTS.filter(item => item.category !== 'WALLET_SIZE').map((item) => ({ category: item.category, fileId: printSelections[item.category], quantity: item.quantity })),
            ...walletSelections.map(fileId => ({ category: 'WALLET_SIZE' as const, fileId, quantity: 1 })),
          ],
          addons: requestedAddons,
          acknowledgeNoRevision: acknowledged,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
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
      toast.success('Selection submitted', 'Your photographs and print choices are now with FICO MANA.')
      updateStep('review')
      await onSubmitted()
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
    if (sampleMode) {
      clearPortalDraft(draftKey)
      setDraftFinished(true)
      updateStep('review')
      toast.success('Sample complete', 'You finished the same selection flow clients use. No booking was changed.')
      return
    }
    setSubmissionPin('')
    setConfirmationOpen(true)
  }

  const nextStep: Step | null = step === 'photos' ? 'prints' : step === 'prints' ? 'addons' : step === 'addons' ? 'review' : null
  const nextDisabled = step === 'photos' ? !photosComplete : step === 'prints' ? !printsComplete : step === 'addons' ? !addonsComplete : !canSubmit
  const continueWorkflow = () => {
    if (nextDisabled) return
    if (nextStep) setStep(nextStep)
    else requestSubmission()
  }

  if (!selection) return <section className={styles.portal}><header className={styles.topbar}><div className={styles.shell}>{headerContent}</div></header><div className={styles.shell}>{notices}<p className={styles.empty}>Photo selection is still being prepared for this booking.</p>{footerContent}</div></section>

  const selectionNavigation = <nav className={styles.navigation} aria-label="Selection workflow">{STEPS.map((item) => <button key={item.id} type="button" className={styles.step} disabled={!canVisitStep(item.id)} onClick={() => setStep(item.id)} aria-current={step === item.id ? 'step' : undefined}><span>{item.label}</span></button>)}</nav>

  return <section ref={workspaceRoot} className={styles.portal}>
    <header ref={workspaceHeader} className={styles.topbar}><div className={styles.shell}>{headerContent}{selectionNavigation}</div></header>
    <div className={`${styles.shell} ${styles.main}`}>
      {notices}
      {draftStatus === 'saved' && draftExpiresAt ? <span className="sr-only" role="status">Draft saved in this tab until {new Date(draftExpiresAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}.</span> : null}
      {!locked && !draftFinished && (draftStatus === 'expired' || draftStatus === 'unavailable') ? <details className={styles.draftNotice} open>
        <summary>{draftStatus === 'expired' ? 'Draft expired' : 'Draft not saved'}</summary>
        <p role="status">{draftStatus === 'expired' ? 'Your saved draft expired. Any choices still shown on this page can be saved again before you refresh.' : 'This browser could not save your draft. Keep this page open until you submit.'}</p>
        {draftStatus === 'expired' || draftStatus === 'unavailable' ? <button type="button" className={styles.secondary} disabled={submitting} onClick={saveDraftNow}>Save draft again</button> : null}
      </details> : null}
      {locked ? <div className={styles.submittedNotice} role="status">
        <span className={styles.submittedNoticeIcon} aria-hidden="true"><Lock /></span>
        <p className={styles.submittedNoticeContent}>
          <strong>Your selection is submitted and locked.</strong>
          {selection.submittedAt ? <span>Submitted {new Date(selection.submittedAt).toLocaleString('en-PH')}.</span> : null}
          <span>Project status: {projectStatus || selection.clientStatus}.</span>
        </p>
      </div> : null}
    {selection.status === 'COPY_FAILED' ? <div className="mt-4 rounded-control border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">Your previous submission could not be completed. Try: review your choices and submit again. If a photo is unavailable, ask the studio to restore the original first.</div> : null}
    {message ? <div role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs text-red-200"><AlertTriangle className="mt-0.5 size-3.5 shrink-0"/>{message}</div> : null}


      {!locked && selection.reopenedAt ? <div className={styles.notice} role="status">Your portal has been reopened. Review your choices and submit your selection again.</div> : null}
      {step === 'photos' ? <>
        <div className={styles.photoHeading}><div><h1>Your photos</h1><p className={styles.description}>Pick {includedLimit} favorites.{extraEditAddon ? ` Extra enhancements cost ${money(extraEditAddon.price)} per photo.` : ''}</p></div>
          <div className={styles.editingMenu}><label htmlFor="portal-editing-preference" className={styles.label}>Editing preference</label><select id="portal-editing-preference" aria-describedby="portal-preference-help" className={styles.select} value={editingPreference} disabled={locked || submitting || draftFinished} onChange={event => setEditingPreference(event.target.value as Preference)}>{!editingPreference ? <option value="">{locked ? 'Previously saved mixed preferences' : 'Choose one editing preference…'}</option> : null}{PREFERENCES.map(preference => <option key={preference.id} value={preference.id}>{preference.label}</option>)}</select><p id="portal-preference-help" className={styles.preferenceHelp}>{PREFERENCES.find(preference => preference.id === editingPreference)?.note || 'Choose your preferred editing style.'}{editingPreference === 'standard' ? <> <a href="https://www.facebook.com/stories/998067669519381/?source=profile_highlight" target="_blank" rel="noopener noreferrer" aria-label="See the approved samples on Facebook (opens in a new tab)">See the approved samples</a>.</> : null}</p></div>
        </div>
        <PortalPhotoContactSheet gallery={gallery} galleryTotal={galleryTotal} selectedFiles={selectedFiles} filter={galleryFilter} onFilter={setGalleryFilter} included={included} extras={extras} includedLimit={includedLimit} extraPrice={extraEditAddon?.price || 0} activeFile={activeFile} locked={locked || submitting || draftFinished} photosComplete={photosComplete} loadingMore={loadingMore} showPhotoTip={showPhotoTip} onDismissPhotoTip={() => setShowPhotoTip(false)} onFocus={setActiveFileId} onToggle={togglePhoto} onPreview={setPreviewFile} onLoadMore={onLoadMore} onContinue={continueWorkflow} />
      </> : null}
      {step === 'prints' ? <PortalPrintPicker files={included.map(selectedPhoto)} printSelections={printSelections} walletSelections={walletSelections} locked={locked || submitting || draftFinished} complete={printsComplete} onPrint={(category, id) => setPrintSelections(current => ({ ...current, [category]: id }))} onWallet={setWalletSelections} onWarning={setMessage} onBack={() => setStep('photos')} onContinue={() => setStep('addons')} /> : null}

      {step === 'addons' ? <PortalAddonPicker addons={optionalAddons} files={selectedAll.map(selectedPhoto)} quantities={addonQuantities} assignments={addonPhotos} locked={locked || submitting || draftFinished} typeCount={addonTypeCount} extraCount={extras.length} extraPrice={extraEditAddon?.price || 0} total={addonTotal} complete={addonsComplete} onToggle={toggleAddon} onQuantity={(id, quantity) => setAddonQuantities(current => ({ ...current, [id]: quantity }))} onPhotos={(id, photos) => setAddonPhotos(current => ({ ...current, [id]: photos }))} onWarning={setMessage} onBack={() => setStep('prints')} onContinue={() => setStep('review')} /> : null}

      {step === 'review' ? <PortalReview included={included} extras={extras} preference={PREFERENCES.find(item => item.id === editingPreference)?.label || 'Previously saved mixed preferences'} printSelections={printSelections} walletSelections={walletSelections} orders={pricing.lines.map(order => ({ ...order, photoIds: addonPhotos[order.id] || [] }))} selectedPhoto={selectedPhoto} packageAmount={paymentSummary.packageAmount} amountPaid={paymentSummary.amountPaid} total={payment.total} remaining={payment.remaining} acknowledged={acknowledged} locked={locked || draftFinished} submitting={submitting} canSubmit={canSubmit} sampleMode={sampleMode} onAcknowledge={setAcknowledged} onBack={() => setStep('addons')} onSubmit={requestSubmission} onPreview={setPreviewFile} onEdit={setStep} /> : null}
      {footerContent}
    </div>
    <Sheet open={confirmationOpen} onOpenChange={(next) => { if (!submitting) { setConfirmationOpen(next); if (!next) setSubmissionPin('') } }}>
      {confirmationOpen ? <SheetContent side="bottom" initialFocus={confirmationTitle} showCloseButton={!submitting} className="client-portal max-h-[90dvh] gap-0 overflow-hidden rounded-t-[20px] border-white/[0.12] bg-[#181819] text-white shadow-[inset_0_1px_rgba(255,255,255,0.06),0_-24px_80px_rgba(0,0,0,0.24)] sm:mx-auto sm:max-w-lg" overlayClassName="bg-black/70">
        <SheetHeader className="shrink-0 border-b border-white/[0.08] p-5 pr-14">
          <SheetTitle ref={confirmationTitle} tabIndex={-1} className="font-sans text-sm font-semibold text-white outline-none">Confirm final selection</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-white/50">Review your balance before submitting.</SheetDescription>
        </SheetHeader>
        <div className="fico-portal-sheet-content min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
          <dl className="space-y-3 text-small">{[
            ['Package', money(paymentSummary.packageAmount)],
            ['Extra photos and add-ons', money(addonTotal)],
            ['Booking Total', money(payment.total)],
            ['Paid', money(paymentSummary.amountPaid)],
          ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-white/[0.06] pb-3"><dt className="text-white/45">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}</dl>
          <div data-testid="submission-balance" className="flex items-center justify-between gap-4 rounded-card border border-[#C4CEFF]/20 bg-[#C4CEFF]/5 p-4 shadow-[inset_0_1px_rgba(255,255,255,0.04)]"><span className="text-sm text-white/65">Remaining balance</span><strong className="text-2xl tracking-[-0.03em] text-[#C4CEFF]">{money(payment.remaining)}</strong></div>
          <label className="block"><span className="text-caption font-semibold text-white/80">Final submission PIN</span><span id="mobile-submission-pin-help" className="mt-1 block text-caption text-white/45">Last 4 digits of the phone number used for this booking.</span>
            <input id="mobile-submission-pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={submissionPin} disabled={submitting} aria-describedby="mobile-submission-pin-help" onChange={(event) => setSubmissionPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className="mt-2 h-11 w-full rounded-control border border-white/10 bg-[#242427] px-3 text-center text-lg tracking-[0.5em] text-white outline-none shadow-[inset_0_1px_rgba(255,255,255,0.04)] transition-[border-color,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 focus:border-[#C4CEFF]/50"/>
          </label>
          {message ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-200">{message}</p> : null}
          <div className="grid grid-cols-2 gap-3"><button type="button" disabled={submitting} onClick={() => { setConfirmationOpen(false); setSubmissionPin('') }} className="min-h-11 cursor-pointer rounded-control border border-white/10 bg-white/[0.02] px-3 py-3 text-caption font-semibold text-white/70 transition-[transform,background-color,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] active:translate-y-0 active:scale-[0.98] disabled:opacity-40">Go back</button><button type="button" onClick={() => void submit()} disabled={!canSubmit || submitting} className="min-h-11 cursor-pointer rounded-control bg-primary px-3 py-3 text-caption font-semibold text-white shadow-[inset_0_1px_rgba(255,255,255,0.16)] transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-[#0903e8] active:translate-y-0 active:scale-[0.98] disabled:opacity-40">{submitting ? 'Submitting…' : 'Confirm & Submit'}</button></div>
        </div>
      </SheetContent> : null}
    </Sheet>

    {previewFile ? <PortalPhotoPreview key={previewFile.id} file={previewFile} files={previewFiles} onFileChange={setPreviewFile} onClose={() => setPreviewFile(null)}
      selected={selectedAll.includes(previewFile.id)} locked={locked || submitting || draftFinished}
      onToggleSelection={step === 'photos' ? () => {
        if (galleryFilter === 'selected' && selectedAll.includes(previewFile.id)) {
          const index = previewFiles.findIndex(file => file.id === previewFile.id)
          setPreviewFile(previewFiles[index + 1] || previewFiles[index - 1] || null)
        }
        togglePhoto(previewFile.id)
      } : undefined}
      selectionLabel={selectedAll.includes(previewFile.id) ? 'Deselect Photo' : included.length >= includedLimit && extraEditAddon ? `Add for ${money(extraEditAddon.price)}` : 'Select Photo'}
      selectionDescription={extras.includes(previewFile.id) ? `Extra enhanced photo, ${money(extraEditAddon?.price || 0)}` : included.includes(previewFile.id) ? 'Included photo' : 'Not selected'} /> : null}
  </section>
}
