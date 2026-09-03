'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowRight, CalendarDays, CalendarX2, Download } from 'lucide-react'
import type { Booking } from '@/lib/data-store'
import { downloadDayBookingsExcel } from '@/lib/export-day-bookings'
import type { BlockedSlot } from '@/lib/blocked-slots'
import { countBlockedSlotsOnDate, getBlockedSlotsForDate } from '@/lib/blocked-slots'
import { getFicoSpotsBlocked, type FicoSpotBlock } from '@/lib/fico-spot-blocks'
import { adminCard, adminEmptyState, adminPanel, bookingStatusBadge } from '@/lib/admin-ui'

type Props = {
  bookings: Booking[]
  blockedSlots?: BlockedSlot[]
  ficoSpotBlocks?: FicoSpotBlock[]
  selectedDate?: string
  onSelectDate: (date: string) => void
  className?: string
  compact?: boolean
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayKey() {
  const now = new Date()
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
}

export default function AdminBookingCalendar({
  bookings,
  blockedSlots = [],
  ficoSpotBlocks = [],
  selectedDate,
  onSelectDate,
  className = '',
  compact = false,
}: Props) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(
    selectedDate ? Number(selectedDate.split('-')[0]) : now.getFullYear(),
  )
  const [viewMonth, setViewMonth] = useState(
    selectedDate ? Number(selectedDate.split('-')[1]) - 1 : now.getMonth(),
  )

  const countsByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const b of bookings) {
      if (!b.bookingDate || b.bookingStatus === 'Cancelled') continue
      map.set(b.bookingDate, (map.get(b.bookingDate) ?? 0) + 1)
    }
    return map
  }, [bookings])

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: compact ? 'short' : 'long',
    year: 'numeric',
  })

  const calendarDays = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells: Array<{ date: string; day: number } | null> = []

    for (let i = 0; i < startPad; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: toDateKey(viewYear, viewMonth, day), day })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewYear, viewMonth])

  const monthTotal = useMemo(() => {
    let total = 0
    countsByDate.forEach((count, date) => {
      const [y, m] = date.split('-').map(Number)
      if (y === viewYear && m === viewMonth + 1) total += count
    })
    return total
  }, [countsByDate, viewYear, viewMonth])

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const labels = compact ? WEEKDAYS_SHORT : WEEKDAYS
  const cellH = compact ? 'h-8' : 'h-11'

  return (
    <div className={`${adminCard} p-5 ${compact ? 'max-w-[252px]' : 'w-full'} ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-5">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-white/35 uppercase">Schedule</p>
          <p className={`font-semibold text-white mt-0.5 ${compact ? 'text-xs' : 'text-base'}`}>{monthLabel}</p>
        </div>
        <div className="flex items-center rounded-lg border border-white/10 overflow-hidden bg-black/20">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date()
              setViewYear(t.getFullYear())
              setViewMonth(t.getMonth())
              onSelectDate(todayKey())
            }}
            className="px-2.5 py-2 text-[9px] font-bold uppercase tracking-wider text-white/50 hover:text-white border-x border-white/10"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {labels.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className={`font-semibold text-white/30 text-center ${compact ? 'text-[8px]' : 'text-[10px]'}`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {calendarDays.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className={cellH} />
          }

          const count = countsByDate.get(cell.date) ?? 0
          const isToday = cell.date === todayKey()
          const isSelected = cell.date === selectedDate
          const hasBookings = count > 0
          const blockedCount = countBlockedSlotsOnDate(blockedSlots, cell.date)
          const ficoHeld = getFicoSpotsBlocked(ficoSpotBlocks, cell.date)

          return (
            <button
              key={cell.date}
              type="button"
              title={
                blockedCount > 0 && ficoHeld > 0
                  ? `${blockedCount} MANA slot${blockedCount === 1 ? '' : 's'} blocked, ${ficoHeld} FICO spot${ficoHeld === 1 ? '' : 's'} held`
                  : blockedCount > 0
                    ? `${blockedCount} slot${blockedCount === 1 ? '' : 's'} blocked`
                    : ficoHeld > 0
                      ? `${ficoHeld} FICO spot${ficoHeld === 1 ? '' : 's'} held`
                      : hasBookings
                        ? `${count} booking${count === 1 ? '' : 's'}`
                        : undefined
              }
              onClick={() => onSelectDate(isSelected ? '' : cell.date)}
              className={`relative ${cellH} flex flex-col items-center justify-center rounded-lg transition-all ${
                isSelected
                  ? 'bg-primary text-white shadow-[0_0_16px_rgba(5,0,208,0.35)] scale-[1.02]'
                  : isToday
                    ? 'bg-primary/10 text-white ring-1 ring-inset ring-primary/40'
                    : blockedCount > 0
                      ? 'bg-amber-500/10 text-amber-200/90 ring-1 ring-inset ring-amber-500/25'
                      : hasBookings
                        ? 'text-white bg-white/[0.05] hover:bg-primary/15 border border-white/5'
                        : 'text-white/35 hover:bg-white/[0.04] hover:text-white/60'
              }`}
            >
              <span className={`font-medium leading-none tabular-nums ${compact ? 'text-[10px]' : 'text-sm'}`}>
                {cell.day}
              </span>
              {blockedCount > 0 && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden />
              )}
              {ficoHeld > 0 && (
                <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-violet-400" aria-hidden />
              )}
              {hasBookings && (
                <span
                  className={`absolute bottom-1 min-w-[14px] px-1 rounded-full text-[7px] font-bold leading-none tabular-nums ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-primary/25 text-primary'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-white/[0.06] space-y-2 text-[10px] text-white/40">
        <div className="flex items-center justify-between gap-2">
          <span>
            <span className="text-white/75 font-semibold tabular-nums">{monthTotal}</span> sessions this month
          </span>
          {selectedDate && (
            <button
              type="button"
              onClick={() => onSelectDate('')}
              className="text-primary font-semibold hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        {blockedSlots.some((d) => d.date.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`)) && (
          <p className="flex items-center gap-1.5 text-amber-400/70">
            <span className="w-2 h-2 rounded-full bg-amber-400/80 shrink-0" />
            Amber dot = some MANA session slots blocked
          </p>
        )}
        {ficoSpotBlocks.some(
          (d) =>
            d.spotsBlocked > 0 &&
            d.date.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`),
        ) && (
          <p className="flex items-center gap-1.5 text-violet-400/70">
            <span className="w-2 h-2 rounded-full bg-violet-400/80 shrink-0" />
            Violet dot = FICO spots held
          </p>
        )}
      </div>
    </div>
  )
}

export function AdminDaySessions({
  bookings,
  date,
  blockedSlots = [],
  ficoSpotBlocks = [],
}: {
  bookings: Booking[]
  date: string
  blockedSlots?: BlockedSlot[]
  ficoSpotBlocks?: FicoSpotBlock[]
}) {
  const dayBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.bookingDate === date && b.bookingStatus !== 'Cancelled')
        .sort((a, b) => a.bookingTime.localeCompare(b.bookingTime)),
    [bookings, date],
  )

  const label = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : ''

  if (!date) {
    return (
      <div className={`${adminPanel} min-h-[380px] flex flex-col`}>
        <div className={`${adminEmptyState} flex-1 m-5`}>
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <CalendarDays className="w-6 h-6 text-primary/70" />
          </div>
          <p className="text-sm font-medium text-white/70">Select a date</p>
          <p className="text-xs text-white/40 max-w-xs">
            Pick a day on the calendar to see scheduled sessions and jump to booking details.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${adminPanel} flex flex-col`}>
      <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] text-white/40 uppercase">Bookings</p>
          <p className="text-sm font-semibold text-white mt-0.5">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadDayBookingsExcel(bookings, date)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/80 hover:text-white hover:border-white/25 transition-colors"
          >
            <Download className="w-3 h-3" />
            Export Excel
          </button>
          <Link
            href={`/admin/bookings?date=${date}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
          >
            Open in list <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[360px]">
        {dayBookings.length === 0 ? (
          <div className={`${adminEmptyState} m-5 border-none bg-transparent`}>
            <div className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <CalendarX2 className="w-5 h-5 text-white/30" />
            </div>
            <p className="text-sm font-medium text-white/60">No sessions on this date</p>
            <p className="text-xs text-white/35">Bookings will appear here once customers reserve a slot.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {dayBookings.map((b) => (
              <Link
                key={b.id}
                href={`/admin/bookings?search=${encodeURIComponent(b.id)}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-primary/90 transition-colors">
                    {b.customerName}
                  </p>
                  <p className="text-[11px] text-white/40 mt-1">
                    {b.bookingTime} · {b.packageName}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="font-mono text-[10px] text-primary/90">{b.id}</span>
                  <span className={`px-2 py-0.5 text-[8px] font-bold uppercase ${bookingStatusBadge(b.bookingStatus)}`}>
                    {b.bookingStatus}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {dayBookings.length > 0 && (
        <div className="p-3.5 border-t border-white/[0.08] text-[11px] text-white/40 text-center bg-white/[0.02]">
          {dayBookings.length} session{dayBookings.length === 1 ? '' : 's'} scheduled
        </div>
      )}
    </div>
  )
}
