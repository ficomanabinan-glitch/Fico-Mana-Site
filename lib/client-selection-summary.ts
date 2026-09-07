export type EditingPreference = 'standard' | 'less' | 'raw'
export type AddonPreview = { total: number; lines: Array<{ id: string; name: string; quantity: number; amount: number }> }
type Addon = { id: string; name: string; price: number; pricingType: 'fixed' | 'per_photo' | 'per_piece'; maxQuantity: number }

export function initialEditingPreference(items: Array<{ preference?: EditingPreference }>): EditingPreference | '' {
  const choices = new Set(items.map(item => item.preference || 'standard'))
  return choices.size > 1 ? '' : choices.values().next().value || 'standard'
}

export function calculateClientAddons(addons: Addon[], quantities: Record<string, number>, extraCount: number): AddonPreview {
  const lines = addons.flatMap(addon => {
    const extra = addon.name.trim().toLowerCase() === 'extra edit'
    const quantity = Math.max(0, Math.trunc(extra ? extraCount : quantities[addon.id] || 0))
    if (!quantity) return []
    const units = addon.pricingType === 'fixed' ? 1 : quantity
    return [{ id: addon.id, name: addon.name, quantity, amount: Math.round(addon.price * units * 100) / 100 }]
  })
  return { lines, total: Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100 }
}

/** Booking price excludes selection add-ons in the existing data model. Never add saved and draft charges together. */
export function portalPaymentSummary(price: number, paid: number, addonAmount: number) {
  const total = Math.round((price + addonAmount) * 100) / 100
  return { total, paid, remaining: Math.max(0, Math.round((total - paid) * 100) / 100) }
}
