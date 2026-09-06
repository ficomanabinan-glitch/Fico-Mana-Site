'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Edit3, Plus, ReceiptText, Save, Trash2, X } from 'lucide-react'
import AdminPageHeader from '@/components/admin-page-header'
import { useAdminToast } from '@/components/admin-toast-provider'
import {
  adminBtnGhost,
  adminBtnPrimary,
  adminInput,
  adminLabel,
  adminPage,
  adminPanel,
  adminSelect,
} from '@/lib/admin-ui'
import { signalSalesDataChanged } from '@/lib/sales-read-cache'

type Expense = {
  id: string
  expenseType: 'fixed' | 'variable'
  name: string
  category: string
  amount: number
  expenseDate: string
  recurrence: 'one_time' | 'monthly'
  startDate?: string | null
  endDate?: string | null
  bookingId?: string | null
  notes?: string | null
  isActive: boolean
}

type Draft = {
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

const emptyDraft = (): Draft => ({
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

function peso(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}

function nextMonthlyDate(startDate?: string | null) {
  if (!startDate) return '—'
  const started = new Date(`${startDate}T12:00:00`)
  if (!Number.isFinite(started.getTime())) return '—'
  const now = new Date()
  const next = new Date(started)
  while (next <= now) next.setMonth(next.getMonth() + 1)
  return next.toLocaleDateString('en-PH')
}

export default function BusinessExpensesPage() {
  const toast = useAdminToast()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchExpenses = useCallback(async () => {
    const response = await fetch('/api/sales/expenses', {
      cache: 'no-store',
      credentials: 'include',
    })
    const body = (await response.json().catch(() => [])) as Expense[] & { error?: string }
    if (!response.ok) throw new Error('Could not load business expenses.')

    setExpenses(Array.isArray(body) ? body : [])
  }, [])

  useEffect(() => {
    fetchExpenses()
      .catch((error) => toast.error('Expenses unavailable', error instanceof Error ? error.message : 'Try again.'))
      .finally(() => setLoading(false))
  }, [fetchExpenses, toast])

  const totals = useMemo(() => {
    const active = expenses.filter((item) => item.isActive)
    return {
      fixed: active.filter((item) => item.expenseType === 'fixed').reduce((sum, item) => sum + item.amount, 0),
      variable: active.filter((item) => item.expenseType === 'variable').reduce((sum, item) => sum + item.amount, 0),
      recurring: active.filter((item) => item.recurrence === 'monthly').length,
    }
  }, [expenses])

  const edit = (item: Expense) => {
    setDraft({
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    if (!draft.name.trim() || Number(draft.amount) < 0) {
      toast.warning('Check expense details', 'Name and a valid amount are required.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/sales/expenses', {
        method: draft.id ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          id: draft.id,
          amount: Number(draft.amount),
          recurrence: draft.expenseType === 'variable' ? 'one_time' : draft.recurrence,
        }),
      })
      if (!response.ok) throw new Error('Could not save expense.')
      signalSalesDataChanged()
      toast.success(draft.id ? 'Expense updated' : 'Expense added', 'Sales calculations will use the updated business costs.')
      setDraft(emptyDraft())
      await fetchExpenses()
    } catch (error) {
      toast.error('Save failed', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this business expense?')) return
    const response = await fetch(`/api/sales/expenses?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!response.ok) {
      toast.error('Delete failed', 'Could not delete this expense.')
      return
    }
    signalSalesDataChanged()
    await fetchExpenses()
    toast.success('Expense deleted', 'Financial calculations were updated.')
  }

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="Business Expenses"
        subtitle="The single source of truth for fixed, variable, one-time, and recurring operating costs."
        onRefresh={() => void fetchExpenses()}
        refreshing={loading}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Active fixed costs" value={peso(totals.fixed)} />
        <SummaryCard label="Active variable costs" value={peso(totals.variable)} />
        <SummaryCard label="Monthly recurring items" value={String(totals.recurring)} />
      </div>

      <section className={`${adminPanel} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">
              {draft.id ? 'Edit business expense' : 'Add business expense'}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-white">
              {draft.id ? draft.name : 'Record a new operating cost'}
            </h2>
          </div>
          {draft.id ? (
            <button onClick={() => setDraft(emptyDraft())} className="p-2 text-white/45 hover:text-white">
              <X className="size-4" />
            </button>
          ) : (
            <Plus className="size-5 text-[#C4CEFF]" />
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Expense name">
            <input
              value={draft.name}
              onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="Studio rent, software, storage…"
              className={adminInput}
            />
          </Field>

          <Field label="Category">
            <input
              value={draft.category}
              onChange={(event) => setDraft((previous) => ({ ...previous, category: event.target.value }))}
              className={adminInput}
            />
          </Field>

          <Field label="Expense type">
            <select
              value={draft.expenseType}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  expenseType: event.target.value as Draft['expenseType'],
                  recurrence: event.target.value === 'variable' ? 'one_time' : previous.recurrence,
                }))
              }
              className={adminSelect}
            >
              <option value="fixed">Fixed Expense</option>
              <option value="variable">Variable / Project Expense</option>
            </select>
          </Field>

          <Field label="Amount">
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(event) => setDraft((previous) => ({ ...previous, amount: event.target.value }))}
              className={adminInput}
            />
          </Field>

          <Field label="Billing frequency">
            <select
              value={draft.expenseType === 'variable' ? 'one_time' : draft.recurrence}
              disabled={draft.expenseType === 'variable'}
              onChange={(event) => setDraft((previous) => ({ ...previous, recurrence: event.target.value as Draft['recurrence'] }))}
              className={adminSelect}
            >
              <option value="one_time">One-time</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>

          <Field label={draft.recurrence === 'monthly' ? 'Start date' : 'Expense date'}>
            <input
              type="date"
              value={draft.recurrence === 'monthly' ? draft.startDate : draft.expenseDate}
              onChange={(event) =>
                setDraft((previous) =>
                  previous.recurrence === 'monthly'
                    ? { ...previous, startDate: event.target.value, expenseDate: event.target.value }
                    : { ...previous, expenseDate: event.target.value },
                )
              }
              className={adminInput}
            />
          </Field>

          {draft.recurrence === 'monthly' ? (
            <Field label="End date (optional)">
              <input
                type="date"
                value={draft.endDate}
                onChange={(event) => setDraft((previous) => ({ ...previous, endDate: event.target.value }))}
                className={adminInput}
              />
            </Field>
          ) : (
            <Field label="Booking ID (optional)">
              <input
                value={draft.bookingId}
                onChange={(event) => setDraft((previous) => ({ ...previous, bookingId: event.target.value }))}
                placeholder="FM-123456"
                className={adminInput}
              />
            </Field>
          )}

          <Field label="Status">
            <label className="flex h-10 items-center gap-2 border border-white/10 bg-white/[0.02] px-3 text-xs text-white/60">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft((previous) => ({ ...previous, isActive: event.target.checked }))}
              />
              Active expense
            </label>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <Field label="Notes">
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))}
              className={`${adminInput} h-auto resize-y py-3`}
              placeholder="Optional internal finance notes…"
            />
          </Field>
          <button
            onClick={() => void save()}
            disabled={saving}
            className={`${adminBtnPrimary} inline-flex items-center justify-center gap-2 px-5 py-3`}
          >
            <Save className="size-3.5" />
            {saving ? 'Saving…' : draft.id ? 'Update Expense' : 'Add Expense'}
          </button>
        </div>
      </section>

      <section className={`${adminPanel} overflow-hidden`}>
        <div className="border-b border-white/10 p-5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Expense ledger</p>
          <h2 className="mt-1 text-sm font-semibold">All business expenses</h2>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {expenses.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-4 p-4 hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-white">{item.name}</p>
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[9px] font-bold uppercase text-white/55">
                    {item.expenseType}
                  </span>
                  {item.recurrence === 'monthly' ? (
                    <span className="rounded bg-[#C4CEFF]/10 px-2 py-0.5 text-[9px] font-bold uppercase text-[#C4CEFF]">
                      Monthly
                    </span>
                  ) : null}
                  {!item.isActive ? <span className="text-[9px] font-bold uppercase text-red-300">Inactive</span> : null}
                </div>
                <p className="mt-1 text-[11px] text-white/35">
                  {item.category}
                  {item.bookingId ? ` · ${item.bookingId}` : ''}
                </p>
                {item.recurrence === 'monthly' ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-white/35">
                    <CalendarClock className="size-3" />
                    Next billing: {nextMonthlyDate(item.startDate || item.expenseDate)}
                  </p>
                ) : null}
                {item.notes ? <p className="mt-2 max-w-2xl text-[10px] leading-relaxed text-white/30">{item.notes}</p> : null}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <p className="font-bold tabular-nums text-white">{peso(item.amount)}</p>
                <button onClick={() => edit(item)} className={`p-2 ${adminBtnGhost}`} title="Edit expense">
                  <Edit3 className="size-3.5" />
                </button>
                <button
                  onClick={() => void remove(item.id)}
                  className="rounded-lg border border-red-500/20 p-2 text-red-300 hover:bg-red-500/10"
                  title="Delete expense"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="border border-amber-400/15 bg-amber-400/[0.04] p-4 text-[10px] leading-relaxed text-amber-100/60">
        Monthly Storage Subscription now lives only in Business Expenses. It still contributes to Sales Management totals,
        profitability, margin, break-even, and revenue-target calculations.
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className={adminLabel}>{label}</span>
      {children}
    </label>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.02] p-5">
      <ReceiptText className="size-4 text-[#C4CEFF]" />
      <p className="mt-3 text-[9px] font-bold uppercase tracking-wider text-white/35">{label}</p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
    </div>
  )
}
