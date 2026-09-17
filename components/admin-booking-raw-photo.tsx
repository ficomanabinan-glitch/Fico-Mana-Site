'use client'

import Link from 'next/link'
import type { Booking } from '@/lib/data-store'
import { Image as ImageIcon } from 'lucide-react'
import {
  getRawPhotoStatus,
  hasRawPhotoSubmission,
  isPendingRawPhotoReview,
  rawPhotoStatusBadgeClass,
} from '@/lib/raw-photo-display'

export default function AdminBookingRawPhoto({ booking }: { booking: Booking }) {
  const active = booking.bookingStatus === 'Confirmed' || booking.bookingStatus === 'Completed'
  const status = getRawPhotoStatus(booking)
  const submitted = hasRawPhotoSubmission(booking)
  const workflowHref = `/admin/filtering?tab=${isPendingRawPhotoReview(booking) ? 'queue' : 'editor'}&search=${encodeURIComponent(booking.id)}`

  return (
    <div className="space-y-3 rounded-card border border-white/10 p-4">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <h4 className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-label text-white/40">
          <ImageIcon className="size-3.5" /> Photo Selection
        </h4>
        {active && (
          <Link
            href={workflowHref}
            className="text-caption font-semibold uppercase tracking-wider text-primary hover:underline"
          >
            {submitted ? 'Open workflow' : 'Prepare photos'} →
          </Link>
        )}
      </div>

      {!active && !submitted && (
        <p className="text-caption leading-relaxed text-white/45">
          Confirm the booking before preparing its private gallery and Client Portal.
        </p>
      )}

      {active && !submitted && (
        <p className="text-caption leading-relaxed text-white/45">
          Prepare the booking storage and upload the shoot photos. The client selects directly in their private portal.
        </p>
      )}

      {submitted && (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/40">Review status</span>
            <span className={`rounded border px-2 py-0.5 text-caption font-semibold uppercase ${rawPhotoStatusBadgeClass(status || 'Pending Review')}`}>
              {status || 'Pending Review'}
            </span>
          </div>
          {booking.rawPhotoSubmittedAt && (
            <div className="flex justify-between gap-2 text-caption">
              <span className="text-white/40">Submitted</span>
              <span className="text-white/70">{new Date(booking.rawPhotoSubmittedAt).toLocaleString('en-PH')}</span>
            </div>
          )}
          {booking.rawPhotoNotes && (
            <p className="rounded-control border border-white/10 bg-white/[0.03] p-2 text-caption italic text-white/70">
              {booking.rawPhotoNotes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
