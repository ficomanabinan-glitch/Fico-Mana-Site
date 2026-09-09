/** Catalog metadata is authoritative; names support catalog rows created before the migration. */
export function addonPhotoLimit(addon: { name: string; photoLimit?: number | null }): number {
  if (Number.isInteger(addon.photoLimit) && addon.photoLimit! >= 0 && addon.photoLimit! <= 4) return addon.photoLimit!
  const name = addon.name.trim().toLowerCase()
  if (name === 'extra edit') return 0
  if (name.includes('wallet')) return 4
  if (name.includes('4r') && !name.includes('frame')) return 2
  return /frame|a4/.test(name) ? 1 : 0
}

export function addonPhotoError(addon: { name: string; photoLimit?: number | null }, photoIds: string[], enhancedIds: readonly string[]): string | null {
  const limit = addonPhotoLimit(addon)
  if (new Set(photoIds).size !== photoIds.length) return `${addon.name} contains a duplicate photo.`
  if (photoIds.some(id => !enhancedIds.includes(id))) return `Choose only selected enhanced photos for ${addon.name}.`
  if (photoIds.length > limit) return `${addon.name} allows ${limit === 1 ? 'one photo' : `up to ${limit} photos`}.`
  if (limit > 0 && photoIds.length === 0) return `Choose ${limit === 1 ? 'one photo' : `at least one photo (up to ${limit})`} for ${addon.name}.`
  return null
}
