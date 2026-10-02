'use client'

import { useCallback, useEffect, useState } from 'react'
import StaffReadNotice from '@/components/staff-read-notice'
import { getBookings, getBlockedSlots, getFicoSpotBlocks, peekBookings, peekBlockedSlots, peekFicoSpotBlocks, Booking } from '@/lib/data-store'
import type { BlockedSlot } from '@/lib/blocked-slots'
import type { FicoSpotBlock } from '@/lib/fico-spot-blocks'
import AdminDayOperations from '@/components/admin-day-operations'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import AdminPageHeader from '@/components/admin-page-header'
import AdminBookingCalendar, { AdminDaySessions } from '@/components/admin-booking-calendar'
import { adminPage } from '@/lib/admin-ui'
import { AdminPageSkeleton } from '@/components/admin-page-skeleton'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function AdminCalendarPage() {
  const [bookings, setBookings] = useState<Booking[]>(() => peekBookings() ?? [])
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>(() => peekBlockedSlots() ?? [])
  const [ficoSpotBlocks, setFicoSpotBlocks] = useState<FicoSpotBlock[]>(() => peekFicoSpotBlocks() ?? [])
  const [loading, setLoading] = useState(() => [peekBookings(), peekBlockedSlots(), peekFicoSpotBlocks()].some(data => data === undefined))
  const [refreshing, setRefreshing] = useState(false)
  const [readError, setReadError] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayKey())

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const [data, blocked, ficoBlocks] = await Promise.all([
        getBookings({ force: !silent, requireFresh: true }),
        getBlockedSlots({ requireFresh: true }),
        getFicoSpotBlocks({ requireFresh: true }),
      ])
      setBookings(data)
      setBlockedSlots(blocked)
      setFicoSpotBlocks(ficoBlocks)
      setReadError('')
    } catch {
      setReadError('Calendar data could not be loaded. Availability cannot be verified until bookings and slot restrictions are available.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  useOnAdminDbSync(() => fetchData(true))

  if (loading) {
    return <AdminPageSkeleton variant="calendar" />
  }

  if (readError) return <div className={adminPage}><AdminPageHeader title="Session Calendar" subtitle="View shoot dates and manage available slots." /><StaffReadNotice message={readError} retryLabel="Retry calendar" busy={refreshing} onRetry={() => void fetchData()} /></div>

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Session Calendar"
        subtitle="View shoot dates and manage available slots."
        onRefresh={() => fetchData()}
        refreshing={refreshing}
      />

      <div className="grid xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] gap-6 items-start">
        <div className="xl:sticky xl:top-4 space-y-4">
          <AdminBookingCalendar
            bookings={bookings}
            blockedSlots={blockedSlots}
            ficoSpotBlocks={ficoSpotBlocks}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>

        <div className="space-y-5 min-w-0">
          {selectedDate ? (
            <>
              <AdminDayOperations
                date={selectedDate}
                bookings={bookings}
                blockedSlots={blockedSlots}
                ficoSpotBlocks={ficoSpotBlocks}
                onChanged={() => fetchData(true)}
              />
              <AdminDaySessions
                bookings={bookings}
                date={selectedDate}
                blockedSlots={blockedSlots}
                ficoSpotBlocks={ficoSpotBlocks}
              />
            </>
          ) : (
            <AdminDaySessions
              bookings={bookings}
              date=""
              blockedSlots={blockedSlots}
              ficoSpotBlocks={ficoSpotBlocks}
            />
          )}
        </div>
      </div>
    </div>
  )
}
