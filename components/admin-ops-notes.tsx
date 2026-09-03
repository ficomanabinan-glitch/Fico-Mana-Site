'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, HardDrive, Loader2 } from 'lucide-react'
import { adminBtnPrimary, adminCard } from '@/lib/admin-ui'
import { EMAIL_STORAGE_SUB, getEmailStoragePeriod } from '@/lib/ops-subscriptions'
import { getOpsSubscriptionStatus, markOpsSubscriptionPaid } from '@/lib/data-store'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'

/** Staff ops notes shown across admin — billing / infra reminders. */
export default function AdminOpsNotes() {
  const period = getEmailStoragePeriod()
  const [isPaid, setIsPaid] = useState(false)
  const [loading, setLoading] = useState(true)
  const [markingPaid, setMarkingPaid] = useState(false)

  const endLabel = period.periodEnd.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const refreshStatus = useCallback(async () => {
    const status = await getOpsSubscriptionStatus()
    if (status) setIsPaid(status.isPaid)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useOnAdminDbSync(() => {
    void refreshStatus()
  })

  const handleMarkPaid = async () => {
    setMarkingPaid(true)
    try {
      const ok = await markOpsSubscriptionPaid()
      if (ok) setIsPaid(true)
    } finally {
      setMarkingPaid(false)
    }
  }

  const warn = period.shouldNotify && !isPaid
  const urgent = warn && period.daysLeft <= 3

  return (
    <div
      className={`${adminCard} group relative flex items-start gap-4 overflow-hidden p-5 transition-all duration-500 hover:shadow-[0_8px_32px_rgba(0,0,0,0.2)]`}
      role="note"
    >
      {/* Subtle radial gradient background hint based on status */}
      <div
        className={`pointer-events-none absolute -inset-px opacity-20 transition-opacity duration-500 group-hover:opacity-30 ${
          isPaid
            ? 'bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-500/20 to-transparent'
            : urgent
              ? 'bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-red-500/20 to-transparent'
              : 'bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-amber-500/20 to-transparent'
        }`}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 shadow-inner transition-colors duration-500 ${
          isPaid
            ? 'bg-emerald-500/10 text-emerald-400'
            : urgent
              ? 'bg-red-500/10 text-red-400'
              : 'bg-amber-500/10 text-amber-400'
        }`}
      >
        {isPaid ? <Check className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}
      </div>

      <div className="relative z-10 min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              Ops Note
              <span
                className={`transition-colors duration-500 ${
                  isPaid ? 'text-emerald-400' : urgent ? 'text-red-400' : warn ? 'text-amber-400' : ''
                }`}
              >
                {isPaid ? ' · Paid' : warn ? ' · Renewal Soon' : ''}
              </span>
            </p>
            <h3 className="text-base font-medium tracking-tight text-white/95">{EMAIL_STORAGE_SUB.label}</h3>
          </div>

          {!loading && !isPaid && warn && (
            <button
              type="button"
              onClick={() => void handleMarkPaid()}
              disabled={markingPaid}
              className="relative shrink-0 overflow-hidden rounded-lg bg-white/5 px-4 py-2 text-xs font-medium text-white ring-1 ring-inset ring-white/10 transition-all hover:bg-white/10 hover:ring-white/20 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {markingPaid ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white/70" />
                  Saving…
                </span>
              ) : (
                'Mark as Paid'
              )}
            </button>
          )}

          {!loading && isPaid && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <Check className="h-3 w-3" />
              Paid
            </span>
          )}
        </div>

        <p className="text-sm leading-relaxed text-white/60">
          {isPaid ? (
            <>
              This period is marked <strong className="font-medium text-emerald-400">paid</strong> through{' '}
              <strong className="font-medium text-white/85">{endLabel}</strong>. Renewal reminders are paused until the next
              billing cycle.
            </>
          ) : (
            <>
              Availed on <strong className="font-medium text-white/85">August 17, 2026</strong>. Current period ends{' '}
              <strong className="font-medium text-white/85">{endLabel}</strong>
              {period.daysLeft >= 0 ? (
                <>
                  {' '}
                  (<strong className="font-medium text-white/85">{period.daysLeft} day{period.daysLeft === 1 ? '' : 's'}</strong>{' '}
                  left).
                </>
              ) : (
                <>
                  {' '}
                  — <strong className="font-medium text-red-400">past due / renew now</strong>.
                </>
              )}{' '}
              Staff get a notification in the bell menu starting{' '}
              <strong className="font-medium text-white/85">{EMAIL_STORAGE_SUB.warnDaysBefore} days</strong> before renewal.
            </>
          )}
        </p>

        {!isPaid && warn && (
          <p className="text-xs text-white/40">
            After payment, click <strong className="font-medium text-white/60">Mark as Paid</strong> to clear this cycle&apos;s
            reminder.
          </p>
        )}
      </div>
    </div>
  )
}
