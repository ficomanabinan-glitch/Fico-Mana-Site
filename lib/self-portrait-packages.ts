export type SelfPortraitPackage = {
  id: string
  tier: string
  title: string
  subtitle?: string
  price: string
  secondaryPrice?: string
  secondaryPriceLabel?: string
  badge?: string
  includes: string[]
  selectionLimit?: number
  note?: string
  bookVariants?: { id: string; label: string }[]
}

export const ficoPackages: SelfPortraitPackage[] = [
  { id: 'fico-1', tier: 'FICO 1', title: 'Solo or Duo Digital', price: 'Php 350', includes: ['10 mins studio shoot','Your choice of backdrop (1)','Soft copies of selected ENHANCED PHOTOS (5 photos)','NO PRINTED COPIES'], note: 'Walk-in clients are not eligible for this package.' },
  { id: 'fico-2', tier: 'FICO 2', title: 'Solo or Duo', subtitle: 'Best Seller', price: 'Php 600', badge: 'Best Seller', includes: ['15 mins studio shoot','Your choice of backdrop (1)','Soft copies of ALL ENHANCED PHOTOS','NO PRINTED COPIES'] },
  { id: 'fico-3', tier: 'FICO 3', title: 'Solo or Duo', price: 'Php 700', includes: ['15 mins studio shoot','Your choice of backdrop (1)','Soft copies of selected ENHANCED PHOTOS (10 photos)','2 4R-sized prints'] },
  { id: 'fico-4', tier: 'FICO 4', title: 'Solo or Duo', price: 'Php 1,000', includes: ['20 mins studio shoot','Your choice of backdrop (1)','Soft copies of ALL ENHANCED PHOTOS','3 4R-sized prints'] },
]

export const manaPackages: SelfPortraitPackage[] = [
  { id: 'mana-1', tier: 'MANA 1', title: 'Family / Barkada', price: 'Php 700', includes: ['3–5 pax (any age)','10 mins studio shoot','Your choice of backdrop (1)','Soft copies of selected ENHANCED PHOTOS (10 photos)','NO PRINTED COPIES'], note: 'Walk-in clients are not eligible for this package.' },
  { id: 'mana-2', tier: 'MANA 2', title: 'Family / Barkada', price: 'Php 1,200', includes: ['3–5 pax (any age)','15 mins studio shoot','Your choice of backdrop (1)','Soft copies of ALL ENHANCED PHOTOS','NO PRINTED COPIES'] },
  { id: 'mana-3', tier: 'MANA 3', title: 'Family / Barkada', price: 'Php 1,500', includes: ['3–5 pax (any age)','20 mins studio shoot','15 mins photo selection (for add-ons)','Your choice of backdrop (1)','Soft copies of selected ENHANCED PHOTOS (15 photos)','3 4R-sized prints'] },
  { id: 'mana-4', tier: 'MANA 4', title: 'Family / Barkada', price: 'Php 2,000', includes: ['3–5 pax (any age)','20 mins studio shoot','Your choice of backdrop (1)','Soft copies of ALL ENHANCED PHOTOS','4 4R-sized prints'] },
]

export const creativePackages: SelfPortraitPackage[] = [
  {
    id: 'creative-package', tier: 'CREATIVE PACKAGE', title: 'Light Effects / Curtain / Simple Studio Setup',
    price: '₱13,500', secondaryPrice: '₱15,500', secondaryPriceLabel: 'With Hair & Make Up (2 pegs)',
    includes: ['2–3 hours photoshoot',"2 layouts (client's peg & plain backdrop)",'Professional photographer','Creative direction (for poses)','Professional light setup','20 ENHANCED photos (soft copies)','ALL RAW photos (soft copies)','2 pcs printed 4R photo of choice'],
    note: '₱3,500/head for additional pax (with HMUA).',
    bookVariants: [
      { id: 'creative-package', label: 'Book — Without HMUA (₱13,500)' },
      { id: 'creative-package-makeup', label: 'Book — With HMUA (₱15,500)' },
    ],
  },
]
