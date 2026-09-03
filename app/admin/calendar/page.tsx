'use client'

import { useEffect, useState } from 'react'
import { getBookings, getBlockedSlots, getFicoSpotBlocks, Booking } from '@/lib/data-store'
import type { BlockedSlot } from '@/lib/blocked-slots'
import type { FicoSpotBlock } from '@/lib/fico-spot-blocks'
import AdminDayOperations from '@/components/admin-day-operations'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { useAdminToast } from '@/components/admin-toast-provider'
import AdminPageHeader from '@/components/admin-page-header'
import AdminBookingCalendar, { AdminDaySessions } from '@/components/admin-booking-calendar'
import { adminPage, adminSpinnerWrap, adminSpinner } from '@/lib/admin-ui'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function AdminCalendarPage() {
  const toast = useAdminToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([])
  const [ficoSpotBlocks, setFicoSpotBlocks] = useState<FicoSpotBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayKey())

  const fetchData = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const [data, blocked, ficoBlocks] = await Promise.all([
        getBookings(),
        getBlockedSlots(),
        getFicoSpotBlocks(),
      ])
      setBookings(data)
      setBlockedSlots(blocked)
      setFicoSpotBlocks(ficoBlocks)
    } catch {
      if (!silent) toast.error('Sync failed', 'Could not load calendar data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData(true)
  }, [])

  useOnAdminDbSync(() => fetchData(true))

  if (loading) {
    return (
      <div className={adminSpinnerWrap}>
        <div className={adminSpinner} />
      </div>
    )
  }

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Session Calendar"
        subtitle="Pick a date, then adjust FICO capacity or MANA slots."
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
