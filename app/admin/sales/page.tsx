'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { AdminPageSkeleton } from '@/components/admin-page-skeleton'
import {
  adminBtnPrimary,
  adminCard,
  adminInput,
  adminLabel,
  adminPage,
  adminPanel,
  adminSelect,
} from '@/lib/admin-ui'

type Period = 'month' | 'quarter' | 'year'
type TrendPoint = { key: string; label: string; revenue: number; expenses: number }

type Summary = {
  bookedSales: number
  cashCollected: number
  outstandingReceivables: number
  fixedExpenses: number
  variableExpenses: number
  totalExpenses: number
  netProfit: number
  profitMargin: number
  revenueGoal: number
  revenueGoalProgress: number
  remainingRevenueTarget: number
  averageBookingValue: number
  totalBookings: number
  bookingsNeeded: number | null
  averageVariableCost: number
  contributionPerBooking: number
  breakEvenBookings: number | null
  desiredProfit: number
  desiredProfitBookings: number | null
  desiredProfitMargin: number
  monthly: TrendPoint[]
}

type Settings = {
  monthlyRevenueTarget: number
  desiredMonthlyProfit: number
  desiredProfitMargin: number
}

type Payload = {
  summary: Summary
  settings: Settings
  expenses: Array<{ id: string }>
}

function peso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function SalesManagementPage() {
  const toast = useAdminToast()
  const [period, setPeriod] = useState<Period>('month')
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [targets, setTargets] = useState({
    monthlyRevenueTarget: '',
    desiredMonthlyProfit: '',
    desiredProfitMargin: '',
  })

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true)
      try {
        const params = new URLSearchParams({ period, anchor })
        const response = await fetch(`/api/sales/summary?${params}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        const body = (await response.json().catch(() => ({}))) as Payload & { error?: string }
        if (!response.ok) throw new Error(body.error || 'Could not load sales data.')
        setData(body)
        setTargets({
          monthlyRevenueTarget: String(body.settings.monthlyRevenueTarget || ''),
          desiredMonthlyProfit: String(body.settings.desiredMonthlyProfit || ''),
          desiredProfitMargin: String(body.settings.desiredProfitMargin || ''),
        })
      } catch (error) {
        toast.error('Sales data unavailable', error instanceof Error ? error.message : 'Try again.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [period, anchor, toast],
  )

  useEffect(() => {
    setLoading(true)
    void load(true)
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
      await load(true)
    } catch (error) {
      toast.error('Could not save targets', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !data) return <AdminPageSkeleton variant="dashboard" />

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
      <AdminPageHeader
        title="Sales Management"
        subtitle="Revenue, profitability, break-even, and target planning. Expense editing lives only in Business Expenses."
        onRefresh={() => void load()}
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <div key={metric.label} className={`${adminCard} flex items-start gap-4 p-5`}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-[#C4CEFF]">
                <Icon className="size-4" />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">{metric.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">{metric.value}</p>
                <p className="mt-1 text-[11px] text-white/40">{metric.detail}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className={`xl:col-span-7 ${adminPanel} p-5`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">Revenue goal</p>
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
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">Business expense impact</p>
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
            className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] font-bold uppercase text-[#C4CEFF] hover:border-[#C4CEFF]/25"
          >
            <ReceiptText className="size-3.5" />
            Manage Business Expenses
          </Link>
        </section>
      </div>

      <TrendChart points={s.monthly} />

      <section className={`${adminPanel} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">Financial targets</p>
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
      <p className="text-[9px] font-bold uppercase tracking-wider text-white/30">{label}</p>
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

function TrendChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.flatMap((point) => [point.revenue, point.expenses]))
  return (
    <section className={`${adminPanel} p-5`}>
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">Financial trend</p>
      <h2 className="mt-1 text-sm font-semibold">Revenue vs expenses</h2>
      <div className="mt-6 grid h-48 grid-cols-6 items-end gap-3 border-b border-white/10 pb-3">
        {points.map((point) => (
          <div key={point.key} className="flex h-full min-w-0 flex-col justify-end gap-1.5">
            <div className="flex flex-1 items-end justify-center gap-1">
              <div
                className="w-2.5 rounded-t bg-[#C4CEFF]"
                style={{ height: `${Math.max(4, (point.revenue / max) * 100)}%` }}
                title={`Revenue ${peso(point.revenue)}`}
              />
              <div
                className="w-2.5 rounded-t bg-white/30"
                style={{ height: `${Math.max(4, (point.expenses / max) * 100)}%` }}
                title={`Expenses ${peso(point.expenses)}`}
              />
            </div>
            <p className="truncate text-center text-[9px] text-white/30">{point.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-5 text-[10px] text-white/40">
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#C4CEFF]" />Revenue</span>
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-white/30" />Expenses</span>
      </div>
    </section>
  )
}
