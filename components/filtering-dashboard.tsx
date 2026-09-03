'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle,
  Clock,
  ExternalLink,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  PenTool,
  Search,
  Upload,
} from 'lucide-react'
import { getBookings, type Booking } from '@/lib/data-store'
import {
  getRawPhotoWorkflowStatus,
  isRawPhotoWorkflowBooking,
  rawPhotoWorkflowLabel,
  type RawPhotoWorkflowStatus,
} from '@/lib/booking-display'
import { buildDayPriorityMap, getDayPriorityCount, sortBookingsByDayPriority } from '@/lib/booking-priority'
import { countPendingRawPhotoReviews, hasRawPhotoSubmission, isPendingRawPhotoReview } from '@/lib/raw-photo-display'
import BookingPrioritySelect from '@/components/booking-priority-select'
import { EDITOR_DEADLINE_DAYS, getEditorDeadlineInfo, getEditorFolderDayKey } from '@/lib/editor-deadline'
import {
  adminBtnGhost,
  adminBtnPrimary,
  adminCard,
  adminCardHover,
  adminEmptyState,
  adminInput,
  adminPage,
  adminPanel,
  adminSpinner,
  adminSpinnerWrap,
  rawPhotoStatusBadge,
} from '@/lib/admin-ui'
import AdminPageHeader from '@/components/admin-page-header'
import AdminBookingCalendar from '@/components/admin-booking-calendar'
import AdminRawPhotoQueue from '@/components/admin-raw-photo-queue'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { useAdminToast } from '@/components/admin-toast-provider'
import { isPlaceholderCustomerEmail } from '@/lib/customer-email'

function formatDayFolderLabel(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString('en-PH', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export type FilteringDashTab = 'overview' | 'queue' | 'calendar' | 'editor'

type Props = {
  initialSearch?: string
  initialTab?: FilteringDashTab
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function workflowBookings(bookings: Booking[]) {
  return bookings.filter(
    (b) =>
      b.bookingStatus !== 'Cancelled' &&
      (isRawPhotoWorkflowBooking(b) ||
        b.bookingStatus === 'Confirmed' ||
        b.bookingStatus === 'Completed'),
  )
}

export default function FilteringDashboard({ initialSearch = '', initialTab }: Props) {
  const toast = useAdminToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<FilteringDashTab>(
    initialTab || (initialSearch ? 'queue' : 'overview'),
  )
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [editorSearch, setEditorSearch] = useState('')
  const [queueSearch, setQueueSearch] = useState(initialSearch)

  const fetchData = async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await getBookings()
      setBookings(data)
    } catch (err) {
      console.error(err)
      if (!silent) toast.error('Sync failed', 'Could not load filtering dashboard data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData(true)
  }, [])

  useOnAdminDbSync(() => fetchData(true))

  const pipeline = useMemo(() => {
    const relevant = workflowBookings(bookings)
    const counts: Record<RawPhotoWorkflowStatus, number> = {
      awaiting_gallery: 0,
      awaiting_selection: 0,
      pending_review: 0,
      approved: 0,
      delivered: 0,
      rejected: 0,
    }
    for (const b of relevant) {
      const status = getRawPhotoWorkflowStatus(b)
      if (status) counts[status]++
    }
    return {
      relevant,
      counts,
      pendingReview: countPendingRawPhotoReviews(bookings),
      submitted: bookings.filter(hasRawPhotoSubmission).length,
      awaitingEdit: counts.approved,
    }
  }, [bookings])

  const calendarBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.bookingStatus !== 'Cancelled' &&
          (b.bookingStatus === 'Confirmed' ||
            b.bookingStatus === 'Completed' ||
            hasRawPhotoSubmission(b) ||
            Boolean(b.driveLink) ||
            Boolean(b.editedPhotoLink)),
      ),
    [bookings],
  )

  const dayBookings = useMemo(
    () =>
      sortBookingsByDayPriority(
        calendarBookings.filter((b) => b.bookingDate === selectedDate),
      ),
    [calendarBookings, selectedDate],
  )

  const dayPriorityMap = useMemo(
    () => buildDayPriorityMap(calendarBookings),
    [calendarBookings],
  )

  const editorQueue = useMemo(() => {
    const approved = bookings
      .filter((b) => b.rawPhotoStatus === 'Approved' && hasRawPhotoSubmission(b))
      .sort((a, b) => {
        // Undelivered first, then newest submitted
        const aDone = a.editedPhotoLink ? 1 : 0
        const bDone = b.editedPhotoLink ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        const aTime = a.rawPhotoSubmittedAt ? new Date(a.rawPhotoSubmittedAt).getTime() : 0
        const bTime = b.rawPhotoSubmittedAt ? new Date(b.rawPhotoSubmittedAt).getTime() : 0
        return bTime - aTime
      })

    const term = editorSearch.trim().toLowerCase()
    if (!term) return approved
    return approved.filter(
      (b) =>
        b.id.toLowerCase().includes(term) ||
        b.customerName.toLowerCase().includes(term) ||
        b.customerEmail.toLowerCase().includes(term) ||
        (b.packageName || '').toLowerCase().includes(term),
    )
  }, [bookings, editorSearch])

  const tabs: { id: FilteringDashTab; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'queue', label: 'Review Queue', icon: ListChecks, count: pipeline.pendingReview },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'editor', label: 'Editor', icon: PenTool, count: pipeline.awaitingEdit },
  ]

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
        title="Filtering Dashboard"
        subtitle="Gallery → client 5-pick → review → editor delivery. Track every booking through the post-shoot pipeline."
        onRefresh={() => fetchData()}
        refreshing={refreshing}
      >
        <Link
          href="/admin/bookings"
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 ${adminBtnGhost}`}
        >
          All Bookings <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </AdminPageHeader>

      <div className={`${adminCard} p-1.5 flex gap-1 overflow-x-auto`}>
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap flex items-center gap-2 ${
                isActive
                  ? 'bg-primary text-white shadow-[0_0_20px_rgba(5,0,208,0.25)]'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span
                  className={`min-w-[1.25rem] text-center text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : tab.id === 'queue'
                        ? 'bg-amber-500/25 text-amber-300'
                        : 'bg-white/10 text-white/65'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          counts={pipeline.counts}
          pendingReview={pipeline.pendingReview}
          submitted={pipeline.submitted}
          relevant={pipeline.relevant}
          onOpenTab={setActiveTab}
        />
      )}

      {activeTab === 'queue' && (
        <AdminRawPhotoQueue key={queueSearch || 'queue'} initialSearch={queueSearch} embedded />
      )}

      {activeTab === 'calendar' && (
        <div className="grid xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] gap-6 items-start">
          <div className="xl:sticky xl:top-4">
            <AdminBookingCalendar
              bookings={calendarBookings}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </div>
          <FilteringDaySessions
            bookings={dayBookings}
            date={selectedDate}
            priorityMap={dayPriorityMap}
            maxPriority={getDayPriorityCount(calendarBookings, selectedDate)}
            onReview={(id) => {
              setQueueSearch(id)
              setActiveTab('queue')
            }}
          />
        </div>
      )}

      {activeTab === 'editor' && (
        <EditorTab
          bookings={editorQueue}
          allBookings={bookings}
          search={editorSearch}
          onSearchChange={setEditorSearch}
          awaitingEdit={pipeline.awaitingEdit}
          delivered={pipeline.counts.delivered}
          onDelivered={() => fetchData(true)}
          onOpenReviewQueue={(id) => {
            setQueueSearch(id)
            setActiveTab('queue')
          }}
        />
      )}
    </div>
  )
}

function OverviewTab({
  counts,
  pendingReview,
  submitted,
  relevant,
  onOpenTab,
}: {
  counts: Record<RawPhotoWorkflowStatus, number>
  pendingReview: number
  submitted: number
  relevant: Booking[]
  onOpenTab: (tab: FilteringDashTab) => void
}) {
  const kpis = [
    {
      label: 'Awaiting Gallery',
      value: counts.awaiting_gallery,
      desc: 'Confirmed — needs Drive gallery link',
      accent: 'text-white/70 border-white/20 bg-white/5',
      icon: Upload,
      tab: 'calendar' as FilteringDashTab,
    },
    {
      label: 'Awaiting Selection',
      value: counts.awaiting_selection,
      desc: 'Gallery sent — waiting on client picks',
      accent: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
      icon: FolderOpen,
      tab: 'calendar' as FilteringDashTab,
    },
    {
      label: 'Pending Review',
      value: pendingReview,
      desc: '5-pick folders waiting for staff',
      accent: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      icon: Clock,
      tab: 'queue' as FilteringDashTab,
    },
    {
      label: 'Ready for Editor',
      value: counts.approved,
      desc: 'Approved — waiting for edited Drive link',
      accent: 'text-green-400 border-green-500/30 bg-green-500/10',
      icon: PenTool,
      tab: 'editor' as FilteringDashTab,
    },
  ]

  const pipelineTotal = Math.max(
    1,
    (Object.keys(counts) as RawPhotoWorkflowStatus[]).reduce((sum, s) => sum + counts[s], 0),
  )

  const recentPending = relevant
    .filter((b) => getRawPhotoWorkflowStatus(b) === 'pending_review')
    .sort((a, b) => {
      const aT = a.rawPhotoSubmittedAt ? new Date(a.rawPhotoSubmittedAt).getTime() : 0
      const bT = b.rawPhotoSubmittedAt ? new Date(b.rawPhotoSubmittedAt).getTime() : 0
      return bT - aT
    })
    .slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          const hot = kpi.value > 0 && (kpi.label === 'Pending Review' || kpi.label === 'Ready for Editor')
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={() => onOpenTab(kpi.tab)}
              className={`${adminCard} ${adminCardHover} p-5 text-left group relative overflow-hidden`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${hot ? 'bg-primary' : 'bg-white/15'}`} />
              <div className="flex items-start justify-between gap-3 pl-1">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase">{kpi.label}</p>
                  <p className="text-3xl font-bold text-white mt-2 tabular-nums tracking-tight">{kpi.value}</p>
                  <p className="text-[11px] text-white/45 mt-1.5 leading-snug">{kpi.desc}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mt-3 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
                    Open <ArrowRight className="w-3 h-3" />
                  </p>
                </div>
                <div className={`p-2.5 rounded-lg border ${kpi.accent}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className={`${adminPanel} p-5`}>
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Pipeline</p>
              <p className="text-sm font-semibold text-white mt-0.5">
                {relevant.length} active · {submitted} submitted
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenTab('queue')}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
            >
              Open queue <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3.5">
            {(Object.keys(counts) as RawPhotoWorkflowStatus[]).map((status) => {
              const pct = Math.round((counts[status] / pipelineTotal) * 100)
              return (
                <div key={status} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase border ${rawPhotoStatusBadge(status)}`}>
                      {rawPhotoWorkflowLabel(status)}
                    </span>
                    <span className="text-sm font-semibold text-white tabular-nums">{counts[status]}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className={`${adminPanel} flex flex-col`}>
          <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Needs review</p>
              <p className="text-sm font-semibold text-white mt-0.5">Latest 5-pick submissions</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenTab('queue')}
              className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
            >
              View all
            </button>
          </div>
          {recentPending.length === 0 ? (
            <div className={`${adminEmptyState} m-5 border-none bg-transparent flex-1`}>
              <CheckCircle className="w-8 h-8 text-green-400/50" />
              <p className="text-sm text-white/60">Queue is clear</p>
              <p className="text-[11px] text-white/35">New client submissions will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {recentPending.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onOpenTab('queue')}
                  className="w-full flex items-center justify-between gap-4 p-4 hover:bg-white/[0.03] text-left transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{b.customerName}</p>
                    <p className="text-[11px] text-white/40 mt-1">
                      {b.bookingDate} · {b.packageName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-mono text-[10px] text-primary">{b.id}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300/80">Review</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilteringDaySessions({
  bookings,
  date,
  priorityMap,
  maxPriority,
  onReview,
}: {
  bookings: Booking[]
  date: string
  priorityMap: Map<string, number>
  maxPriority: number
  onReview: (bookingId: string) => void
}) {
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
          <CalendarDays className="w-6 h-6 text-primary/70" />
          <p className="text-sm font-medium text-white/70">Select a date</p>
          <p className="text-xs text-white/40 max-w-xs">
            Pick a shoot day to see booking filtering status.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${adminPanel} flex flex-col`}>
      <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] text-white/40 uppercase">Filtering by day</p>
          <p className="text-sm font-semibold text-white mt-0.5">{label}</p>
        </div>
        <Link
          href={`/admin/bookings?date=${date}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
        >
          Open bookings <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[480px]">
        {bookings.length === 0 ? (
          <div className={`${adminEmptyState} m-5 border-none bg-transparent`}>
            <ImageIcon className="w-5 h-5 text-white/30" />
            <p className="text-sm font-medium text-white/60">No sessions on this date</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {bookings.map((b) => {
              const workflow = getRawPhotoWorkflowStatus(b)
              return (
                <div key={b.id} className="p-4 space-y-3 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                      <BookingPrioritySelect
                        priority={priorityMap.get(b.id) ?? null}
                        maxPriority={maxPriority}
                        className="shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{b.customerName}</p>
                        <p className="text-[11px] text-white/40 mt-1">
                          {b.bookingTime} · {b.packageName}
                        </p>
                        <Link
                          href={`/admin/bookings?search=${encodeURIComponent(b.id)}`}
                          className="font-mono text-[10px] text-primary hover:underline mt-1 inline-block"
                        >
                          {b.id}
                        </Link>
                      </div>
                    </div>
                    {workflow && (
                      <span className={`px-2 py-0.5 text-[8px] font-bold uppercase border shrink-0 ${rawPhotoStatusBadge(workflow)}`}>
                        {rawPhotoWorkflowLabel(workflow)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/bookings?search=${encodeURIComponent(b.id)}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase tracking-wider text-white/70"
                    >
                      Booking
                    </Link>
                    {b.driveLink && (
                      <a
                        href={b.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase tracking-wider text-white/70"
                      >
                        Gallery <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {hasRawPhotoSubmission(b) && (
                      <>
                        <a
                          href={b.rawPhotoLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-primary/30 bg-primary/10 hover:bg-primary/20 text-[9px] font-bold uppercase tracking-wider text-primary"
                        >
                          5 picks <ExternalLink className="w-3 h-3" />
                        </a>
                        {(b.rawPhotoStatus || 'Pending Review') === 'Pending Review' && (
                          <button
                            type="button"
                            onClick={() => onReview(b.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-[9px] font-bold uppercase tracking-wider text-amber-300"
                          >
                            Review
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {bookings.length > 0 && (
        <div className="p-3.5 border-t border-white/[0.08] text-[11px] text-white/40 text-center bg-white/[0.02]">
          {bookings.length} session{bookings.length === 1 ? '' : 's'} · filtering status by booking
        </div>
      )}
    </div>
  )
}

function EditorTab({
  bookings,
  allBookings,
  search,
  onSearchChange,
  awaitingEdit,
  delivered,
  onDelivered,
  onOpenReviewQueue,
}: {
  bookings: Booking[]
  allBookings: Booking[]
  search: string
  onSearchChange: (value: string) => void
  awaitingEdit: number
  delivered: number
  onDelivered: () => void
  onOpenReviewQueue: (bookingId: string) => void
}) {
  const toast = useAdminToast()
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({})
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'todo' | 'done' | 'all' | 'overdue'>('todo')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [autoOpenedToday, setAutoOpenedToday] = useState(false)

  const visible = bookings.filter((b) => {
    const deadline = getEditorDeadlineInfo(b)
    if (filter === 'todo') return !b.editedPhotoLink
    if (filter === 'done') return Boolean(b.editedPhotoLink)
    if (filter === 'overdue') return deadline.overdue
    return true
  })

  const dayFolders = useMemo(() => {
    const map = new Map<string, { total: number; todo: number; overdue: number }>()
    for (const b of visible) {
      const day = getEditorFolderDayKey(b)
      const cur = map.get(day) || { total: 0, todo: 0, overdue: 0 }
      cur.total += 1
      if (!b.editedPhotoLink) cur.todo += 1
      if (getEditorDeadlineInfo(b).overdue) cur.overdue += 1
      map.set(day, cur)
    }
    return Array.from(map.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return b.overdue - a.overdue
        if (a.todo !== b.todo) return b.todo - a.todo
        return b.date.localeCompare(a.date)
      })
  }, [visible])

  const term = search.trim().toLowerCase()
  const pendingMatch = useMemo(() => {
    if (!term) return null
    return (
      allBookings.find(
        (b) =>
          isPendingRawPhotoReview(b) &&
          (b.id.toLowerCase().includes(term) ||
            b.customerName.toLowerCase().includes(term) ||
            b.customerEmail.toLowerCase().includes(term)),
      ) || null
    )
  }, [allBookings, term])

  // When searching, jump straight into the matching shoot-day folder(s).
  useEffect(() => {
    if (!term || visible.length === 0) return
    const days = [...new Set(visible.map((b) => getEditorFolderDayKey(b)))]
    if (days.length === 1) setSelectedDay(days[0])
  }, [term, visible])

  useEffect(() => {
    if (autoOpenedToday || selectedDay || dayFolders.length === 0 || term) return
    const today = todayKey()
    const todayFolder = dayFolders.find((f) => f.date === today && f.todo > 0)
    if (todayFolder) setSelectedDay(today)
    setAutoOpenedToday(true)
  }, [dayFolders, selectedDay, autoOpenedToday, term])

  const dayBookings = useMemo(() => {
    if (!selectedDay) return []
    return visible
      .filter((b) => getEditorFolderDayKey(b) === selectedDay)
      .sort((a, b) => {
        const aOver = getEditorDeadlineInfo(a).overdue ? 1 : 0
        const bOver = getEditorDeadlineInfo(b).overdue ? 1 : 0
        if (aOver !== bOver) return bOver - aOver
        const aStart = getEditorDeadlineInfo(a).start?.getTime() ?? 0
        const bStart = getEditorDeadlineInfo(b).start?.getTime() ?? 0
        return bStart - aStart
      })
  }, [visible, selectedDay])

  const dayFolderStats = useMemo(() => {
    let todo = 0
    let overdue = 0
    for (const b of dayBookings) {
      if (!b.editedPhotoLink) todo += 1
      if (getEditorDeadlineInfo(b).overdue) overdue += 1
    }
    return { todo, overdue }
  }, [dayBookings])

  const overdueCount = useMemo(
    () => bookings.filter((b) => getEditorDeadlineInfo(b).overdue).length,
    [bookings],
  )

  const deliver = async (booking: Booking, sendEmailFlag: boolean) => {
    const link = (linkDrafts[booking.id] ?? booking.editedPhotoLink ?? '').trim()
    const emailDraft = (
      emailDrafts[booking.id] ??
      (isPlaceholderCustomerEmail(booking.customerEmail) ? '' : booking.customerEmail)
    ).trim()
    const deadline = getEditorDeadlineInfo(booking)

    if (!link) {
      toast.warning('Drive link required', 'Paste the Google Drive folder of the edited photos.')
      return
    }
    if (!link.startsWith('https://drive.google.com/')) {
      toast.warning('Invalid link', 'Use a Google Drive link (https://drive.google.com/...).')
      return
    }
    if (sendEmailFlag) {
      if (!emailDraft || !emailDraft.includes('@') || isPlaceholderCustomerEmail(emailDraft)) {
        toast.warning('Client email required', 'Enter the client email before sending edited photos.')
        return
      }
      if (deadline.overdue) {
        const ok = window.confirm(
          `${booking.id} is past the ${EDITOR_DEADLINE_DAYS} working-day edit deadline. Send the client email anyway?`,
        )
        if (!ok) return
      }
    }

    setSavingId(booking.id)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/deliver-edited-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editedPhotoLink: link,
          sendEmail: sendEmailFlag,
          customerName: booking.customerName,
          customerEmail: emailDraft || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to deliver edited photos.')

      if (Array.isArray(data.emailErrors) && data.emailErrors.length > 0) {
        toast.warning('Saved — email issue', data.emailErrors.join(' · '))
      } else if (sendEmailFlag) {
        toast.success('Edited photos delivered', `${booking.id} emailed to ${emailDraft}.`)
      } else {
        toast.success('Link saved', `${booking.id} edited Drive link saved (no email).`)
      }
      onDelivered()
    } catch (err) {
      toast.error('Delivery failed', err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className={`${adminPanel} p-4 space-y-4`}>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, email, or booking ID…"
            className={`${adminInput} pl-11`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            {awaitingEdit} to edit
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            {delivered} delivered
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
            {EDITOR_DEADLINE_DAYS} working-day deadline
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
              {overdueCount} overdue
            </span>
          )}
        </div>

        {pendingMatch && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-200">
                {pendingMatch.id} is waiting in Review Queue
              </p>
              <p className="text-[11px] text-amber-200/70 mt-0.5">
                Shoot {pendingMatch.bookingDate}. Approve the 5-pick first — then it appears in the{' '}
                {pendingMatch.bookingDate} shoot-day folder here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenReviewQueue(pendingMatch.id)}
              className={`shrink-0 ${adminBtnPrimary}`}
            >
              Open Review Queue
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-black/30 border border-white/[0.06]">
          {(
            [
              ['todo', 'To edit'],
              ['overdue', 'Overdue'],
              ['done', 'Delivered'],
              ['all', 'All'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFilter(id)
                setSelectedDay(null)
                setAutoOpenedToday(false)
              }}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${
                filter === id
                  ? 'bg-primary text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!selectedDay ? (
        dayFolders.length === 0 ? (
          <div className={`${adminEmptyState} p-16`}>
            <div className="relative mb-2">
              <div className="absolute -top-1 left-3 h-2.5 w-10 rounded-t-md bg-white/10" />
              <Folder className="relative w-10 h-10 text-white/25" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              {filter === 'todo' ? 'No jobs waiting' : 'Nothing here'}
            </h3>
            <p className="text-xs text-white/40 max-w-md">
              Approved 5-picks are grouped by shoot day. The {EDITOR_DEADLINE_DAYS} working-day edit
              clock starts the day after the shoot — or from approval if the client submits late, so
              editors always get the full window.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Shoot-day folders
                </p>
                <p className="text-xs text-white/30 mt-1">
                  Open a day to edit and deliver jobs from that shoot.
                </p>
              </div>
              <p className="text-[10px] font-mono text-white/35 tabular-nums shrink-0">
                {dayFolders.length} folder{dayFolders.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {dayFolders.map((folder) => {
                const isToday = folder.date === todayKey()
                const done = folder.total - folder.todo
                const progress = folder.total > 0 ? Math.round((done / folder.total) * 100) : 0
                const dayNum = folder.date.slice(8, 10)
                const monthLabel = (() => {
                  const d = new Date(`${folder.date}T12:00:00`)
                  if (Number.isNaN(d.getTime())) return ''
                  return d.toLocaleDateString('en-PH', { month: 'short' }).toUpperCase()
                })()
                const weekday = (() => {
                  const d = new Date(`${folder.date}T12:00:00`)
                  if (Number.isNaN(d.getTime())) return ''
                  return d.toLocaleDateString('en-PH', { weekday: 'long' })
                })()
                const tone =
                  folder.overdue > 0
                    ? {
                        tab: 'bg-red-500/25 border-red-500/35',
                        icon: 'text-red-300',
                        bar: 'bg-red-400',
                        ring: 'hover:border-red-500/40 focus-visible:ring-red-500/40',
                      }
                    : folder.todo > 0
                      ? {
                          tab: 'bg-amber-500/20 border-amber-500/30',
                          icon: 'text-amber-300',
                          bar: 'bg-primary',
                          ring: 'hover:border-amber-500/35 focus-visible:ring-primary/40',
                        }
                      : {
                          tab: 'bg-emerald-500/20 border-emerald-500/30',
                          icon: 'text-emerald-300',
                          bar: 'bg-emerald-400',
                          ring: 'hover:border-emerald-500/35 focus-visible:ring-emerald-500/30',
                        }

                return (
                  <button
                    key={folder.date}
                    type="button"
                    onClick={() => setSelectedDay(folder.date)}
                    className={`group relative text-left outline-none focus-visible:ring-2 ${tone.ring}`}
                  >
                    {/* Folder tab */}
                    <div
                      className={`relative z-10 ml-3 inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1 ${tone.tab}`}
                    >
                      <FolderOpen className={`w-3 h-3 ${tone.icon}`} />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/70">
                        {monthLabel}
                      </span>
                      {isToday && (
                        <span className="text-[8px] font-bold uppercase tracking-wider text-primary">
                          Today
                        </span>
                      )}
                    </div>

                    {/* Folder body */}
                    <div
                      className={`relative -mt-px rounded-xl rounded-tl-none border border-white/10 bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent p-4 pt-3.5 transition-all duration-300 group-hover:border-white/20 group-hover:bg-white/[0.05] group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${
                        folder.overdue > 0
                          ? 'border-red-500/25'
                          : isToday
                            ? 'border-primary/30'
                            : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-semibold tabular-nums tracking-tight text-white leading-none">
                              {dayNum}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{weekday}</p>
                              <p className="text-[10px] font-mono text-white/40 mt-0.5">{folder.date}</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xl font-bold tabular-nums text-white leading-none">{folder.total}</p>
                          <p className="text-[9px] uppercase tracking-wider text-white/35 mt-1">
                            job{folder.total === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-white/40">
                          <span>
                            {done}/{folder.total} delivered
                          </span>
                          <span className="tabular-nums">{progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/[0.06]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5 text-[9px] font-bold uppercase tracking-wider">
                          {folder.todo > 0 && (
                            <span className="px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300">
                              {folder.todo} to edit
                            </span>
                          )}
                          {folder.overdue > 0 && (
                            <span className="px-2 py-0.5 rounded-md border border-red-500/30 bg-red-500/10 text-red-300">
                              {folder.overdue} overdue
                            </span>
                          )}
                          {folder.todo === 0 && (
                            <span className="px-2 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                              Complete
                            </span>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-white/35 group-hover:text-white/70 transition-colors shrink-0">
                          Open <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent">
            <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ${adminBtnGhost}`}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Folders
              </button>
              <span className="text-white/25">/</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <FolderOpen className="w-3.5 h-3.5 text-primary" />
                {formatDayFolderLabel(selectedDay)}
              </span>
              {selectedDay === todayKey() && (
                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                  Today
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Shoot day</p>
                <p className="text-sm font-semibold text-white mt-0.5 font-mono">{selectedDay}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
                  {dayBookings.length} job{dayBookings.length === 1 ? '' : 's'}
                </span>
                {dayFolderStats.todo > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    {dayFolderStats.todo} to edit
                  </span>
                )}
                {dayFolderStats.overdue > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
                    {dayFolderStats.overdue} overdue
                  </span>
                )}
              </div>
            </div>
          </div>

          {dayBookings.length === 0 ? (
            <div className={`${adminEmptyState} p-12`}>
              <PenTool className="w-6 h-6 text-white/30" />
              <p className="text-xs text-white/40">No bookings in this folder for the current filter.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {dayBookings.map((b) => {
                const deliveredAlready = Boolean(b.editedPhotoLink)
                const draft = linkDrafts[b.id] ?? b.editedPhotoLink ?? ''
                const busy = savingId === b.id
                const deadline = getEditorDeadlineInfo(b)

                return (
                  <div
                    key={b.id}
                    className={`${adminCard} ${adminCardHover} p-5 space-y-4 ${
                      deadline.overdue && !deliveredAlready ? 'ring-1 ring-red-500/25' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3 border-b border-white/10 pb-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-white truncate">{b.customerName}</h3>
                        <Link
                          href={`/admin/bookings?search=${encodeURIComponent(b.id)}`}
                          className="text-[10px] text-primary font-mono mt-0.5 hover:underline"
                        >
                          {b.id}
                        </Link>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 uppercase rounded-md border ${
                            deliveredAlready
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-green-500/15 text-green-400 border-green-500/30'
                          }`}
                        >
                          {deliveredAlready ? 'Delivered' : 'Ready to edit'}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 uppercase rounded-md border ${
                            deadline.delivered
                              ? 'border-white/10 text-white/40'
                              : deadline.overdue
                                ? 'border-red-500/40 bg-red-500/15 text-red-300'
                                : (deadline.daysLeft ?? 99) <= 3
                                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                                  : 'border-white/15 text-white/55'
                          }`}
                        >
                          {deadline.label}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Approved</p>
                        <p className="text-white/80 mt-1 font-mono text-[10px] leading-snug">
                          {b.rawPhotoApprovedAt
                            ? new Date(b.rawPhotoApprovedAt).toLocaleString('en-PH', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Deadline</p>
                        <p
                          className={`mt-1 text-[10px] leading-snug ${
                            deadline.overdue ? 'text-red-300 font-semibold' : 'text-white/80'
                          }`}
                        >
                          {deadline.end
                            ? deadline.end.toLocaleDateString('en-PH', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/[0.08] bg-black/20 p-2.5 col-span-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Shoot · Package</p>
                        <p className="text-white/80 mt-1 text-[11px] leading-snug">
                          {b.bookingDate} · {b.bookingTime}
                          <span className="text-white/40"> · </span>
                          {b.packageName}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={b.rawPhotoLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider ${adminBtnPrimary}`}
                      >
                        Open 5-pick folder <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {b.driveLink && (
                        <a
                          href={b.driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider ${adminBtnGhost}`}
                        >
                          Full gallery <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-white/10 pt-3">
                      <label className="text-[10px] font-bold tracking-widest text-[#C4CEFF] uppercase">
                        Client email
                      </label>
                      <input
                        type="email"
                        value={
                          emailDrafts[b.id] ??
                          (isPlaceholderCustomerEmail(b.customerEmail) ? '' : b.customerEmail)
                        }
                        onChange={(e) =>
                          setEmailDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))
                        }
                        placeholder="client@email.com"
                        className={adminInput}
                      />

                      <label className="text-[10px] font-bold tracking-widest text-[#C4CEFF] uppercase">
                        Edited photos Drive link
                      </label>
                      <input
                        type="url"
                        value={draft}
                        onChange={(e) =>
                          setLinkDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))
                        }
                        placeholder="https://drive.google.com/drive/folders/..."
                        className={adminInput}
                      />
                      {deadline.overdue && !deliveredAlready && (
                        <p className="text-[10px] text-red-300">
                          Past the {EDITOR_DEADLINE_DAYS} working-day edit window — finish and deliver ASAP.
                        </p>
                      )}
                      <div className="flex flex-col gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deliver(b, true)}
                          className="w-full rounded-lg bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase tracking-wider py-2.5 disabled:opacity-50 transition-colors"
                        >
                          {busy
                            ? 'Saving…'
                            : deliveredAlready
                              ? 'Update & Re-email Client'
                              : 'Save & Email Client'}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deliver(b, false)}
                          className={`w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${adminBtnGhost}`}
                        >
                          Save link only
                        </button>
                      </div>
                      {b.editedPhotoLink && (
                        <a
                          href={b.editedPhotoLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-300 hover:underline pt-1"
                        >
                          Open delivered folder <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
