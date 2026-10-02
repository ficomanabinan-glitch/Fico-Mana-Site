'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Users } from 'lucide-react'
import { getBookings, peekBookings, type Booking } from '@/lib/data-store'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { adminInput, adminPage, adminPanel } from '@/lib/admin-ui'
import AdminPageHeader from '@/components/admin-page-header'
import { clientWorkspaceHref } from '@/lib/client-workspace-navigation'
import { ClientSearchResults } from '@/components/admin-client-search'

export default function ClientsPage() {
  const [bookings, setBookings] = useState<Booking[]>(() => peekBookings() ?? [])
  const [loading, setLoading] = useState(() => peekBookings() === undefined)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try { setBookings(await getBookings({ requireFresh: true })); setError('') }
    catch { setError('The client list could not be loaded. You can still try the client search above.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    void load()
  }, [])
  useOnAdminDbSync(() => { void load() })

  const clients = useMemo(() => {
    const map = new Map<string, Booking>()
    bookings.forEach((booking) => {
      const key = booking.clientId || `booking:${booking.id}`
      const current = map.get(key)
      if (!current || booking.bookingDate > current.bookingDate) map.set(key, booking)
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
        <ClientSearchResults/>
        <div className="relative mt-6 border-t border-white/10 pt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/60" />
          <input
            aria-label="Filter loaded clients"
            className={`${adminInput} pl-10`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter this list by name, email, or phone…"
          />
        </div>
      </div>

      <div className={`${adminPanel} overflow-hidden`}>
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-amber-200"><p>{error}</p><button type="button" onClick={() => void load()} className="min-h-11 rounded-control border border-amber-200/25 px-3 text-white">Retry client list</button></div>}
        <div className="hidden md:block">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/10 text-caption uppercase tracking-wider text-white/65">
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
                <td className="p-4">
                  <span className="inline-flex rounded-control border border-[#C4CEFF]/20 bg-[#C4CEFF]/[0.06] px-3 py-2 font-semibold text-[#C4CEFF]">
                    {client.packageName}
                  </span>
                </td>
                <td className="p-4">
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-control border border-white/10 bg-white/[0.03] px-3 py-2 font-semibold text-[#C4CEFF] transition hover:border-[#C4CEFF]/35 hover:bg-[#C4CEFF]/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]"
                    href={clientWorkspaceHref(client.id, client.clientId)}
                  >
                    Open workspace
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {!loading && clients.length > 0 ? (
          <div className="divide-y divide-white/[0.08] md:hidden">
            {clients.map((client) => (
              <article key={`mobile-${client.customerEmail}-${client.id}`} className="space-y-4 p-4">
                <div>
                  <h2 className="font-semibold text-white">{client.customerName}</h2>
                  <p className="mt-1 break-all text-xs text-white/70">{client.customerEmail}</p>
                  <p className="mt-1 text-xs text-white/70">{client.customerPhone}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-white/65">Latest booking: {client.bookingDate}</span>
                  <span className="inline-flex rounded-control border border-[#C4CEFF]/20 bg-[#C4CEFF]/[0.06] px-2.5 py-1.5 font-semibold text-[#C4CEFF]">{client.packageName}</span>
                </div>
                <Link className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-white/10 bg-white/[0.03] px-3 py-2 font-semibold text-[#C4CEFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]" href={clientWorkspaceHref(client.id, client.clientId)}>Open workspace</Link>
              </article>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3 p-5" role="status" aria-label="Loading clients">
            {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-control bg-white/[0.05]" />)}
          </div>
        ) : clients.length === 0 && !error ? (
          <div className="p-10 text-center text-white/65">
            <Users className="mx-auto mb-3 size-8 opacity-50" />
            {search ? 'No clients match your search.' : 'No clients have been added yet.'}
          </div>
        ) : null}
      </div>
    </div>
  )
}
