import { cookies } from 'next/headers'
import { CalendarDays, CheckCircle2, Clock3, Download, ExternalLink, Package, WalletCards } from 'lucide-react'
import ClientPortalTrustedDevice from '@/components/client-portal-trusted-device'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mapDbBookingToModel } from '@/lib/booking-db'
import { totalConfirmedPayments } from '@/lib/booking-provisioning'
import {
  PORTAL_SESSION_COOKIE,
  verifyPortalCookie,
  verifyPortalSignature,
} from '@/lib/client-portal'

function money(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)
}

function projectStage(booking: ReturnType<typeof mapDbBookingToModel>) {
  if (booking.bookingStatus === 'Completed') return 'Completed'
  if (booking.editedPhotoLink) return 'Ready for Delivery'
  if (booking.rawPhotoApprovedAt) return 'Editing Photos'
  if (booking.rawPhotoLink) return booking.rawPhotoStatus === 'Approved' ? 'Editing Photos' : 'Selecting Files'
  const shoot = new Date(`${booking.bookingDate}T23:59:59+08:00`).getTime()
  if (Number.isFinite(shoot) && shoot < Date.now()) return 'Shoot Completed'
  if (booking.bookingStatus === 'Confirmed') return 'Shoot Scheduled'
  return 'Booking Confirmed'
}

function AccessMessage({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen bg-[#171717] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg border border-white/10 bg-white/[0.03] p-8 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-white/50 mt-3 leading-relaxed">{message}</p>
      </div>
    </main>
  )
}

export default async function ClientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sig?: string }>
}) {
  const { id: publicId } = await params
  const query = await searchParams
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(PORTAL_SESSION_COOKIE)?.value
  const signature = query.sig?.trim() || ''
  const authorized = verifyPortalSignature(publicId, signature) || verifyPortalCookie(cookieValue, publicId)

  if (!authorized) {
    return <AccessMessage title="Secure portal link required" message="Open the Client Portal using the private link sent by FICO MANA Studio." />
  }

  const admin = getSupabaseAdmin()
  if (!admin) return <AccessMessage title="Portal unavailable" message="The client portal service is temporarily unavailable." />

  const { data: portal } = await admin
    .from('client_portals')
    .select('*')
    .eq('public_id', publicId)
    .maybeSingle()
  if (!portal) return <AccessMessage title="Portal not found" message="This Client Portal is no longer available." />

  if (portal.status === 'disabled') {
    return <AccessMessage title="Portal disabled" message="Access to this Client Portal has been disabled. Contact FICO MANA Studio if you need assistance." />
  }
  if (portal.expires_at && new Date(portal.expires_at).getTime() <= Date.now()) {
    await admin.from('client_portals').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', portal.id)
    return <AccessMessage title="Portal expired" message="Client-facing access has expired. Your booking records and project files remain preserved by FICO MANA Studio." />
  }
  if (portal.status === 'expired') {
    return <AccessMessage title="Portal expired" message="Client-facing access to this project has expired." />
  }

  const { data: bookingRow } = await admin.from('bookings').select('*').eq('id', portal.booking_id).maybeSingle()
  if (!bookingRow) return <AccessMessage title="Booking unavailable" message="The booking attached to this portal could not be loaded." />
  const booking = mapDbBookingToModel(bookingRow)
  const amountPaid = await totalConfirmedPayments(admin, booking)
  const balance = Math.max(0, Number(booking.price || 0) - amountPaid)

  const { data: packageRow } = await admin
    .from('packages')
    .select('features,description')
    .eq('id', booking.packageId)
    .maybeSingle()
  const features = Array.isArray(packageRow?.features) ? packageRow.features.map(String) : []
  const stage = projectStage(booking)

  await admin.from('client_portals').update({ last_accessed_at: new Date().toISOString() }).eq('id', portal.id)
  await admin.from('provisioning_audit').insert({
    booking_id: booking.id,
    action: 'portal_accessed',
    actor_type: 'system',
    external_resource_id: String(portal.id),
    metadata: {},
  })

  return (
    <main className="min-h-screen bg-[#171717] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="border-b border-white/10 pb-6 mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#C4CEFF] font-bold">FICO MANA Client Portal</p>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-2">{booking.customerName}</h1>
            <p className="text-xs font-mono text-white/40 mt-1">Booking {booking.id}</p>
          </div>
          <div className="border border-white/10 bg-white/[0.03] px-4 py-3 min-w-[210px]">
            <p className="text-[9px] uppercase tracking-wider text-white/40">Project progress</p>
            <p className="text-sm font-semibold mt-1 text-[#C4CEFF]">{stage}</p>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-2 text-white/50"><CalendarDays className="w-4 h-4" /><span className="text-[10px] uppercase tracking-wider">Shoot</span></div>
                <p className="font-semibold mt-3">{booking.bookingDate}</p>
                <p className="text-xs text-white/45 mt-1">{booking.bookingTime}</p>
                {booking.arrivalTime ? <p className="text-[11px] text-white/40 mt-2">Arrival: {booking.arrivalTime}</p> : null}
                {booking.shootTime ? <p className="text-[11px] text-white/40">Shoot time: {booking.shootTime}</p> : null}
              </div>
              <div className="border border-white/10 bg-white/[0.02] p-5">
                <div className="flex items-center gap-2 text-white/50"><Package className="w-4 h-4" /><span className="text-[10px] uppercase tracking-wider">Package</span></div>
                <p className="font-semibold mt-3">{booking.packageName}</p>
                {packageRow?.description ? <p className="text-xs text-white/45 mt-1">{String(packageRow.description)}</p> : null}
              </div>
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <h2 className="text-sm font-semibold">Package inclusions</h2>
              {features.length ? (
                <div className="grid sm:grid-cols-2 gap-2 mt-4">
                  {features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-xs text-white/65">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#C4CEFF] mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-white/40 mt-3">Package details are available from the studio.</p>}
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <div className="flex items-center gap-2"><Download className="w-4 h-4 text-[#C4CEFF]" /><h2 className="text-sm font-semibold">Approved deliverables</h2></div>
              {booking.editedPhotoLink ? (
                <a href={booking.editedPhotoLink} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 border border-[#C4CEFF]/30 bg-[#C4CEFF]/10 px-4 py-3 text-xs font-semibold text-[#C4CEFF] hover:bg-[#C4CEFF]/15">
                  Open final edited photos <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <p className="text-xs text-white/45 mt-3">No final client deliverables have been released yet. Internal project folders remain private.</p>
              )}
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <h2 className="text-sm font-semibold">Documents & updates</h2>
              <p className="text-xs text-white/45 mt-3">Invoices, agreements, meeting documents, and other client-approved resources will appear here when they are attached to this booking.</p>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 text-white/50"><WalletCards className="w-4 h-4" /><span className="text-[10px] uppercase tracking-wider">Live payment summary</span></div>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-white/45">Booking total</dt><dd className="font-semibold">{money(booking.price)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/45">Confirmed paid</dt><dd className="font-semibold text-green-300">{money(amountPaid)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/45">Required deposit</dt><dd className="font-semibold">{money(booking.depositAmount)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-white/10 pt-3"><dt className="text-white/45">Remaining balance</dt><dd className="font-bold text-[#C4CEFF]">{money(balance)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-white/45">Payment status</dt><dd className="font-semibold">{booking.paymentStatus}</dd></div>
              </dl>
            </div>

            <div className="border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 text-white/50"><Clock3 className="w-4 h-4" /><span className="text-[10px] uppercase tracking-wider">Portal access</span></div>
              <p className="text-xs text-white/55 mt-3">Status: <span className="text-white font-semibold">Active</span></p>
              {portal.expires_at ? <p className="text-[11px] text-white/40 mt-1">Available until {new Date(portal.expires_at).toLocaleDateString('en-PH')}</p> : <p className="text-[11px] text-white/40 mt-1">Expiration begins after final delivery.</p>}
            </div>

            {signature ? <ClientPortalTrustedDevice publicId={publicId} signature={signature} /> : null}
          </aside>
        </div>
      </div>
    </main>
  )
}
