'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Users } from 'lucide-react'
import { getBookings, peekBookings, type Booking } from '@/lib/data-store'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { adminInput, adminPage, adminPanel } from '@/lib/admin-ui'
import AdminPageHeader from '@/components/admin-page-header'

export default function ClientsPage() {
  const [bookings, setBookings] = useState<Booking[]>(() => peekBookings() ?? [])
  const [search, setSearch] = useState('')

  useEffect(() => {
    getBookings().then(setBookings)
  }, [])
  useOnAdminDbSync(() => { void getBookings().then(setBookings) })

  const clients = useMemo(() => {
    const map = new Map<string, Booking>()
    bookings.forEach((booking) => {
      const key = booking.customerEmail || booking.customerPhone || booking.customerName
      if (!map.has(key)) map.set(key, booking)
    })
    const q = search.trim().toLowerCase()
    return Array.from(map.values()).filter((booking) =>
      [booking.customerName, booking.customerEmail, booking.customerPhone]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [bookings, search])

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Clients"
        subtitle="Find client details and booking history."
      />

      <div className={`${adminPanel} p-4`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/30" />
          <input
            className={`${adminInput} pl-10`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client name, email, or phone…"
          />
        </div>
      </div>

      <div className={`${adminPanel} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-white/10 text-caption uppercase tracking-wider text-white/40">
            <tr>
              <th className="p-4">Client</th>
              <th className="p-4">Contact</th>
              <th className="p-4">Latest booking</th>
              <th className="p-4">Package</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {clients.map((client) => (
              <tr key={`${client.customerEmail}-${client.id}`} className="hover:bg-white/[0.02]">
                <td className="p-4 font-semibold text-white">{client.customerName}</td>
                <td className="p-4 text-white/55">
                  <div>{client.customerEmail}</div>
                  <div className="mt-1">{client.customerPhone}</div>
                </td>
                <td className="p-4 text-white/65">{client.bookingDate}</td>
                <td className="p-4 text-[#C4CEFF]">{client.packageName}</td>
                <td className="p-4">
                  <Link
                    className="text-[#C4CEFF] hover:underline"
                    href={`/admin/bookings?search=${encodeURIComponent(client.customerName)}`}
                  >
                    Open bookings
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {clients.length === 0 ? (
          <div className="p-10 text-center text-white/40">
            <Users className="mx-auto mb-3 size-8 opacity-50" />
            No clients found.
          </div>
        ) : null}
      </div>
    </div>
  )
}
