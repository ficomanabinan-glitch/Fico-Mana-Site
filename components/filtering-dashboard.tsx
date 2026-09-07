'use client'



import EditorQueue from '@/components/editor-queue'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle,
  Clock,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  PenTool,
  Upload,
} from 'lucide-react'
import { getBookings, type Booking } from '@/lib/data-store'
import { fetchManagedPackages } from '@/lib/package-manager-cache'
import { usesGraduationWorkflow } from '@/lib/package-workflow'
import {
  getRawPhotoWorkflowStatus,
  isRawPhotoWorkflowBooking,
  rawPhotoWorkflowLabel,
  type RawPhotoWorkflowStatus,
} from '@/lib/booking-display'
import { buildDayPriorityMap, getDayPriorityCount, sortBookingsByDayPriority } from '@/lib/booking-priority'
import { countPendingRawPhotoReviews, hasRawPhotoSubmission } from '@/lib/raw-photo-display'
import BookingPrioritySelect from '@/components/booking-priority-select'
import {
  adminBtnGhost,
  adminCard,
  adminCardHover,
  adminEmptyState,
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
  const [queueSearch, setQueueSearch] = useState(initialSearch)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const [data, packages] = await Promise.all([getBookings(), fetchManagedPackages()])
      const eligibleIds = new Set(packages.filter(pkg => usesGraduationWorkflow(pkg.category)).map(pkg => pkg.id))
      setBookings(data.filter(booking => eligibleIds.has(booking.packageId)))
    } catch (err) {
      console.error(err)
      if (!silent) toast.error('Sync failed', 'Could not load filtering dashboard data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData(true)
  }, [fetchData])

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
        subtitle="Review photo selections and check editing progress."
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
              className={`px-3.5 py-2.5 text-caption font-semibold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap flex items-center gap-2 ${
                isActive
                  ? 'bg-primary text-white shadow-[0_0_20px_rgba(5,0,208,0.25)]'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span
                  className={`min-w-[1.25rem] text-center text-caption px-1.5 py-0.5 rounded-md font-bold ${
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
        <EditorQueue />
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
                  <p className="text-caption font-semibold tracking-label text-white/40 uppercase">{kpi.label}</p>
                  <p className="text-3xl font-bold text-white mt-2 tabular-nums tracking-tight">{kpi.value}</p>
                  <p className="text-caption text-white/45 mt-1.5 leading-snug">{kpi.desc}</p>
                  <p className="text-caption font-semibold uppercase tracking-wider text-primary/80 mt-3 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1">
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
              <p className="text-caption font-semibold tracking-label text-white/40 uppercase">Pipeline</p>
              <p className="text-sm font-semibold text-white mt-0.5">
                {relevant.length} active · {submitted} submitted
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenTab('queue')}
              className="text-caption font-semibold uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
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
                    <span className={`px-2 py-0.5 text-caption font-semibold uppercase border ${rawPhotoStatusBadge(status)}`}>
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
              <p className="text-caption font-semibold tracking-label text-white/40 uppercase">Needs review</p>
              <p className="text-sm font-semibold text-white mt-0.5">Latest 5-pick submissions</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenTab('queue')}
              className="text-caption font-semibold uppercase tracking-wider text-primary hover:underline"
            >
              View all
            </button>
          </div>
          {recentPending.length === 0 ? (
            <div className={`${adminEmptyState} m-5 border-none bg-transparent flex-1`}>
              <CheckCircle className="w-8 h-8 text-green-400/50" />
              <p className="text-sm text-white/60">Queue is clear</p>
              <p className="text-caption text-white/35">New client submissions will show up here.</p>
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
                    <p className="text-caption text-white/40 mt-1">
                      {b.bookingDate} · {b.packageName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-mono text-caption text-primary">{b.id}</span>
                    <span className="text-caption font-semibold uppercase tracking-wider text-amber-300/80">Review</span>
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
          <p className="text-caption font-semibold tracking-label text-white/40 uppercase">Filtering by day</p>
          <p className="text-sm font-semibold text-white mt-0.5">{label}</p>
        </div>
        <Link
          href={`/admin/bookings?date=${date}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-caption font-semibold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors"
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
                        <p className="text-caption text-white/40 mt-1">
                          {b.bookingTime} · {b.packageName}
                        </p>
                        <Link
                          href={`/admin/bookings?search=${encodeURIComponent(b.id)}`}
                          className="font-mono text-caption text-primary hover:underline mt-1 inline-block"
                        >
                          {b.id}
                        </Link>
                      </div>
                    </div>
                    {workflow && (
                      <span className={`px-2 py-0.5 text-caption font-semibold uppercase border shrink-0 ${rawPhotoStatusBadge(workflow)}`}>
                        {rawPhotoWorkflowLabel(workflow)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/bookings?search=${encodeURIComponent(b.id)}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-caption font-semibold uppercase tracking-wider text-white/70"
                    >
                      Booking
                    </Link>
                    {b.driveLink && (
                      <a
                        href={b.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-caption font-semibold uppercase tracking-wider text-white/70"
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
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-primary/30 bg-primary/10 hover:bg-primary/20 text-caption font-semibold uppercase tracking-wider text-primary"
                        >
                          5 picks <ExternalLink className="w-3 h-3" />
                        </a>
                        {(b.rawPhotoStatus || 'Pending Review') === 'Pending Review' && (
                          <button
                            type="button"
                            onClick={() => onReview(b.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-caption font-semibold uppercase tracking-wider text-amber-300"
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
        <div className="p-3.5 border-t border-white/[0.08] text-caption text-white/40 text-center bg-white/[0.02]">
          {bookings.length} session{bookings.length === 1 ? '' : 's'} · filtering status by booking
        </div>
      )}
    </div>
  )
}
