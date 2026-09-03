'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Booking } from '@/lib/data-store'
import { useAdminToast } from '@/components/admin-toast-provider'
import { ExternalLink, Copy, Image as ImageIcon } from 'lucide-react'
import {
  clientSubmitRawPhotoPath,
  getRawPhotoStatus,
  hasRawPhotoSubmission,
  isPendingRawPhotoReview,
  rawPhotoStatusBadgeClass,
} from '@/lib/raw-photo-display'

export default function AdminBookingRawPhoto({ booking }: { booking: Booking }) {
  const toast = useAdminToast()
  const [copied, setCopied] = useState(false)

  const canSubmit =
    Boolean(booking.driveLink) &&
    (booking.bookingStatus === 'Confirmed' || booking.bookingStatus === 'Completed')

  const submitPath = clientSubmitRawPhotoPath(booking.id)
  const submitUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${submitPath}` : submitPath

  const copySubmitLink = async () => {
    try {
      await navigator.clipboard.writeText(submitUrl)
      setCopied(true)
      toast.success('Link copied', 'Client raw photo submit link copied to clipboard.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed', 'Could not copy link to clipboard.')
    }
  }

  const status = getRawPhotoStatus(booking)
  const submitted = hasRawPhotoSubmission(booking)

  return (
    <div className="border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5 gap-2">
        <h4 className="text-[10px] font-bold tracking-widest text-white/40 uppercase flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" /> Raw Photo Selection
        </h4>
        {submitted && isPendingRawPhotoReview(booking) && (
          <Link
            href={`/filtering?tab=queue&search=${encodeURIComponent(booking.id)}`}
            target="_blank"
            className="text-[9px] font-bold uppercase tracking-wider text-primary hover:underline"
          >
            Review in queue →
          </Link>
        )}
      </div>

      {!canSubmit && !submitted && (
        <p className="text-[11px] text-white/45 leading-relaxed">
          Add a Google Drive gallery link and confirm the booking before the client can submit their raw photo choice.
        </p>
      )}

      {canSubmit && (
        <div className="space-y-2">
          <p className="text-[11px] text-white/45">Send this link so the client can submit name + Drive folder:</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={submitUrl}
              className="flex-1 min-w-0 bg-black/40 border border-white/10 px-2 py-1.5 text-[10px] font-mono text-white/70"
            />
            <button
              type="button"
              onClick={copySubmitLink}
              className="shrink-0 px-3 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            >
              <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {submitted ? (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-white/40">Review status</span>
            <span
              className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded border ${rawPhotoStatusBadgeClass(status || 'Pending Review')}`}
            >
              {status || 'Pending Review'}
            </span>
          </div>
          {booking.rawPhotoSubmittedAt && (
            <div className="flex justify-between gap-2 text-[11px]">
              <span className="text-white/40">Submitted</span>
              <span className="text-white/70">
                {new Date(booking.rawPhotoSubmittedAt).toLocaleString()}
              </span>
            </div>
          )}
          <a
            href={booking.rawPhotoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold break-all"
          >
            Open client&apos;s raw photo link <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
          {booking.rawPhotoNotes && (
            <p className="text-[11px] p-2 bg-white/[0.03] border border-white/10 italic text-white/70">
              {booking.rawPhotoNotes}
            </p>
          )}
        </div>
      ) : canSubmit ? (
        <p className="text-[11px] text-amber-400/90">Waiting for client to submit a raw photo link.</p>
      ) : null}
    </div>
  )
}
