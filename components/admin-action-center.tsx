'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Booking } from '@/lib/data-store'
import { deriveWorkflowNextAction } from '@/lib/workflow-next-action'
import { clientWorkspaceHref } from '@/lib/client-workspace-navigation'
import { adminBtnPrimary, adminPanel } from '@/lib/admin-ui'
import { studioDay } from '@/lib/new-admin/presentation-data'
import type { ClientWorkspaceAttention } from '@/lib/client-workspace-types'

export default function AdminActionCenter({ bookings }: { bookings: Booking[] }) {
  const [attention, setAttention] = useState<ClientWorkspaceAttention | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    fetch('/api/admin/client-workspace/attention', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => { const value = await response.json(); if (!response.ok || !Array.isArray(value.items)) throw new Error('Production attention unavailable'); return value as ClientWorkspaceAttention })
      .then(value => { if (!controller.signal.aborted) setAttention(value) })
      .catch(() => { if (!controller.signal.aborted) setError('Production attention could not be checked. Booking actions remain available.') })
    return () => controller.abort()
  }, [retry])
  const today = studioDay()
  // Only booking-owned signals are asserted here. Full production health is checked in Client 360.
  const bookingTasks = bookings.filter(b => ['Pending Verification', 'Rejected'].includes(b.bookingStatus) || b.rawPhotoStatus === 'Pending Review' || b.rawPhotoStatus === 'Rejected' || b.bookingDate === today && b.bookingStatus === 'Confirmed')
    .map(booking => ({ booking, action: deriveWorkflowNextAction({ bookingStatus: booking.bookingStatus, paymentStatus: booking.paymentStatus, shootDate: booking.bookingDate, today, rawStatus: booking.rawPhotoStatus }) }))
    .sort((a,b) => a.action.priority - b.action.priority || a.booking.bookingDate.localeCompare(b.booking.bookingDate) || a.booking.id.localeCompare(b.booking.id))
  const known = new Map(bookingTasks.map(({ booking,action }) => [booking.id, { bookingId: booking.id, name: booking.customerName, shootDate: booking.bookingDate, label: action.label, explanation: action.explanation, priority: action.priority, href: clientWorkspaceHref(booking.id,booking.clientId) }]))
  for (const item of attention?.items || []) { const previous = known.get(item.bookingId); if (!previous || item.priority <= previous.priority) known.set(item.bookingId,item) }
  const tasks = [...known.values()].sort((a,b) => a.priority - b.priority || a.shootDate.localeCompare(b.shootDate) || a.bookingId.localeCompare(b.bookingId))
  if (!bookings.length) return <section className={`${adminPanel} p-5 sm:p-6`} aria-labelledby="action-center-title"><h2 id="action-center-title" className="text-xl font-semibold text-white">Start with studio readiness</h2><p className="mt-2 max-w-prose text-sm leading-6 text-white/75">Before your first booking, check payment instructions, packages, staff access, and delivery services. No client records have loaded yet.</p><Link href="/admin/system" className={`${adminBtnPrimary} mt-5 inline-flex items-center gap-2 px-4`}>Check system setup<ArrowRight className="size-4" aria-hidden="true"/></Link><p className="mt-4 text-xs leading-5 text-white/65">Then review Package Manager and record a booking. Setup checks do not send client emails.</p></section>
  return <section className={`${adminPanel} overflow-hidden`} aria-labelledby="action-center-title">
    <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6"><div><h2 id="action-center-title" className="text-xl font-semibold text-white">Action center</h2><p className="mt-2 text-sm leading-6 text-white/70">Booking and production work, ordered by urgency. Open a client to review the full context.</p></div><span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-primary">{tasks.length} to review</span></div>
    {(error || attention?.unavailableSources.length) ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 text-sm text-amber-200"><p>{error || `Some checks are unavailable: ${attention?.unavailableSources.join(', ')}.`}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="min-h-11 rounded-control border border-amber-200/25 px-3 text-white">Retry attention check</button></div> : !attention && <p role="status" className="px-6 pb-4 text-sm text-white/70">Checking production attention…</p>}
    {tasks.length ? <ol className="divide-y divide-white/10 border-t border-white/10">{tasks.slice(0,5).map((task,index) => <li key={task.bookingId} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:px-6"><div className="min-w-0"><p className="break-words text-sm font-semibold text-white">{task.name} · {task.bookingId}</p><p className="mt-1 text-sm text-primary">{task.label}</p><p className="mt-1 max-w-prose text-xs leading-5 text-white/70">{task.explanation}</p></div><Link href={task.href} className={`${index === 0 ? adminBtnPrimary : 'min-h-11 rounded-control border border-white/15 text-white'} inline-flex shrink-0 items-center justify-center gap-2 px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary`}>Open client<ArrowRight aria-hidden="true" className="size-4"/></Link></li>)}</ol> : <div className="flex gap-3 border-t border-white/10 p-5 sm:px-6"><CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-300" aria-hidden="true"/><p className="text-sm leading-6 text-white/75">No actions found in the available reads. This is not proof of full storage or delivery health; use System Settings to check services.</p></div>}
    {(tasks.length > 5 || attention?.truncated) && <p className="border-t border-white/10 px-6 py-4 text-xs text-white/70">Showing up to 5 of {tasks.length}{attention?.truncated ? '+' : ''}. Use client search or the relevant queue to review the rest.</p>}
  </section>
}
