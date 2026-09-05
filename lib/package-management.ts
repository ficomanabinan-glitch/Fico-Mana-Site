import type { BookingPackageCategory } from '@/lib/booking-packages'

export const PACKAGE_CATEGORIES: BookingPackageCategory[] = [
  'graduation',
  'capping-pinning',
  'self-portrait',
  'creative',
]

export const PACKAGE_SLOT_TYPES = ['standard', 'makeup'] as const

export type PackageManagerInput = {
  id: string
  category: BookingPackageCategory
  title: string
  priceAmount: number
  duration: string
  description: string
  features: string[]
  slotType: (typeof PACKAGE_SLOT_TYPES)[number]
  selectionLimit: number
  note: string
  isActive: boolean
  sortOrder: number
}

export type PackageManagerResult =
  | { ok: true; value: PackageManagerInput }
  | { ok: false; error: string }

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? '').trim().slice(0, maxLength)
}

export function formatPackagePrice(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function validatePackageManagerInput(raw: unknown): PackageManagerResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Package details are required.' }
  const input = raw as Record<string, unknown>
  const id = cleanText(input.id, 50).toLowerCase()
  const category = cleanText(input.category, 50) as BookingPackageCategory
  const title = cleanText(input.title, 200)
  const duration = cleanText(input.duration, 100)
  const description = cleanText(input.description, 2000)
  const note = cleanText(input.note, 1000)
  const slotType = cleanText(input.slotType, 20) as PackageManagerInput['slotType']
  const priceAmount = Number(input.priceAmount)
  const selectionLimit = Number(input.selectionLimit)
  const sortOrder = Number(input.sortOrder)
  const isActive = input.isActive !== false
  const features = Array.isArray(input.features)
    ? input.features.map((feature) => cleanText(feature, 300)).filter(Boolean).slice(0, 40)
    : []

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    return { ok: false, error: 'Package ID must use lowercase letters, numbers, and single hyphens only.' }
  }
  if (!PACKAGE_CATEGORIES.includes(category)) return { ok: false, error: 'Choose a valid package category.' }
  if (!title) return { ok: false, error: 'Package name is required.' }
  if (category === 'self-portrait' && !/^(?:fico|mana)(?:-|\b)/i.test(id) && !/^(?:FICO|MANA)\b/i.test(title)) {
    return { ok: false, error: 'Self Portrait packages must start with FICO or MANA so they appear in the correct website section.' }
  }
  if (!Number.isFinite(priceAmount) || priceAmount < 0 || priceAmount > 10_000_000) {
    return { ok: false, error: 'Price must be from ₱0 to ₱10,000,000.' }
  }
  if (!PACKAGE_SLOT_TYPES.includes(slotType)) return { ok: false, error: 'Choose a valid schedule type.' }
  if (!Number.isInteger(selectionLimit) || selectionLimit < 1 || selectionLimit > 200) {
    return { ok: false, error: 'Photo selection count must be a whole number from 1 to 200.' }
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    return { ok: false, error: 'Display order must be a whole number from 0 to 9999.' }
  }

  return {
    ok: true,
    value: {
      id,
      category,
      title,
      priceAmount,
      duration,
      description,
      features,
      slotType,
      selectionLimit,
      note,
      isActive,
      sortOrder,
    },
  }
}

export function packageManagerInputToRow(input: PackageManagerInput) {
  return {
    id: input.id,
    category: input.category,
    title: input.title,
    price_display: formatPackagePrice(input.priceAmount),
    price_amount: input.priceAmount,
    duration: input.duration || null,
    description: input.description || null,
    features: input.features,
    slot_type: input.slotType,
    selection_limit: input.selectionLimit,
    note: input.note || null,
    is_active: input.isActive,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  }
}
