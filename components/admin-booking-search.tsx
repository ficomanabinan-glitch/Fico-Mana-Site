'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ArrowRight, ExternalLink } from 'lucide-react'
import type { Booking } from '@/lib/data-store'
import { bookingMatchesSearch, enrichBookingDisplay } from '@/lib/booking-display'
import { adminCard, adminInput, bookingStatusBadge } from '@/lib/admin-ui'

type Props = {
  bookings: Booking[]
}

export default function AdminBookingSearch({ bookings }: Props) {
  const [query, setQuery] = useState('')

  const trimmed = query.trim()
  const results = useMemo(() => {
    if (!trimmed) return []
    return bookings
      .map(enrichBookingDisplay)
      .filter((booking) => bookingMatchesSearch(booking, trimmed))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
  }, [bookings, trimmed])

  return (
    <div className={`${adminCard} p-5 sm:p-6 space-y-4`}>
      <div>
        <h4 className="text-sm font-semibold text-white/85">Find Booking / Transaction</h4>
        <p className="text-xs text-white/45 mt-1 leading-relaxed">
          Search by booking reference (FM-123456), receipt number (FM-RCP-…), GCash ref, name, email, or phone.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="FM-156001, FM-RCP-156001-2076, GCash ref..."
          className={adminInput + ' pl-10 font-mono'}
        />
      </div>

      {trimmed && (
        <div className="border-t border-white/10 pt-4 space-y-3">
          {results.length === 0 ? (
            <p className="text-sm text-white/50">
              No booking found for <span className="font-mono text-white/70">&quot;{trimmed}&quot;</span>.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-white/45">
                {results.length} match{results.length === 1 ? '' : 'es'}
                {results.length === 12 ? ' (showing first 12)' : ''}
              </p>
              {results.map((b) => (
                <div
                  key={b.id}
                  className="border border-white/10 bg-black/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="space-y-1 text-sm">
                    <p className="font-mono font-bold text-primary text-base">{b.id}</p>
                    <p className="font-semibold text-white">{b.customerName}</p>
                    <p className="text-white/50 text-xs">
                      {b.packageName} · {b.bookingDate} · {b.bookingTime}
                    </p>
                    <p className="text-xs text-white/60">
                      GCash / BPI ref:{' '}
                      <span className="font-mono font-semibold text-white">
                        {b.transactionRef || 'Not provided'}
                      </span>
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 text-[9px] font-bold uppercase ${bookingStatusBadge(b.bookingStatus)}`}>
                      {b.bookingStatus}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {b.bookingStatus === 'Pending Verification' && (
                      <Link
                        href="/admin/verification"
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 px-3 py-2 hover:bg-amber-500/25"
                      >
                        Verify <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                    <Link
                      href={`/admin/bookings?search=${encodeURIComponent(b.id)}`}
                      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-white/15 text-white/80 px-3 py-2 hover:border-white/30"
                    >
                      Open record <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
