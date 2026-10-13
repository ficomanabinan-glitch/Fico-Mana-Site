import type { SupabaseClient } from '@supabase/supabase-js'
import type { Booking } from '@/lib/data-store'

export const AVAILABILITY_UNAVAILABLE_MESSAGE = 'Booking availability is temporarily unavailable. Please try again.'

export class BookingAvailabilityUnavailableError extends Error {
  constructor() {
    super(AVAILABILITY_UNAVAILABLE_MESSAGE)
    this.name = 'BookingAvailabilityUnavailableError'
  }
}

type Row = Record<string, unknown>
type PageResult = { data: Row[] | null; error: unknown; count: number | null }

/** Exact counts distinguish a complete read from a lower server-side row cap.
 * Reject changing counts, repeated rows, and incomplete pages rather than exposing
 * a partial availability pool. ID ordering is deterministic across every page.
 */
async function readAvailabilityPages(query: () => {
  order: (column: string) => { range: (from: number, to: number) => PromiseLike<PageResult> }
}): Promise<Row[]> {
  const rows: Row[] = []
  const ids = new Set<string>()
  let expectedCount: number | undefined
  for (let page = 0; page < 100; page++) {
    const { data, error, count } = await query().order('id').range(rows.length, rows.length + 499)
    if (error || !Array.isArray(data) || count == null || !Number.isSafeInteger(count) || count < 0) {
      throw new BookingAvailabilityUnavailableError()
    }
    if (expectedCount !== undefined && expectedCount !== count) throw new BookingAvailabilityUnavailableError()
    expectedCount = count
    for (const row of data) {
      if (row.id == null || ids.has(String(row.id))) throw new BookingAvailabilityUnavailableError()
      ids.add(String(row.id))
    }
    rows.push(...data)
    if (rows.length === count) return rows
    if (!data.length || rows.length > count) throw new BookingAvailabilityUnavailableError()
  }
  throw new BookingAvailabilityUnavailableError()
}

/** Both booking creation and public calendars require complete DB reads. */
export async function loadDatabaseAvailabilityBookings(admin: SupabaseClient | null): Promise<Booking[]> {
  if (!admin) throw new BookingAvailabilityUnavailableError()
  try {
    const [bookings, packages] = await Promise.all([
      readAvailabilityPages(() => admin.from('bookings').select('id, booking_date, slot_id, package_id, booking_status, booking_time', { count: 'exact' })),
      readAvailabilityPages(() => admin.from('packages').select('id, slot_type', { count: 'exact' })),
    ])
    const packageSlotTypes = new Map<string, 'makeup' | 'standard'>(
      packages.map((pkg) => [String(pkg.id), pkg.slot_type === 'makeup' ? 'makeup' : 'standard']),
    )
    return bookings.map((b) => ({
      id: String(b.id),
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      customerFbLink: '',
      customerFbName: '',
      packageId: String(b.package_id),
      packageSlotType: packageSlotTypes.get(String(b.package_id)),
      packageName: '',
      bookingDate: String(b.booking_date),
      bookingTime: String(b.booking_time ?? ''),
      slotId: b.slot_id ? String(b.slot_id) : undefined,
      depositAmount: 0,
      price: 0,
      bookingStatus: b.booking_status as Booking['bookingStatus'],
      paymentStatus: 'Unpaid',
      createdAt: '',
      paymentHistory: [],
    }))
  } catch {
    throw new BookingAvailabilityUnavailableError()
  }
}
