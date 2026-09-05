import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { listPackagesFromDb } from '@/lib/supabase-store'
import { bookingPackages, enrichBookingPackageFromCatalog, type BookingPackage } from '@/lib/booking-packages'

function codePackagesToApi(category?: string | null): BookingPackage[] {
  return category ? bookingPackages.filter((p) => p.category === category) : bookingPackages
}

/** Public — list the live, bookable package catalog without exposing database credentials. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    if (isSupabaseConfigured()) {
      const admin = getSupabaseAdmin()
      if (!admin) {
        return NextResponse.json({ error: 'Package catalog is temporarily unavailable.' }, { status: 503 })
      }
      const rows = await listPackagesFromDb(admin, category || undefined)

      if (rows !== null) {
        const bookable: BookingPackage[] = rows.map((p) =>
          enrichBookingPackageFromCatalog({
            id: p.id,
            category: p.category as BookingPackage['category'],
            title: p.title,
            price: p.price,
            duration: p.duration || 'Studio session',
            description: p.description || '',
            features: p.features,
            slotType: p.slotType === 'makeup' ? 'makeup' : 'standard',
            selectionLimit: p.selectionLimit,
            priceAmount: p.priceAmount,
            secondaryPrice: p.secondaryPrice,
            secondaryPriceAmount: p.secondaryPriceAmount,
            secondaryPriceLabel: p.secondaryPriceLabel,
            bookVariants: p.bookVariants,
            isActive: p.isActive,
            sortOrder: p.sortOrder,
            note: p.note,
          }),
        )
        return NextResponse.json(bookable, { headers: { 'Cache-Control': 'public, no-store, max-age=0' } })
      }

      return NextResponse.json({ error: 'Package catalog is temporarily unavailable.' }, { status: 503 })
    }

    return NextResponse.json(codePackagesToApi(category), { headers: { 'Cache-Control': 'public, no-store, max-age=0' } })
  } catch (error) {
    console.error('GET /api/packages', error)
    return NextResponse.json({ error: 'Failed to load packages' }, { status: 500 })
  }
}
