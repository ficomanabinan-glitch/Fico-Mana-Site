export const PORTAL_DRAFT_TTL_MS = 15 * 60 * 1000
const PREFIX = 'fico:portal-selection-draft:v2:'
const PRINT_CATEGORIES = ['TOGA_PICTURE_4R', 'ALAMPAY_BARONG_4R', 'FRAME_8R', 'WALLET_SIZE'] as const

export type PortalDraftChoices = {
  included: string[]
  extras: string[]
  editingPreference: 'standard' | 'less' | 'raw' | ''
  printSelections: Partial<Record<(typeof PRINT_CATEGORIES)[number], string>>
  walletSelections: string[]
  addonQuantities: Record<string, number>
  acknowledged: boolean
  step: 'photos' | 'prints' | 'addons' | 'review'
}
type DraftRecord = { savedAt: number; expiresAt: number; choices: PortalDraftChoices }
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function portalDraftKey(publicId: string, selectionId: string, reopenedAt: string | null | undefined, includedLimit: number) {
  return PREFIX + JSON.stringify([publicId, selectionId, reopenedAt || '', includedLimit])
}

function sessionStorageSafe(): BrowserStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

function validChoices(value: unknown): value is PortalDraftChoices {
  if (!value || typeof value !== 'object') return false
  const draft = value as PortalDraftChoices
  const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value)
  if (!Array.isArray(draft.included) || !Array.isArray(draft.extras) || draft.included.length > 5 || draft.extras.length > 200) return false
  const photos = [...draft.included, ...draft.extras]
  if (!photos.every(id) || new Set(photos).size !== photos.length) return false
  if (!['', 'standard', 'less', 'raw'].includes(draft.editingPreference) || !['photos', 'prints', 'addons', 'review'].includes(draft.step) || typeof draft.acknowledged !== 'boolean') return false
  if (!draft.printSelections || typeof draft.printSelections !== 'object' || Array.isArray(draft.printSelections)) return false
  if (!Object.entries(draft.printSelections).every(([category, value]) => PRINT_CATEGORIES.includes(category as typeof PRINT_CATEGORIES[number]) && (value === '' || id(value) && draft.included.includes(value)))) return false
  if (!Array.isArray(draft.walletSelections) || draft.walletSelections.length > 4 || new Set(draft.walletSelections).size !== draft.walletSelections.length || !draft.walletSelections.every(value => id(value) && draft.included.includes(value))) return false
  if (!draft.addonQuantities || typeof draft.addonQuantities !== 'object' || Array.isArray(draft.addonQuantities)) return false
  const addons = Object.entries(draft.addonQuantities)
  return addons.length <= 100 && addons.every(([key, quantity]) => id(key) && Number.isInteger(quantity) && quantity >= 0 && quantity <= 200)
}

export function clearPortalDraft(key: string, storage = sessionStorageSafe()) {
  try { storage?.removeItem(key) } catch { /* Browser storage is optional, never a submission dependency. */ }
}

export function readPortalDraft(key: string, storage = sessionStorageSafe(), now = Date.now()): DraftRecord | null {
  try {
    const text = storage?.getItem(key)
    if (!text) return null
    if (text.length > 32_000) { clearPortalDraft(key, storage); return null }
    const record = JSON.parse(text) as DraftRecord
    if (!record || !Number.isFinite(record.savedAt) || record.savedAt > now || record.expiresAt !== record.savedAt + PORTAL_DRAFT_TTL_MS || record.expiresAt <= now || !validChoices(record.choices)) {
      clearPortalDraft(key, storage)
      return null
    }
    // Return only allowed choice fields. Never restore prices, links, tokens, or file bytes.
    const { included, extras, editingPreference, printSelections, walletSelections, addonQuantities, acknowledged, step } = record.choices
    return { savedAt: record.savedAt, expiresAt: record.expiresAt, choices: { included, extras, editingPreference, printSelections, walletSelections, addonQuantities, acknowledged, step } }
  } catch { clearPortalDraft(key, storage); return null }
}

export function writePortalDraft(key: string, choices: PortalDraftChoices, storage = sessionStorageSafe(), now = Date.now()): number | null {
  if (!storage || !validChoices(choices)) return null
  try {
    const { included, extras, editingPreference, printSelections, walletSelections, addonQuantities, acknowledged, step } = choices
    const expiresAt = now + PORTAL_DRAFT_TTL_MS
    storage.setItem(key, JSON.stringify({ savedAt: now, expiresAt, choices: { included, extras, editingPreference, printSelections, walletSelections, addonQuantities, acknowledged, step } }))
    return expiresAt
  } catch { return null }
}
