import { ficoPackages, manaPackages, creativePackages } from '@/lib/self-portrait-packages'

export type BookingPackageCategory = 'graduation' | 'capping-pinning' | 'self-portrait' | 'creative'

export type BookingPackage = {
  id: string
  category: BookingPackageCategory
  title: string
  price: string
  duration: string
  description: string
  features: string[]
  slotType: 'makeup' | 'standard'
  badge?: string
  note?: string
  heroImage?: string
}

const WALK_IN_INELIGIBLE = /walk-in clients are not eligible/i

export function isWalkInEligiblePackage(pkg: Pick<BookingPackage, 'description' | 'note'>): boolean {
  return !WALK_IN_INELIGIBLE.test(pkg.description) && !WALK_IN_INELIGIBLE.test(pkg.note ?? '')
}

export const BOOKING_PACKAGE_CATEGORY_LABELS: Record<BookingPackageCategory, string> = {
  graduation: 'Graduation',
  'capping-pinning': 'Capping & Pinning',
  'self-portrait': 'Self Portrait',
  creative: 'Creative',
}

function durationFromIncludes(includes: string[]): string {
  const timed = includes.filter((item) => /mins/i.test(item))
  return timed.length > 0 ? timed.join(' · ') : 'Studio session'
}

const graduationPackages: BookingPackage[] = [
  {
    id: 'fico-package',
    category: 'graduation',
    title: 'FICO PACKAGE',
    price: '₱3,500',
    duration: '30 mins',
    description: 'Available anytime from 8:00 AM – 4:00 PM',
    features: [
      'Free use of Toga & Cap',
      'Free use of Alampay',
      'Professional Photographer',
      '5 Edited/Enhanced Copies',
      'Professional Light Setup',
      '2 pegs (toga, uniform, or alampay)',
      '2 pcs. 4R-sized Prints',
      '4 pcs. Wallet-sized Prints',
      '1 pc. 8R Glass-to-Glass Frame',
      'Get ALL RAW Copies',
      'Receive 5 enhanced photos 14 days after selection',
    ],
    slotType: 'standard',
  },
  {
    id: 'mana-makeup',
    category: 'graduation',
    title: 'MANA PACKAGE',
    price: '₱6,500',
    duration: '2 hours',
    description: 'With Hair and Makeup.',
    features: [
      'Free use of Toga & Cap',
      'Free use of Alampay',
      'Professional Photographer',
      '5 Edited/Enhanced Copies',
      'Professional Light Setup',
      '2 pegs (toga, uniform, or alampay)',
      '2 pcs. 4R-sized Prints',
      '4 pcs. Wallet-sized Prints',
      '1 pc. 8R Glass-to-Glass Frame',
      'Get ALL RAW Copies',
      'Receive 5 enhanced photos 14 days after selection',
    ],
    slotType: 'makeup',
  },
  {
    id: 'capping-pinning',
    category: 'capping-pinning',
    title: 'CAPPING AND PINNING PHOTOSHOOT',
    price: '₱4,000',
    duration: 'Studio session',
    description: 'Other service · 10 slots only per day · ₱500 deposit required',
    features: [
      'Free Makeup',
      '2 edited/enhanced photos',
      '1 layout/outfit',
      'All raw copies',
      '1 pc. 8R Glass-to-Glass Frame',
      '2 pcs. 4R-sized printed copies',
      '7–14 working days for editing process',
    ],
    slotType: 'makeup',
    heroImage: '/capping_bg.jpg',
  },
]

const creativeBookingPackages: BookingPackage[] = creativePackages.flatMap((pkg) => [
  {
    id: 'creative-package',
    category: 'creative' as const,
    title: 'CREATIVE PACKAGE',
    price: '₱13,500',
    duration: '2–3 hours photoshoot',
    description: pkg.title,
    features: pkg.includes,
    slotType: 'makeup' as const,
  },
  {
    id: 'creative-package-makeup',
    category: 'creative' as const,
    title: 'CREATIVE PACKAGE (With Hair & Makeup)',
    price: '₱15,500',
    duration: '2–3 hours photoshoot (includes HMUA for 2 pegs)',
    description: pkg.title,
    features: [...pkg.includes, 'Hair & makeup for 2 pegs'],
    slotType: 'makeup' as const,
  },
])

const selfPortraitPackages: BookingPackage[] = [...ficoPackages, ...manaPackages].map((pkg) => ({
  id: pkg.id,
  category: 'self-portrait' as const,
  title: `${pkg.tier} — ${pkg.title}`,
  price: pkg.price,
  duration: durationFromIncludes(pkg.includes),
  description: pkg.note ?? pkg.title,
  features: pkg.includes,
  slotType: pkg.id === 'fico-4' || /hair and makeup/i.test(pkg.title) ? ('makeup' as const) : ('standard' as const),
  badge: pkg.badge,
  note: pkg.note,
}))

export const bookingPackages: BookingPackage[] = [...graduationPackages, ...selfPortraitPackages.filter((p) => p.category !== 'creative'), ...creativeBookingPackages]

export function getBookingPackage(id: string): BookingPackage | undefined {
  return bookingPackages.find((pkg) => pkg.id === id)
}

/** Merge UI-only fields from the code catalog when packages are loaded from Supabase. */
export function enrichBookingPackageFromCatalog(pkg: BookingPackage): BookingPackage {
  const catalog = getBookingPackage(pkg.id)
  if (!catalog) return pkg
  return {
    ...pkg,
    description: pkg.description || catalog.description,
    heroImage: catalog.heroImage,
    badge: catalog.badge ?? pkg.badge,
    note: pkg.note ?? catalog.note,
  }
}

export function getBookingUrl(packageId: string): string {
  return `/?package=${encodeURIComponent(packageId)}#booking`
}

export function parsePackagePrice(price: string): number {
  return parseFloat(price.replace(/[^0-9.]/g, '')) || 0
}

export function usesMakeupSlots(packageId: string): boolean {
  // Keep explicit fico-4 rule for older booking rows if package metadata is missing.
  if (packageId === 'fico-4') return true
  return getBookingPackage(packageId)?.slotType === 'makeup'
}

/** FICO / MANA self-portrait packages: no online deposit — pay in full at the studio. */
export function packageRequiresDeposit(packageId: string): boolean {
  const pkg = getBookingPackage(packageId)
  if (!pkg) return true
  return pkg.category !== 'self-portrait'
}
