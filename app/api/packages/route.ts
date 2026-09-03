import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { listPackagesFromDb, syncPackagesToDb } from '@/lib/supabase-store'
import { bookingPackages, enrichBookingPackageFromCatalog, type BookingPackage } from '@/lib/booking-packages'

function codePackagesToApi(category?: string | null): BookingPackage[] {
  return category ? bookingPackages.filter((p) => p.category === category) : bookingPackages
}

/** Public — list bookable packages from Supabase (falls back to code catalog). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    if (isSupabaseConfigured()) {
      if (getSupabaseAdmin() && process.env.NODE_ENV === 'development') {
        await syncPackagesToDb(getSupabaseAdmin()!)
      }

      let rows = await listPackagesFromDb(supabase, category || undefined)

      if ((!rows || rows.length === 0) && getSupabaseAdmin()) {
        await syncPackagesToDb(getSupabaseAdmin()!)
        rows = await listPackagesFromDb(supabase, category || undefined)
      }

      if (rows && rows.length > 0) {
        const bookable: BookingPackage[] = rows.map((p) =>
          enrichBookingPackageFromCatalog({
            id: p.id,
            category: p.category as BookingPackage['category'],
            title: p.title,
            price: p.price,
            duration: p.duration,
            description: p.description,
            features: p.features,
            slotType: p.slotType,
            note: p.note,
          }),
        )
        return NextResponse.json(bookable)
      }
    }

    return NextResponse.json(codePackagesToApi(category))
  } catch (error) {
    console.error('GET /api/packages', error)
    return NextResponse.json({ error: 'Failed to load packages' }, { status: 500 })
  }
}
