'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import StaffReadNotice from '@/components/staff-read-notice'
import { BarChart3, CalendarDays, PhilippinePeso, Users } from 'lucide-react'
import { getBookings, peekBookings, type Booking } from '@/lib/data-store'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { adminCard, adminPage, adminPanel } from '@/lib/admin-ui'
import AdminPageHeader from '@/components/admin-page-header'

export default function ReportsPage() {
  const [bookings, setBookings] = useState<Booking[]>(() => peekBookings() ?? [])
  const [loading, setLoading] = useState(() => peekBookings() === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [readError, setReadError] = useState('')
  const fetchReports = useCallback(async () => {
    setRefreshing(true)
    try {
      setBookings(await getBookings({ force: true, requireFresh: true }))
      setReadError('')
    } catch {
      setReadError('Reports could not be loaded. Previously shown figures may be out of date.')
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    void fetchReports()
  }, [fetchReports])
  useOnAdminDbSync(fetchReports)

  const report = useMemo(() => {
    const totalRevenue = bookings.reduce(
      (sum, booking) =>
        sum +
        (booking.paymentHistory || []).reduce(
          (paymentSum, payment) => paymentSum + Number(payment.amount || 0),
          0,
        ),
      0,
    )

    return {
      clients: new Set(
        bookings.map((booking) => booking.clientId || `booking:${booking.id}`),
      ).size,
      bookings: bookings.length,
      confirmed: bookings.filter((booking) => booking.bookingStatus === 'Confirmed').length,
      completed: bookings.filter((booking) => booking.bookingStatus === 'Completed').length,
      revenue: totalRevenue,
    }
  }, [bookings])

  const cards = [
    { label: 'Clients', value: report.clients, icon: Users },
    { label: 'Bookings', value: report.bookings, icon: CalendarDays },
    { label: 'Confirmed', value: report.confirmed, icon: BarChart3 },
    { label: 'Collected', value: `₱${report.revenue.toLocaleString()}`, icon: PhilippinePeso },
  ]

  if (loading) return <div className={adminPage}><AdminPageHeader title="Reports" subtitle="View booking and payment summaries." /><div role="status" className={`${adminPanel} p-5`}>Loading report figures…</div></div>
  if (readError && !bookings.length) return <div className={adminPage}><AdminPageHeader title="Reports" subtitle="View booking and payment summaries." /><StaffReadNotice message={readError} retryLabel="Retry reports" busy={refreshing} onRetry={() => void fetchReports()} /></div>

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Reports"
        subtitle="View booking and payment summaries."
      />

      {readError && <StaffReadNotice message={readError} retryLabel="Retry reports" busy={refreshing} onRetry={() => void fetchReports()} />}

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`${adminCard} p-5`}>
              <Icon className="size-5 text-[#C4CEFF]" />
              <p className="mt-4 text-caption font-semibold uppercase tracking-label text-white/40">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{card.value}</p>
            </div>
          )
        })}
      </div>

      <section className={`${adminPanel} p-5`}>
        <h2 className="text-sm font-semibold text-white">Operations summary</h2>
        <div className="mt-4 grid md:grid-cols-3 gap-3 text-xs">
          <div className="rounded-control border border-white/10 bg-black/10 p-4">
            <p className="text-white/40">Completed sessions</p>
            <p className="mt-2 text-xl font-bold">{report.completed}</p>
          </div>
          <div className="rounded-control border border-white/10 bg-black/10 p-4">
            <p className="text-white/40">Open / other statuses</p>
            <p className="mt-2 text-xl font-bold">{Math.max(0, report.bookings - report.completed)}</p>
          </div>
          <div className="rounded-control border border-[#C4CEFF]/20 bg-[#C4CEFF]/[0.05] p-4 text-[#C4CEFF]">
            Figures are based on your bookings and payments.
          </div>
        </div>
      </section>
    </div>
  )
}
