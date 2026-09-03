import type { Booking } from '@/lib/data-store'

export type RawPhotoStatus = NonNullable<Booking['rawPhotoStatus']>

export function getRawPhotoStatus(booking: Pick<Booking, 'rawPhotoStatus'>): RawPhotoStatus | null {
  if (!booking.rawPhotoStatus) return null
  return booking.rawPhotoStatus
}

export function hasRawPhotoSubmission(booking: Pick<Booking, 'rawPhotoLink'>): boolean {
  return Boolean(booking.rawPhotoLink?.trim())
}

export function isPendingRawPhotoReview(booking: Pick<Booking, 'rawPhotoLink' | 'rawPhotoStatus'>): boolean {
  return hasRawPhotoSubmission(booking) && (booking.rawPhotoStatus || 'Pending Review') === 'Pending Review'
}

export function countPendingRawPhotoReviews(bookings: Booking[]): number {
  return bookings.filter(isPendingRawPhotoReview).length
}

export function rawPhotoStatusBadgeClass(status: RawPhotoStatus | 'Pending Review'): string {
  switch (status) {
    case 'Approved':
      return 'bg-green-500/15 text-green-400 border-green-500/30'
    case 'Rejected':
      return 'bg-red-500/15 text-red-400 border-red-500/30'
    default:
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  }
}

export function clientSubmitRawPhotoPath(bookingId: string): string {
  return `/submit-raw-photo?booking=${encodeURIComponent(bookingId)}`
}
