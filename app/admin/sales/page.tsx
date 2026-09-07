'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  BarChart3,
  Banknote,
  BriefcaseBusiness,
  Calculator,
  Crosshair,
  ReceiptText,
  Save,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import {
  adminBtnPrimary,
  adminCard,
  adminInput,
  adminLabel,
  adminPage,
  adminPanel,
  adminSelect,
} from '@/lib/admin-ui'
import {
  fetchSales,
  getCachedSales,
  getRememberedSalesView,
  isSalesCacheFresh,
  rememberSalesView,
  SALES_DATA_CHANGED_EVENT,
  salesCacheKey,
  type SalesPeriod as Period,
  type SalesSummaryPayload as Payload,
  type SalesTrendPoint as TrendPoint,
} from '@/lib/sales-read-cache'

function peso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}

function studioDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

const DEFAULT_ANCHOR = studioDateKey()

function SalesBodySkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading sales data">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {['revenue', 'collected', 'outstanding', 'profit', 'average', 'shoots'].map((key) => (
          <div key={key} className={`${adminCard} h-[118px] p-5`}>
            <div className="h-3 w-24 rounded bg-white/[0.08]" />
            <div className="mt-4 h-7 w-28 rounded bg-white/[0.08]" />
            <div className="mt-3 h-3 w-36 rounded bg-white/[0.06]" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-12">
        <div className={`${adminPanel} h-[300px] p-5 xl:col-span-7`} />
        <div className={`${adminPanel} h-[300px] p-5 xl:col-span-5`} />
      </div>
      <div className={`${adminPanel} h-[380px] p-5`} />
    </div>
  )
}

export default function SalesManagementPage() {
  const toast = useAdminToast()
  const initialView = useRef(getRememberedSalesView() ?? { period: 'month' as Period, anchor: DEFAULT_ANCHOR }).current
  const initialData = useRef(getCachedSales(initialView.period, initialView.anchor)).current
  const [period, setPeriod] = useState<Period>(initialView.period)
  const [anchor, setAnchor] = useState(initialView.anchor)
  const [data, setData] = useState<Payload | null>(initialData)
  const [loading, setLoading] = useState(initialData === null)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const hasDataRef = useRef(data !== null)
  const activeRequestKeyRef = useRef('')
  const [targets, setTargets] = useState({
    monthlyRevenueTarget: '',
    desiredMonthlyProfit: '',
    desiredProfitMargin: '',
  })

  const applyPayload = useCallback((body: Payload) => {
    hasDataRef.current = true
    setData(body)
    setTargets({
      monthlyRevenueTarget: String(body.settings.monthlyRevenueTarget || ''),
      desiredMonthlyProfit: String(body.settings.desiredMonthlyProfit || ''),
      desiredProfitMargin: String(body.settings.desiredProfitMargin || ''),
    })
  }, [])

  const load = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const requestKey = salesCacheKey(period, anchor)
      activeRequestKeyRef.current = requestKey
      const cached = getCachedSales(period, anchor)
      if (cached) applyPayload(cached)
      const keepExistingData = Boolean(cached || hasDataRef.current)
      setLoading(!keepExistingData)
      if (!force && cached && isSalesCacheFresh(period, anchor)) {
        setRefreshing(false)
        return
      }
      setRefreshing(keepExistingData)
      try {
        const body = await fetchSales(period, anchor, { force })
        if (activeRequestKeyRef.current === requestKey) applyPayload(body)
      } catch (error) {
        if (activeRequestKeyRef.current === requestKey) {
          toast.error('Sales data unavailable', error instanceof Error ? error.message : 'Try again.')
        }
      } finally {
        if (activeRequestKeyRef.current === requestKey) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [anchor, applyPayload, period, toast],
  )

  useEffect(() => {
    rememberSalesView(period, anchor)
    void load()
  }, [anchor, load, period])

  useEffect(() => {
    const handleSalesDataChanged = () => {
      void load({ force: true })
    }
    window.addEventListener(SALES_DATA_CHANGED_EVENT, handleSalesDataChanged)
    return () => window.removeEventListener(SALES_DATA_CHANGED_EVENT, handleSalesDataChanged)
  }, [load])

  const saveTargets = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/sales/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyRevenueTarget: Number(targets.monthlyRevenueTarget || 0),
          desiredMonthlyProfit: Number(targets.desiredMonthlyProfit || 0),
          desiredProfitMargin: Number(targets.desiredProfitMargin || 0),
        }),
      })
      if (!response.ok) throw new Error('Could not save financial targets.')
      toast.success('Financial targets saved', 'Sales planning metrics were recalculated.')
      await load({ force: true })
    } catch (error) {
      toast.error('Could not save targets', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSaving(false)
    }
  }

  const pageHeader = (
    <AdminPageHeader
      title="Sales Management"
      subtitle="Track sales, expenses, and profit."
      onRefresh={() => void load({ force: true })}
      refreshing={refreshing}
    >
      <div className="flex flex-wrap gap-2">
        <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className={`${adminSelect} !w-auto min-w-28`}>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
          <option value="year">Year</option>
        </select>
        <input type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} className={`${adminInput} !w-auto`} />
      </div>
    </AdminPageHeader>
  )

  if (loading || !data) {
    return (
      <div className={adminPage}>
        {pageHeader}
        <SalesBodySkeleton />
      </div>
    )
  }

  const s = data.summary
  const metrics = [
    { label: 'Booked Sales', value: peso(s.bookedSales), detail: `${s.totalBookings} valid bookings`, icon: TrendingUp },
    { label: 'Cash Collected', value: peso(s.cashCollected), detail: 'Verified payments', icon: Banknote },
    { label: 'Outstanding', value: peso(s.outstandingReceivables), detail: 'Remaining client receivables', icon: WalletCards },
    { label: 'Net Profit', value: peso(s.netProfit), detail: `${s.profitMargin.toFixed(1)}% actual margin`, icon: BarChart3 },
    { label: 'Average Booking', value: peso(s.averageBookingValue), detail: 'Average valid booking value', icon: BriefcaseBusiness },
    { label: 'More Shoots Needed', value: s.bookingsNeeded === null ? '—' : String(s.bookingsNeeded), detail: `To reach ${peso(s.revenueGoal)}`, icon: Crosshair },
  ]

  return (
    <div className={adminPage}>
      {pageHeader}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <div key={metric.label} className={`${adminCard} flex items-start gap-4 p-5`}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-[#C4CEFF]">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-caption font-semibold uppercase tracking-label text-white/35">{metric.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">{metric.value}</p>
                <p className="mt-1 text-caption text-white/40">{metric.detail}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className={`xl:col-span-7 ${adminPanel} p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-caption font-semibold uppercase tracking-label text-white/35">Revenue goal</p>
              <h2 className="mt-1 text-lg font-semibold">{peso(s.bookedSales)} of {peso(s.revenueGoal)}</h2>
            </div>
            <Target className="size-5 text-[#C4CEFF]" />
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(0, Math.min(100, s.revenueGoalProgress))}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Insight label="Progress" value={`${s.revenueGoalProgress.toFixed(1)}%`} />
            <Insight label="Revenue Remaining" value={peso(s.remainingRevenueTarget)} />
            <Insight label="Bookings Remaining" value={s.bookingsNeeded === null ? 'Unavailable' : String(s.bookingsNeeded)} />
          </div>
          <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
            <Insight label="Contribution / Booking" value={peso(s.contributionPerBooking)} />
            <Insight label="Break-even Bookings" value={s.breakEvenBookings === null ? 'Unavailable' : String(s.breakEvenBookings)} />
            <Insight label="Desired Profit Bookings" value={s.desiredProfitBookings === null ? 'Unavailable' : String(s.desiredProfitBookings)} />
          </div>
        </section>

        <section className={`xl:col-span-5 ${adminPanel} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-caption font-semibold uppercase tracking-label text-white/35">Business expense impact</p>
              <h2 className="mt-1 text-lg font-semibold">{peso(s.totalExpenses)} total</h2>
            </div>
            <ReceiptText className="size-5 text-[#C4CEFF]" />
          </div>

          <div className="mt-5 space-y-4">
            <ExpenseBar label="Fixed Expenses" value={s.fixedExpenses} total={s.totalExpenses} />
            <ExpenseBar label="Variable Expenses" value={s.variableExpenses} total={s.totalExpenses} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <Insight label="Avg. Variable Cost" value={peso(s.averageVariableCost)} />
            <Insight label="Target Margin" value={`${s.desiredProfitMargin.toFixed(0)}%`} />
          </div>

          <Link
            href="/admin/expenses"
            className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-caption font-semibold uppercase text-[#C4CEFF] hover:border-[#C4CEFF]/25"
          >
            <ReceiptText className="size-3.5" />
            Manage Business Expenses
          </Link>
        </section>
      </div>

      <TrendChart points={s.daily} />

      <section className={`${adminPanel} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-caption font-semibold uppercase tracking-label text-white/35">Financial targets</p>
            <h2 className="mt-1 text-sm font-semibold">Monthly business planning</h2>
          </div>
          <Calculator className="size-5 text-[#C4CEFF]" />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <MoneyField
            label="Monthly Revenue Target"
            value={targets.monthlyRevenueTarget}
            onChange={(value) => setTargets((previous) => ({ ...previous, monthlyRevenueTarget: value }))}
          />
          <MoneyField
            label="Desired Monthly Net Profit"
            value={targets.desiredMonthlyProfit}
            onChange={(value) => setTargets((previous) => ({ ...previous, desiredMonthlyProfit: value }))}
          />
          <label className="space-y-2">
            <span className={adminLabel}>Desired Profit Margin %</span>
            <input
              type="number"
              min="0"
              max="100"
              value={targets.desiredProfitMargin}
              onChange={(event) => setTargets((previous) => ({ ...previous, desiredProfitMargin: event.target.value }))}
              className={adminInput}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={() => void saveTargets()}
            disabled={saving}
            className={`${adminBtnPrimary} inline-flex items-center gap-2 px-5 py-2.5`}
          >
            <Save className="size-3.5" />
            {saving ? 'Saving…' : 'Save Targets'}
          </button>
        </div>
      </section>
    </div>
  )
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className={adminLabel}>{label}</span>
      <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className={adminInput} />
    </label>
  )
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/[0.07] bg-black/10 p-3">
      <p className="text-caption font-semibold uppercase tracking-wider text-white/30">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white/80">{value}</p>
    </div>
  )
}

function ExpenseBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-white/45">{label}</span>
        <span className="font-semibold">{peso(value)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full bg-[#C4CEFF]/70" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

const CHART_WIDTH = 840
const CHART_HEIGHT = 320
const CHART_MARGIN = { top: 20, right: 24, bottom: 54, left: 88 }

function compactPeso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function niceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

function curvedPath(coordinates: Array<{ x: number; y: number }>) {
  if (coordinates.length === 0) return ''
  if (coordinates.length === 1) return `M ${coordinates[0].x} ${coordinates[0].y}`

  return coordinates.slice(0, -1).reduce((path, point, index) => {
    const next = coordinates[index + 1]
    const horizontalBend = (next.x - point.x) * 0.45
    return `${path} C ${point.x + horizontalBend} ${point.y}, ${next.x - horizontalBend} ${next.y}, ${next.x} ${next.y}`
  }, `M ${coordinates[0].x} ${coordinates[0].y}`)
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const latestIndex = Math.max(0, points.length - 1)
  const latestKey = points[latestIndex]?.key
  const [activeIndex, setActiveIndex] = useState(latestIndex)
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)
  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
  const values = [0, ...points.flatMap((point) => [point.revenue, point.expenses, point.netProfit])]
  const rawMinimum = Math.min(...values)
  const rawMaximum = Math.max(...values)
  const step = niceStep(Math.max(1, rawMaximum - rawMinimum) / 4)
  const minimum = Math.min(0, Math.floor(rawMinimum / step) * step)
  const maximum = Math.max(step, Math.ceil(rawMaximum / step) * step)
  const yTicks = Array.from(
    { length: Math.round((maximum - minimum) / step) + 1 },
    (_, index) => minimum + index * step,
  )
  const xFor = (index: number) =>
    CHART_MARGIN.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const yFor = (value: number) =>
    CHART_MARGIN.top + ((maximum - value) / Math.max(1, maximum - minimum)) * plotHeight
  const baseline = yFor(0)
  const selectedIndex = Math.min(Math.max(activeIndex, 0), Math.max(0, points.length - 1))
  const activePoint = points[selectedIndex]
  const series = [
    { key: 'revenue', label: 'Revenue', color: '#60a5fa', gradientId: 'revenue-gradient' },
    { key: 'expenses', label: 'Expenses', color: '#f87171', gradientId: 'expenses-gradient' },
    { key: 'netProfit', label: 'Net Profit', color: '#fbbf24', gradientId: 'profit-gradient' },
  ] as const

  useEffect(() => {
    setActiveIndex(latestIndex)
    setPinnedIndex(null)
  }, [latestIndex, latestKey])

  const pointIndexAt = (clientX: number, element: SVGSVGElement) => {
    if (points.length === 0) return null
    const bounds = element.getBoundingClientRect()
    const chartX = ((clientX - bounds.left) / Math.max(1, bounds.width)) * CHART_WIDTH
    const relative = (chartX - CHART_MARGIN.left) / Math.max(1, plotWidth)
    return Math.min(points.length - 1, Math.max(0, Math.round(relative * (points.length - 1))))
  }

  const pinPoint = (index: number) => {
    setActiveIndex(index)
    setPinnedIndex(index)
  }

  return (
    <section className={`${adminPanel} overflow-hidden`}>
      <div className="flex flex-col gap-4 border-b border-white/[0.08] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-caption font-semibold uppercase tracking-label text-white/35">Financial trend</p>
          <h2 className="mt-1 text-base font-semibold">Revenue, expenses &amp; net profit</h2>
          <p className="mt-1 text-caption text-white/35">
            Seven-day record{points.length ? ` · ${points[0].label} — ${points[points.length - 1].label}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-caption text-white/45">
          {series.map((item) => (
            <span key={item.key} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {activePoint ? (
        <div className="grid gap-px border-b border-white/[0.08] bg-white/[0.06] sm:grid-cols-[1fr_repeat(3,minmax(0,1fr))]">
          <div className="bg-[#222222] p-3">
            <p className="text-caption font-semibold uppercase tracking-wider text-white/30">Selected day</p>
            <p className="mt-1 text-sm font-semibold text-white/80">{activePoint.label}</p>
            {pinnedIndex === null ? (
              <p className="mt-1 text-caption uppercase tracking-wider text-white/25">Latest by default · hover to preview</p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPinnedIndex(null)
                  setActiveIndex(latestIndex)
                }}
                className="mt-1 text-caption font-semibold uppercase tracking-wider text-[#C4CEFF] hover:text-white"
              >
                Show latest
              </button>
            )}
          </div>
          {series.map((item) => (
            <div key={item.key} className="bg-[#222222] p-3">
              <p className="text-caption font-semibold uppercase tracking-wider" style={{ color: item.color }}>
                {item.label}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-white/80">{peso(activePoint[item.key])}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div
        className="overflow-x-auto p-3 sm:p-5"
        role="group"
        tabIndex={0}
        aria-label="Seven-day financial trend. Click a day to keep it selected, or use the left and right arrow keys."
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            pinPoint(Math.max(0, selectedIndex - 1))
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            pinPoint(Math.min(points.length - 1, selectedIndex + 1))
          }
        }}
      >
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="min-w-[720px] cursor-crosshair"
          role="img"
          aria-label="Curved line graph of revenue, expenses, and net profit over seven days"
          onPointerMove={(event) => {
            if (pinnedIndex !== null) return
            const index = pointIndexAt(event.clientX, event.currentTarget)
            if (index !== null) setActiveIndex(index)
          }}
          onPointerLeave={() => setActiveIndex(pinnedIndex ?? latestIndex)}
          onClick={(event) => {
            const index = pointIndexAt(event.clientX, event.currentTarget)
            if (index !== null) pinPoint(index)
          }}
        >
          <defs>
            {series.map((item) => (
              <linearGradient key={item.gradientId} id={item.gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {yTicks.map((tick) => {
            const y = yFor(tick)
            return (
              <g key={tick}>
                <line
                  x1={CHART_MARGIN.left}
                  x2={CHART_WIDTH - CHART_MARGIN.right}
                  y1={y}
                  y2={y}
                  stroke={tick === 0 ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.07)'}
                  strokeDasharray={tick === 0 ? undefined : '4 6'}
                />
                <text x={CHART_MARGIN.left - 12} y={y + 4} textAnchor="end" fill="rgba(255,255,255,0.38)" fontSize="10">
                  {compactPeso(tick)}
                </text>
              </g>
            )
          })}

          {activePoint ? (
            <line
              x1={xFor(selectedIndex)}
              x2={xFor(selectedIndex)}
              y1={CHART_MARGIN.top}
              y2={CHART_HEIGHT - CHART_MARGIN.bottom}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="3 5"
            />
          ) : null}

          {series.map((item) => {
            const coordinates = points.map((point, index) => ({ x: xFor(index), y: yFor(point[item.key]) }))
            const line = curvedPath(coordinates)
            const area = coordinates.length
              ? `${line} L ${coordinates[coordinates.length - 1].x} ${baseline} L ${coordinates[0].x} ${baseline} Z`
              : ''
            return (
              <g key={item.key}>
                <path d={area} fill={`url(#${item.gradientId})`} />
                <path d={line} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {coordinates.map((coordinate, index) => (
                  <circle
                    key={points[index].key}
                    cx={coordinate.x}
                    cy={coordinate.y}
                    r={index === selectedIndex ? 5 : 2.5}
                    fill={item.color}
                    stroke="#222222"
                    strokeWidth={index === selectedIndex ? 3 : 1.5}
                  >
                    <title>{`${points[index].label} · ${item.label}: ${peso(points[index][item.key])}`}</title>
                  </circle>
                ))}
              </g>
            )
          })}

          {points.map((point, index) => (
            <text
              key={point.key}
              x={xFor(index)}
              y={CHART_HEIGHT - 18}
              textAnchor="middle"
              fill={index === selectedIndex ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.38)'}
              fontSize="10"
              fontWeight={index === selectedIndex ? 700 : 400}
            >
              {point.label}
            </text>
          ))}
        </svg>
      </div>

      <div className="sr-only">
        <table>
          <caption>Seven-day revenue, expenses, and net profit record</caption>
          <thead>
            <tr><th>Date</th><th>Revenue</th><th>Expenses</th><th>Net profit</th></tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.key}>
                <th>{point.label}</th><td>{peso(point.revenue)}</td><td>{peso(point.expenses)}</td><td>{peso(point.netProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
