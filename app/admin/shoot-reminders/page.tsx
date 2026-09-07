'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdminPageHeader from '@/components/admin-page-header'
import ShootReminderSettings from '@/components/shoot-reminder-settings'
import { AdminPageSkeleton } from '@/components/admin-page-skeleton'
import { adminCard, adminInput, adminPage, adminSelect } from '@/lib/admin-ui'
import type { ShootResponse } from '@/lib/shoot-reminder-content'
import { reminderDeliveryIssue, reminderIssue } from '@/lib/shoot-reminder-issues'

type Attendance = {
  bookingId: string; customerName: string; email: string; shootDate: string; bookingTime: string; packageName: string
  response: ShootResponse; responseNote: string; respondedAt: string | null
  dayBeforeStatus: string | null; dayBeforeSentAt: string | null; dayBeforeError: string | null
  morningStatus: string | null; morningSentAt: string | null; morningError: string | null
}
type Overview = {
  rows: Attendance[]; truncated: boolean
  settings: { enabled: boolean; last_completed_at: string | null }
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dateAfter = (date: string, days: number) => new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10)
const timeLabel = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
const responseLabels = { confirmed: 'Confirmed', declined: 'Can’t attend · follow up', pending: 'No response' }

function DeliveryStatus({ status, sentAt, error, fallback }: { status: string | null; sentAt: string | null; error: string | null; fallback: string }) {
  return <div className="text-xs leading-relaxed">
    <p className={status==='failed'?'text-red-300':status==='sent'?'text-emerald-300':'text-white/60'}>{status==='sent'?'Sent':status==='failed'?'Failed':status==='sending'?'Sending':status==='pending'?'Queued':status==='skipped'?'Skipped':fallback}</p>
    {sentAt?<p className="text-white/40">{timeLabel(sentAt)} PHT</p>:null}
    {status==='failed'?<p className="mt-1 text-white/45">{reminderIssue(reminderDeliveryIssue(error)).message}</p>:error?<p className="mt-1 text-white/45">{error}</p>:null}
  </div>
}

export default function ShootRemindersPage() {
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(()=>dateAfter(today(),7))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true)
    try {
      const response = await fetch(`/api/admin/shoot-reminders?from=${from}&to=${to}`, { cache: 'no-store', signal })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Reminders unavailable. Try: refresh the page.')
      if (!signal?.aborted) { setData(body); setError('') }
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : 'Try: check your connection and refresh.')
    } finally { if (!signal?.aborted) { setLoading(false); setRefreshing(false) } }
  }, [from,to])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  const rows = useMemo(() => (data?.rows || []).filter(row =>
    (filter==='all'||row.response===filter) && `${row.bookingId} ${row.customerName} ${row.email}`.toLowerCase().includes(search.toLowerCase().trim())), [data,filter,search])

  if (loading) return <AdminPageSkeleton variant="emails" />
  return <div className={adminPage}>
    <AdminPageHeader title="Shoot Reminders" subtitle="Check client responses and shoot reminders." onRefresh={()=>void load()} refreshing={refreshing}>
      <Link href="/admin/emails" className="cursor-pointer px-3 py-2 text-xs text-[#C4CEFF] hover:underline">Email logs</Link>
    </AdminPageHeader>
    {error?<div role="alert" className="rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>:null}
    <ShootReminderSettings />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{(['confirmed','pending','declined'] as const).map(status=><div key={status} className={`${adminCard} p-4`}><p className="text-xs text-white/50">{responseLabels[status]}</p><p className="mt-2 text-2xl font-semibold">{(data?.rows||[]).filter(row=>row.response===status).length}</p></div>)}</div>
    <div className={`${adminCard} grid items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4`}>
      <label className="text-xs text-white/60">From<input type="date" value={from} onChange={event=>setFrom(event.target.value)} className={`${adminInput} mt-2 [color-scheme:dark]`}/></label>
      <label className="text-xs text-white/60">To<input type="date" value={to} min={from} onChange={event=>setTo(event.target.value)} className={`${adminInput} mt-2 [color-scheme:dark]`}/></label>
      <label className="text-xs text-white/60">Find a client<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name, email, booking…" className={`${adminInput} mt-2`}/></label>
      <label className="text-xs text-white/60">Response<select value={filter} onChange={event=>setFilter(event.target.value)} className={`${adminSelect} mt-2`}><option value="all">All responses</option><option value="confirmed">Confirmed</option><option value="pending">No response</option><option value="declined">Can’t attend</option></select></label>
    </div>
    {data?.truncated?<p className="text-xs text-amber-200">Showing the first 2,000 bookings. Try: narrow the date range to view the remaining clients.</p>:null}
    <div className="space-y-3" aria-busy={refreshing}>{rows.map(row=><article key={row.bookingId} className={`${adminCard} grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr_1fr]`}>
      <div><p className="font-semibold">{row.customerName}</p><p className="mt-1 text-xs text-white/50">{row.bookingId} · {row.packageName}</p><p className="mt-2 text-sm text-[#C4CEFF]">{row.shootDate} · {row.bookingTime}</p><p className="mt-1 break-all text-xs text-white/50">{row.email||'No email address'}</p></div>
      <div><p className={`text-sm font-semibold ${row.response==='declined'?'text-amber-200':row.response==='confirmed'?'text-emerald-300':'text-white/60'}`}>{responseLabels[row.response]}</p>{row.respondedAt?<p className="mt-1 text-xs text-white/40">{timeLabel(row.respondedAt)} PHT</p>:null}{row.responseNote?<p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/65">{row.responseNote}</p>:null}</div>
      <div className="grid grid-cols-2 gap-4"><div><p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Day-before email</p><DeliveryStatus status={row.dayBeforeStatus} sentAt={row.dayBeforeSentAt} error={row.dayBeforeError} fallback="Not sent yet"/></div><div><p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">6 AM shoot-day email</p><DeliveryStatus status={row.morningStatus} sentAt={row.morningSentAt} error={row.morningError} fallback={row.response==='declined'?'Excluded · declined':row.dayBeforeStatus!=='sent'?'Excluded until first email is sent':'Scheduled for shoot day'}/></div></div>
    </article>)}{!rows.length&&!error?<div className={`${adminCard} p-10 text-center text-sm text-white/45`}>No matching confirmed bookings in this date range.</div>:null}</div>
  </div>
}
