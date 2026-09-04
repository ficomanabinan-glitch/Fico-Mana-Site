'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Banknote,
  BriefcaseBusiness,
  Calculator,
  Crosshair,
  Edit3,
  Plus,
  ReceiptText,
  Save,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { AdminPageSkeleton } from '@/components/admin-page-skeleton'
import {
  adminBtnGhost,
  adminBtnPrimary,
  adminCard,
  adminInput,
  adminLabel,
  adminPage,
  adminPanel,
  adminSelect,
} from '@/lib/admin-ui'
import type { SalesExpense, SalesPeriod, SalesSettings } from '@/lib/sales-finance'

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

type SalesPayload = { summary: Summary; settings: SalesSettings; expenses: SalesExpense[] }

type SalesSettingsDraft = {
  monthlyRevenueTarget: string
  desiredMonthlyProfit: string
  desiredProfitMargin: string
}

type ExpenseDraft = {
  id?: string
  expenseType: 'fixed' | 'variable'
  name: string
  category: string
  amount: string
  expenseDate: string
  recurrence: 'one_time' | 'monthly'
  startDate: string
  endDate: string
  bookingId: string
  notes: string
  isActive: boolean
}

const SALES_CACHE_PREFIX = 'fico_admin_sales_v1:'
const SALES_CACHE_MAX_AGE_MS = 10 * 60_000

function salesCacheKey(period: SalesPeriod, anchor: string) {
  return `${SALES_CACHE_PREFIX}${period}:${anchor}`
}

function readSalesCache(period: SalesPeriod, anchor: string): SalesPayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(salesCacheKey(period, anchor))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { savedAt: number; payload: SalesPayload }
    if (!parsed?.payload || Date.now() - Number(parsed.savedAt || 0) > SALES_CACHE_MAX_AGE_MS) return null
    return parsed.payload
  } catch {
    return null
  }
}

function writeSalesCache(period: SalesPeriod, anchor: string, payload: SalesPayload) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(salesCacheKey(period, anchor), JSON.stringify({ savedAt: Date.now(), payload }))
  } catch {
    // Ignore storage quota/private-mode failures; the dashboard still works without cache.
  }
}

function settingsToDraft(settings?: SalesSettings | null): SalesSettingsDraft {
  return {
    monthlyRevenueTarget: settings?.monthlyRevenueTarget ? String(settings.monthlyRevenueTarget) : '',
    desiredMonthlyProfit: settings?.desiredMonthlyProfit ? String(settings.desiredMonthlyProfit) : '',
    desiredProfitMargin: settings?.desiredProfitMargin ? String(settings.desiredProfitMargin) : '',
  }
}

function draftToSettings(draft: SalesSettingsDraft): SalesSettings {
  return {
    monthlyRevenueTarget: Number(draft.monthlyRevenueTarget || 0),
    desiredMonthlyProfit: Number(draft.desiredMonthlyProfit || 0),
    desiredProfitMargin: Number(draft.desiredProfitMargin || 0),
  }
}

const emptyExpense = (): ExpenseDraft => ({
  expenseType: 'fixed',
  name: '',
  category: 'Other',
  amount: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  recurrence: 'monthly',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  bookingId: '',
  notes: '',
  isActive: true,
})

const peso = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)

export default function SalesManagementPage() {
  const toast = useAdminToast()
  const [period, setPeriod] = useState<SalesPeriod>('month')
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<SalesPayload | null>(() => readSalesCache('month', new Date().toISOString().slice(0, 10)))
  const [loading, setLoading] = useState(() => !readSalesCache('month', new Date().toISOString().slice(0, 10)))
  const [refreshing, setRefreshing] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<SalesSettingsDraft>(() => settingsToDraft(data?.settings))
  const settingsDirtyRef = useRef(false)
  const [expense, setExpense] = useState<ExpenseDraft>(emptyExpense)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingExpense, setSavingExpense] = useState(false)

  const loadData = useCallback(
    async (silent = false) => {
      const cached = readSalesCache(period, anchor)
      if (cached) {
        setData(cached)
        if (!settingsDirtyRef.current) setSettingsDraft(settingsToDraft(cached.settings))
        setLoading(false)
      } else if (!silent) {
        setRefreshing(true)
      }

      try {
        const params = new URLSearchParams({ period, anchor })
        const res = await fetch(`/api/sales/summary?${params}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        const payload = (await res.json().catch(() => ({}))) as SalesPayload & { error?: string }
        if (!res.ok) throw new Error(payload.error || 'Failed to load sales data.')
        writeSalesCache(period, anchor, payload)
        setData(payload)
        if (!settingsDirtyRef.current) setSettingsDraft(settingsToDraft(payload.settings))
      } catch (error) {
        if (!cached) {
          toast.error(
            'Sales data unavailable',
            error instanceof Error ? error.message : 'Could not load financial metrics.',
          )
        }
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [period, anchor, toast],
  )

  useEffect(() => {
    const cached = readSalesCache(period, anchor)
    if (cached) {
      setData(cached)
      if (!settingsDirtyRef.current) setSettingsDraft(settingsToDraft(cached.settings))
      setLoading(false)
    } else {
      setLoading(true)
    }
    void loadData(true)
  }, [period, anchor, loadData])

  useOnAdminDbSync(() => loadData(true))

  const updateSetting = (key: keyof SalesSettingsDraft, value: string) => {
    settingsDirtyRef.current = true
    setSettingsDraft((previous) => ({ ...previous, [key]: value }))
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/sales/settings', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToSettings(settingsDraft)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to save targets.')
      settingsDirtyRef.current = false
      toast.success('Financial targets saved', 'Sales planning metrics have been recalculated.')
      await loadData(true)
    } catch (error) {
      toast.error('Could not save targets', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSavingSettings(false)
    }
  }

  const saveExpense = async () => {
    setSavingExpense(true)
    try {
      const res = await fetch('/api/sales/expenses', {
        method: expense.id ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...expense, amount: Number(expense.amount) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to save expense.')
      toast.success(
        expense.id ? 'Expense updated' : 'Expense added',
        'Profitability metrics have been recalculated.',
      )
      setExpense(emptyExpense())
      await loadData(true)
    } catch (error) {
      toast.error(
        'Could not save expense',
        error instanceof Error ? error.message : 'Check the expense details.',
      )
    } finally {
      setSavingExpense(false)
    }
  }

  const editExpense = (item: SalesExpense) => {
    setExpense({
      id: item.id,
      expenseType: item.expenseType,
      name: item.name,
      category: item.category,
      amount: String(item.amount),
      expenseDate: item.expenseDate,
      recurrence: item.recurrence,
      startDate: item.startDate || item.expenseDate,
      endDate: item.endDate || '',
      bookingId: item.bookingId || '',
      notes: item.notes || '',
      isActive: item.isActive,
    })
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  const removeExpense = async (id: string) => {
    if (!window.confirm('Delete this expense? This changes historical financial calculations.')) return
    const res = await fetch(`/api/sales/expenses?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) {
      toast.error('Delete failed', 'The expense could not be deleted.')
      return
    }
    toast.success('Expense deleted', 'Financial metrics have been recalculated.')
    await loadData(true)
  }

  if (loading || !data) return <AdminPageSkeleton variant="dashboard" />

  const s = data.summary
  const progress = Math.max(0, Math.min(s.revenueGoalProgress, 100))

  const metrics = [
    {
      label: 'Booked Sales',
      value: peso(s.bookedSales),
      detail: `${s.totalBookings} valid bookings`,
      icon: TrendingUp,
    },
    {
      label: 'Cash Collected',
      value: peso(s.cashCollected),
      detail: 'Actual verified payments received',
      icon: Banknote,
    },
    {
      label: 'Outstanding',
      value: peso(s.outstandingReceivables),
      detail: 'Remaining client receivables',
      icon: WalletCards,
    },
    {
      label: 'Net Profit',
      value: peso(s.netProfit),
      detail: `${s.profitMargin.toFixed(1)}% actual margin`,
      icon: BarChart3,
    },
    {
      label: 'Average Booking',
      value: peso(s.averageBookingValue),
      detail: 'Average valid booking value',
      icon: BriefcaseBusiness,
    },
    {
      label: 'More Shoots Needed',
      value: s.bookingsNeeded === null ? '—' : String(s.bookingsNeeded),
      detail: s.bookingsNeeded === null ? 'Needs booking data' : `To reach ${peso(s.revenueGoal)}`,
      icon: Crosshair,
    },
  ]

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Sales Management"
        subtitle="Track revenue, expenses, profit, and sales targets for FICO MANA Studio."
        onRefresh={() => loadData()}
        refreshing={refreshing}
      >
        <div className="flex flex-wrap gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as SalesPeriod)}
            className={`${adminSelect} !w-auto min-w-28`}
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
          <input
            type="date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            className={`${adminInput} !w-auto`}
          />
        </div>
      </AdminPageHeader>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <div key={metric.label} className={`${adminCard} p-5 flex items-start gap-4`}>
              <div className="w-10 h-10 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-center text-[#C4CEFF] shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-bold text-white/40">{metric.label}</p>
                <p className="text-2xl font-bold text-white mt-1 tabular-nums">{metric.value}</p>
                <p className="text-[11px] text-white/45 mt-1">{metric.detail}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid xl:grid-cols-12 gap-6">
        <section className={`xl:col-span-7 ${adminPanel} p-5 space-y-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Revenue Goal</p>
              <h3 className="text-lg font-semibold text-white mt-1">
                {peso(s.bookedSales)} of {peso(s.revenueGoal)}
              </h3>
            </div>
            <Target className="w-5 h-5 text-[#C4CEFF]" />
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Insight label="Progress" value={`${s.revenueGoalProgress.toFixed(1)}%`} />
            <Insight label="Revenue Remaining" value={peso(s.remainingRevenueTarget)} />
            <Insight
              label="Bookings Remaining"
              value={s.bookingsNeeded === null ? 'Unavailable' : String(s.bookingsNeeded)}
            />
          </div>
          <div className="border-t border-white/10 pt-5 grid sm:grid-cols-3 gap-3">
            <Insight label="Contribution / Booking" value={peso(s.contributionPerBooking)} />
            <Insight
              label="Break-even Bookings"
              value={s.breakEvenBookings === null ? 'Unavailable' : String(s.breakEvenBookings)}
            />
            <Insight
              label="Desired Profit Bookings"
              value={s.desiredProfitBookings === null ? 'Unavailable' : String(s.desiredProfitBookings)}
            />
          </div>
        </section>

        <section className={`xl:col-span-5 ${adminPanel} p-5 space-y-5`}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Expense Breakdown</p>
            <h3 className="text-lg font-semibold text-white mt-1">{peso(s.totalExpenses)} total</h3>
          </div>
          <div className="space-y-4">
            <ExpenseBar label="Fixed Expenses" value={s.fixedExpenses} total={s.totalExpenses} />
            <ExpenseBar label="Variable Expenses" value={s.variableExpenses} total={s.totalExpenses} />
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <Insight label="Average Variable Cost" value={peso(s.averageVariableCost)} />
            <Insight label="Target Margin" value={`${s.desiredProfitMargin.toFixed(0)}%`} />
          </div>
        </section>
      </div>

      <MinimalSalesChart points={s.monthly} period={period} />

      <section className={`${adminPanel} p-5 space-y-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Financial Targets</p>
            <h3 className="text-sm font-semibold text-white mt-1">Persisted monthly planning settings</h3>
          </div>
          <Calculator className="w-5 h-5 text-[#C4CEFF]" />
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <MoneyField
            label="Monthly Revenue Target"
            value={settingsDraft.monthlyRevenueTarget}
            onChange={(value) => updateSetting('monthlyRevenueTarget', value)}
          />
          <MoneyField
            label="Desired Monthly Net Profit"
            value={settingsDraft.desiredMonthlyProfit}
            onChange={(value) => updateSetting('desiredMonthlyProfit', value)}
          />
          <div className="space-y-2">
            <label className={adminLabel}>Desired Profit Margin %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={settingsDraft.desiredProfitMargin}
              placeholder="0"
              onChange={(e) => updateSetting('desiredProfitMargin', e.target.value)}
              className={adminInput}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className={`${adminBtnPrimary} px-5 py-2.5 inline-flex items-center gap-2`}
          >
            <Save className="w-3.5 h-3.5" />
            {savingSettings ? 'Saving...' : 'Save Targets'}
          </button>
        </div>
      </section>

      <div className="grid xl:grid-cols-12 gap-6 items-start">
        <section className={`xl:col-span-7 ${adminPanel} overflow-hidden`}>
          <div className="p-5 border-b border-white/10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Business Expenses</p>
            <h3 className="text-sm font-semibold text-white mt-1">
              Fixed overhead and booking-linked variable costs
            </h3>
          </div>
          {data.expenses.length === 0 ? (
            <div className="p-12 text-center text-sm text-white/40">No expenses recorded yet.</div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {data.expenses.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white text-sm">{item.name}</p>
                      <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-white/10 text-white/60">
                        {item.expenseType}
                      </span>
                      {!item.isActive && (
                        <span className="text-[9px] uppercase font-bold text-red-300">Inactive</span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/40 mt-1">
                      {item.category} · {item.recurrence === 'monthly' ? 'Monthly recurring' : item.expenseDate}
                      {item.bookingId ? ` · ${item.bookingId}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="font-bold text-white tabular-nums">{peso(item.amount)}</p>
                    <button onClick={() => editExpense(item)} className={`p-2 ${adminBtnGhost}`} title="Edit">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeExpense(item.id)}
                      className="p-2 rounded-lg border border-red-500/20 text-red-300 hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={`xl:col-span-5 ${adminPanel} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                {expense.id ? 'Edit Expense' : 'Add Expense'}
              </p>
              <h3 className="text-sm font-semibold text-white mt-1">
                {expense.id ? 'Update existing cost' : 'Record a business cost'}
              </h3>
            </div>
            {expense.id ? (
              <button onClick={() => setExpense(emptyExpense())} className="p-2 text-white/50">
                <X className="w-4 h-4" />
              </button>
            ) : (
              <Plus className="w-5 h-5 text-[#C4CEFF]" />
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <SelectField
              label="Expense Type"
              value={expense.expenseType}
              onChange={(value) =>
                setExpense((p) => ({
                  ...p,
                  expenseType: value as ExpenseDraft['expenseType'],
                  recurrence: value === 'variable' ? 'one_time' : p.recurrence,
                }))
              }
              options={[
                ['fixed', 'Fixed'],
                ['variable', 'Variable / Project'],
              ]}
            />
            <TextField
              label="Name"
              value={expense.name}
              onChange={(value) => setExpense((p) => ({ ...p, name: value }))}
              placeholder="Software, freelancer, rent..."
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <TextField
              label="Category"
              value={expense.category}
              onChange={(value) => setExpense((p) => ({ ...p, category: value }))}
            />
            <div className="space-y-2">
              <label className={adminLabel}>Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={expense.amount}
                onChange={(e) => setExpense((p) => ({ ...p, amount: e.target.value }))}
                className={adminInput}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className={adminLabel}>Expense Date</label>
              <input
                type="date"
                value={expense.expenseDate}
                onChange={(e) => setExpense((p) => ({ ...p, expenseDate: e.target.value }))}
                className={adminInput}
              />
            </div>
            <SelectField
              label="Recurrence"
              value={expense.recurrence}
              onChange={(value) => setExpense((p) => ({ ...p, recurrence: value as ExpenseDraft['recurrence'] }))}
              options={
                expense.expenseType === 'fixed'
                  ? [
                      ['one_time', 'One-time'],
                      ['monthly', 'Monthly'],
                    ]
                  : [['one_time', 'One-time']]
              }
            />
          </div>

          {expense.recurrence === 'monthly' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={adminLabel}>Starts</label>
                <input
                  type="date"
                  value={expense.startDate}
                  onChange={(e) => setExpense((p) => ({ ...p, startDate: e.target.value }))}
                  className={adminInput}
                />
              </div>
              <div className="space-y-2">
                <label className={adminLabel}>Ends (optional)</label>
                <input
                  type="date"
                  value={expense.endDate}
                  onChange={(e) => setExpense((p) => ({ ...p, endDate: e.target.value }))}
                  className={adminInput}
                />
              </div>
            </div>
          )}

          {expense.expenseType === 'variable' && (
            <TextField
              label="Booking ID (optional)"
              value={expense.bookingId}
              onChange={(value) => setExpense((p) => ({ ...p, bookingId: value }))}
              placeholder="FM-123456"
            />
          )}

          <TextField
            label="Notes (optional)"
            value={expense.notes}
            onChange={(value) => setExpense((p) => ({ ...p, notes: value }))}
          />

          <label className="flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={expense.isActive}
              onChange={(e) => setExpense((p) => ({ ...p, isActive: e.target.checked }))}
            />
            Active expense
          </label>

          <button
            onClick={saveExpense}
            disabled={savingExpense}
            className={`${adminBtnPrimary} w-full py-3 inline-flex items-center justify-center gap-2`}
          >
            <ReceiptText className="w-4 h-4" />
            {savingExpense ? 'Saving...' : expense.id ? 'Update Expense' : 'Add Expense'}
          </button>
        </section>
      </div>
    </div>
  )
}

function MinimalSalesChart({ points, period }: { points: TrendPoint[]; period: SalesPeriod }) {
  const chart = useMemo(() => {
    const width = 1000
    const height = 250
    const left = 34
    const right = 12
    const top = 18
    const bottom = 34
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    const maxValue = Math.max(1, ...points.flatMap((point) => [point.revenue, point.expenses]))

    const toPoint = (value: number, index: number) => {
      const x = points.length <= 1 ? left + plotWidth / 2 : left + (index / (points.length - 1)) * plotWidth
      const y = top + plotHeight - (value / maxValue) * plotHeight
      return { x, y }
    }

    const revenuePoints = points.map((point, index) => toPoint(point.revenue, index))
    const expensePoints = points.map((point, index) => toPoint(point.expenses, index))
    const line = (items: Array<{ x: number; y: number }>) => items.map((p) => `${p.x},${p.y}`).join(' ')

    return { width, height, left, right, top, bottom, plotWidth, plotHeight, maxValue, revenuePoints, expensePoints, line }
  }, [points])

  const totalRevenue = points.reduce((sum, point) => sum + point.revenue, 0)
  const totalExpenses = points.reduce((sum, point) => sum + point.expenses, 0)
  const hasData = points.some((point) => point.revenue > 0 || point.expenses > 0)
  const labelEvery = period === 'month' ? 5 : 1

  return (
    <section className={`${adminPanel} p-5 sm:p-6 space-y-5 overflow-hidden`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Financial Trend</p>
          <h3 className="text-sm font-semibold text-white mt-1">Revenue vs expenses</h3>
        </div>
        <div className="flex items-center gap-5 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C4CEFF]" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-white/35">Revenue</p>
              <p className="font-semibold text-white tabular-nums">{peso(totalRevenue)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-white/45" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-white/35">Expenses</p>
              <p className="font-semibold text-white/80 tabular-nums">{peso(totalExpenses)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative rounded-xl border border-white/[0.07] bg-black/10 px-1 py-3 sm:px-3">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="block h-[230px] w-full"
          role="img"
          aria-label="Revenue and expenses trend"
          preserveAspectRatio="none"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = chart.top + chart.plotHeight * fraction
            return (
              <line
                key={fraction}
                x1={chart.left}
                x2={chart.width - chart.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-white/[0.07]"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          <line
            x1={chart.left}
            x2={chart.width - chart.right}
            y1={chart.top + chart.plotHeight}
            y2={chart.top + chart.plotHeight}
            stroke="currentColor"
            className="text-white/15"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {hasData && (
            <>
              <polyline
                points={chart.line(chart.expensePoints)}
                fill="none"
                stroke="rgba(255,255,255,0.42)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={chart.line(chart.revenuePoints)}
                fill="none"
                stroke="#C4CEFF"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />

              {chart.revenuePoints.map((point, index) =>
                points[index]?.revenue > 0 ? (
                  <circle
                    key={`revenue-${points[index].key}`}
                    cx={point.x}
                    cy={point.y}
                    r="3.5"
                    fill="#C4CEFF"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{`${points[index].label}: Revenue ${peso(points[index].revenue)}`}</title>
                  </circle>
                ) : null,
              )}
              {chart.expensePoints.map((point, index) =>
                points[index]?.expenses > 0 ? (
                  <circle
                    key={`expense-${points[index].key}`}
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    fill="rgba(255,255,255,0.58)"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{`${points[index].label}: Expenses ${peso(points[index].expenses)}`}</title>
                  </circle>
                ) : null,
              )}
            </>
          )}

          {points.map((point, index) => {
            if (index !== 0 && index !== points.length - 1 && index % labelEvery !== 0) return null
            const x = points.length <= 1
              ? chart.left + chart.plotWidth / 2
              : chart.left + (index / (points.length - 1)) * chart.plotWidth
            return (
              <text
                key={`label-${point.key}`}
                x={x}
                y={chart.height - 8}
                textAnchor="middle"
                fill="rgba(255,255,255,0.38)"
                fontSize="11"
              >
                {point.label}
              </text>
            )
          })}
        </svg>

        <div className="pointer-events-none absolute left-3 top-3 text-[9px] font-medium text-white/30">
          {peso(chart.maxValue)}
        </div>
        {!hasData && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-lg border border-white/10 bg-[#222222]/90 px-4 py-2 text-xs text-white/45">
              No revenue or expenses recorded for this period yet.
            </p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-white/30">
        {period === 'month' ? 'Daily activity' : 'Monthly activity'} · Hover a point to view the exact amount.
      </p>
    </section>
  )
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">{label}</p>
      <p className="text-sm font-semibold text-white mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function ExpenseBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-white/55">{label}</span>
        <span className="font-semibold text-white">{peso(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className={adminLabel}>{label}</label>
      <input
        type="number"
        min="0"
        step="100"
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        className={adminInput}
      />
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <label className={adminLabel}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={adminInput}
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <div className="space-y-2">
      <label className={adminLabel}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={adminSelect}>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}
