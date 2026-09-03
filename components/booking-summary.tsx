'use client'

import type { BookingPackage } from '@/lib/booking-packages'

type Props = {
  packageInfo: BookingPackage | null
  bookingDate: Date | null
  timeSlot: string
  graduation?: {
    schoolName?: string
    course?: string
  }
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export default function BookingSummarySidebar({ packageInfo, bookingDate, timeSlot, graduation }: Props) {
  return (
    <aside className="border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 sm:p-5 md:p-6 h-fit w-full">
      <h4 className="text-xs font-bold tracking-[0.2em] text-white uppercase mb-5 pb-3 border-b border-white/10">
        Booking Summary
      </h4>

      <div className="space-y-4 text-sm">
        <div>
          <p className="text-[9px] font-semibold tracking-[0.15em] uppercase text-white/40 mb-1">Package</p>
          <p className="font-semibold text-white">{packageInfo?.title || '—'}</p>
          {packageInfo && (
            <p className="text-xs text-white/70 mt-0.5">
              {packageInfo.price} · {packageInfo.duration}
            </p>
          )}
        </div>

        <div>
          <p className="text-[9px] font-semibold tracking-[0.15em] uppercase text-white/40 mb-1">Date</p>
          <p className="font-medium text-white/90">{bookingDate ? formatDate(bookingDate) : '—'}</p>
        </div>

        <div>
          <p className="text-[9px] font-semibold tracking-[0.15em] uppercase text-white/40 mb-1">Time Slot</p>
          <p className="font-medium text-white/90">{timeSlot || '—'}</p>
        </div>

        {graduation && (graduation.schoolName || graduation.course) && (
          <div className="pt-2 border-t border-white/10 space-y-2">
            <p className="text-[9px] font-semibold tracking-[0.15em] uppercase text-white/40">Session Details</p>
            {graduation.schoolName && <p className="text-xs text-white/70"><span className="text-white/40">School:</span> {graduation.schoolName}</p>}
            {graduation.course && <p className="text-xs text-white/70"><span className="text-white/40">Course:</span> {graduation.course}</p>}
          </div>
        )}
      </div>
    </aside>
  )
}
