type BookingFormReadPath = '/api/packages' | '/api/bookings/availability' | '/api/blocked-slots' | '/api/fico-spot-blocks'

/** The public booking form must distinguish an authoritative empty list from a failed read. */
export async function fetchBookingFormList<T>(path: BookingFormReadPath, fetcher: typeof fetch = fetch): Promise<T[]> {
  const response = await fetcher(path, { cache: 'no-store' })
  if (!response.ok) throw new Error('The latest booking information could not be loaded.')
  const data: unknown = await response.json()
  if (!Array.isArray(data)) throw new Error('The latest booking information could not be loaded.')
  return data as T[]
}
