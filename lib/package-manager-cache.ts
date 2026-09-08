import type { BookingPackageCategory } from '@/lib/booking-packages'
import { STAFF_READ_FRESH_MS } from './admin-cache-policy.ts'

export type ManagedPackage = {
  id: string
  category: BookingPackageCategory
  title: string
  price: string
  priceAmount: number
  duration?: string
  description?: string
  features: string[]
  slotType: 'makeup' | 'standard'
  selectionLimit: number
  note?: string
  isActive: boolean
  sortOrder: number
  updatedAt?: string
}

export type PackageCategoryFilter = 'all' | BookingPackageCategory

type PackageManagerUiState = {
  search: string
  category: PackageCategoryFilter
}

let packageCache: { data: ManagedPackage[]; cachedAt: number } | null = null
let packageRequest: Promise<ManagedPackage[]> | null = null
let cacheGeneration = 0
let rememberedUiState: PackageManagerUiState = { search: '', category: 'all' }

function sortPackages(packages: ManagedPackage[]) {
  return [...packages].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title),
  )
}

export function getCachedManagedPackages() {
  return packageCache?.data ?? null
}

export function isManagedPackageCacheFresh() {
  return Boolean(packageCache && Date.now() - packageCache.cachedAt < STAFF_READ_FRESH_MS)
}

export async function fetchManagedPackages({ force = false }: { force?: boolean } = {}) {
  if (!force && packageCache && isManagedPackageCacheFresh()) return packageCache.data
  if (packageRequest) return packageRequest

  const requestGeneration = cacheGeneration
  const request = fetch('/api/admin/packages', {
    cache: 'no-store',
    credentials: 'include',
  }).then(async (response) => {
    const body = (await response.json().catch(() => ({}))) as ManagedPackage[] & { error?: string }
    if (!response.ok) throw new Error(body.error || 'Could not load the package catalog.')
    const data = sortPackages(Array.isArray(body) ? body : [])
    if (requestGeneration === cacheGeneration) {
      packageCache = { data, cachedAt: Date.now() }
    }
    return requestGeneration === cacheGeneration ? data : packageCache?.data ?? data
  })
  packageRequest = request

  try {
    return await request
  } finally {
    if (packageRequest === request) packageRequest = null
  }
}

export function rememberManagedPackage(pkg: ManagedPackage) {
  cacheGeneration += 1
  packageRequest = null
  const current = packageCache?.data ?? []
  const next = current.some((item) => item.id === pkg.id)
    ? current.map((item) => (item.id === pkg.id ? pkg : item))
    : [...current, pkg]
  const data = sortPackages(next)
  packageCache = { data, cachedAt: Date.now() }
  return data
}

export function getRememberedPackageManagerUi() {
  return rememberedUiState
}

export function rememberPackageManagerUi(state: PackageManagerUiState) {
  rememberedUiState = state
}

export function clearManagedPackageCache() {
  cacheGeneration += 1
  packageCache = null
  packageRequest = null
  rememberedUiState = { search: '', category: 'all' }
}
