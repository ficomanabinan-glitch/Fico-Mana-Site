import type { Booking } from '@/lib/data-store'
import { getRawPhotoWorkflowStatus } from '@/lib/booking-display'

export type RawPhotoStatus = NonNullable<Booking['rawPhotoStatus']>

export function getRawPhotoStatus(booking: Pick<Booking, 'rawPhotoStatus'>): RawPhotoStatus | null {
  if (!booking.rawPhotoStatus) return null
  return booking.rawPhotoStatus
}

export function hasRawPhotoSubmission(booking: Pick<Booking, 'rawPhotoSubmittedAt' | 'rawPhotoStatus'>): boolean {
  return Boolean(booking.rawPhotoSubmittedAt || booking.rawPhotoStatus)
}

export function isPendingRawPhotoReview(booking: Pick<Booking, 'rawPhotoSubmittedAt' | 'rawPhotoStatus'>): boolean {
  return getRawPhotoWorkflowStatus(booking as Booking) === 'pending_review'
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
    case 'Reopened':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    default:
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  }
}
