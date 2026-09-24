'use client'

import { useCallback, useEffect, useState } from 'react'
import { getEmailLogs, peekEmailLogs, EmailLog } from '@/lib/data-store'
import { Search, Clock, Eye, X, Mail, AlertTriangle } from 'lucide-react'
import {
  adminPage,
  adminCard,
  adminPanel,
  adminInput,
  adminBtnGhost,
  adminOverlay,
  adminModal,
  emailStatusBadge,
} from '@/lib/admin-ui'
import AdminPageHeader from '@/components/admin-page-header'
import { useOnAdminDbSync } from '@/components/admin-auto-sync'
import { useAdminToast } from '@/components/admin-toast-provider'
import { AdminPageSkeleton } from '@/components/admin-page-skeleton'
import { emailUsagePercent, type EmailPlan } from '@/lib/email-usage'

type EmailUsage = {
  plan: EmailPlan
  monthlyLimit: number
  dailyLimit: number | null
  sentThisMonth: number
  failedThisMonth: number
  sentToday: number
  periodStart: string
  periodEnd: string
  source: 'fico-mana-email-logs'
}

export default function EmailLogsConsole() {
  const toast = useAdminToast()
  const [logs, setLogs] = useState<EmailLog[]>(() => peekEmailLogs() ?? [])
  const [filteredLogs, setFilteredLogs] = useState<EmailLog[]>(() => peekEmailLogs() ?? [])
  const [loading, setLoading] = useState(() => peekEmailLogs() === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null)
  const [usage, setUsage] = useState<EmailUsage | null>(null)
  const [usageError, setUsageError] = useState(false)
  const [savingPlan, setSavingPlan] = useState<EmailPlan | null>(null)

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const data = await getEmailLogs()
      setLogs(data)
      setFilteredLogs(data)
    } catch (err) {
      console.error(err)
      if (!silent) toast.error('Sync failed', 'Could not load email history. Try: refresh the page.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  const fetchUsage = useCallback(async (silent = false) => {
    try {
      const response = await fetch('/api/emails/usage', { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error('Email allowance could not be loaded.')
      setUsage(await response.json() as EmailUsage)
      setUsageError(false)
    } catch (err) {
      console.error(err)
      setUsageError(true)
      if (!silent) toast.error('Usage unavailable', 'Could not load the email allowance. Try: refresh Email Logs.')
    }
  }, [toast])

  const refreshAll = useCallback(async (silent = false) => {
    await Promise.all([fetchLogs(silent), fetchUsage(silent)])
  }, [fetchLogs, fetchUsage])

  useEffect(() => {
    void refreshAll(true)
  }, [refreshAll])

  useOnAdminDbSync(() => void refreshAll(true))

  useEffect(() => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      setFilteredLogs(
        logs.filter(
          (l) =>
            l.recipientEmail.toLowerCase().includes(term) ||
            l.subject.toLowerCase().includes(term) ||
            l.bookingId.toLowerCase().includes(term),
        ),
      )
    } else {
      setFilteredLogs(logs)
    }
  }, [searchTerm, logs])

  const savePlan = async (plan: EmailPlan) => {
    if (savingPlan || usage?.plan === plan) return
    setSavingPlan(plan)
    try {
      const response = await fetch('/api/emails/usage', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const body = await response.json().catch(() => null) as EmailUsage | { error?: string } | null
      if (!response.ok || !body || !('plan' in body)) {
        throw new Error(body && 'error' in body && body.error ? body.error : 'Email plan could not be saved.')
      }
      setUsage(body)
      setUsageError(false)
      toast.success('Email allowance updated', `${plan === 'free' ? 'Free' : 'Pro'} plan monitoring is now active.`)
    } catch (error) {
      toast.error('Plan not saved', error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSavingPlan(null)
    }
  }

  if (loading) {
    return <AdminPageSkeleton variant="emails" />
  }

  return (
    <div className={adminPage}>
      <AdminPageHeader
        title="System Email Logs"
        subtitle="Check sent emails and delivery status."
        onRefresh={() => void refreshAll()}
        refreshing={refreshing}
      />

      {usage ? (
        <section className={`${adminPanel} p-5 sm:p-6`} aria-labelledby="email-usage-heading">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-control border border-[#8fa0ff]/25 bg-[#8fa0ff]/10 text-[#C4CEFF]">
                <Mail className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 id="email-usage-heading" className="text-body font-semibold text-white">Monthly email allowance</h2>
                <p className="mt-1 text-small leading-relaxed text-white/65">
                  Accepted emails recorded by FICO MANA this calendar month.
                </p>
              </div>
            </div>

            <div className="inline-flex w-full rounded-control border border-white/10 bg-black/20 p-1 sm:w-auto" role="group" aria-label="Resend plan used for monitoring">
              {(['free', 'pro'] as const).map((plan) => (
                <button
                  key={plan}
                  type="button"
                  aria-pressed={usage.plan === plan}
                  disabled={savingPlan !== null}
                  onClick={() => void savePlan(plan)}
                  className={`min-h-10 flex-1 rounded-[calc(var(--fico-radius-control)-4px)] px-4 text-small font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 sm:flex-none ${
                    usage.plan === plan ? 'bg-[#8fa0ff] text-[#11131b]' : 'text-white/65 hover:bg-white/[0.05] hover:text-white'
                  } disabled:cursor-wait disabled:opacity-60`}
                >
                  {savingPlan === plan ? 'Saving…' : plan === 'free' ? 'Free · 3,000' : 'Pro · 50,000'}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-[clamp(1.65rem,3vw,2.35rem)] font-semibold tracking-[-0.035em] text-white tabular-nums">
                  {usage.sentThisMonth.toLocaleString()} <span className="text-base font-medium tracking-normal text-white/50">of {usage.monthlyLimit.toLocaleString()}</span>
                </p>
                <p className="text-small text-white/65 tabular-nums">
                  {Math.max(0, usage.monthlyLimit - usage.sentThisMonth).toLocaleString()} remaining
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden="true">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${emailUsagePercent(usage.sentThisMonth, usage.monthlyLimit) >= 90 ? 'bg-amber-400' : 'bg-[#8fa0ff]'}`}
                  style={{ width: `${emailUsagePercent(usage.sentThisMonth, usage.monthlyLimit)}%` }}
                />
              </div>
              <p className="mt-2 text-caption text-white/50">
                Resets {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(usage.periodEnd))}
                {usage.failedThisMonth > 0 ? ` · ${usage.failedThisMonth.toLocaleString()} failed attempts are excluded` : ''}
              </p>
            </div>

            {usage.dailyLimit ? (
              <div className="rounded-control border border-white/10 bg-white/[0.025] px-4 py-3 lg:min-w-48">
                <p className="text-caption font-semibold uppercase tracking-label text-white/50">Free daily limit</p>
                <p className="mt-1 text-body font-semibold text-white tabular-nums">{usage.sentToday} <span className="text-small font-medium text-white/50">of {usage.dailyLimit}</span></p>
              </div>
            ) : (
              <p className="pb-1 text-small text-white/50">No daily plan limit</p>
            )}
          </div>

          {usage.sentThisMonth >= usage.monthlyLimit * 0.8 && (
            <div className="mt-4 flex items-start gap-2 rounded-control border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2.5 text-small text-amber-100" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>{usage.sentThisMonth >= usage.monthlyLimit ? 'The configured monthly allowance has been reached.' : 'More than 80% of the configured monthly allowance has been used.'} Check the Resend dashboard before sending a large batch.</p>
            </div>
          )}
        </section>
      ) : usageError ? (
        <div className={`${adminCard} flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center`} role="status">
          <p className="text-small text-white/65">Email allowance is unavailable. The delivery history below can still be used.</p>
          <button type="button" className={`px-4 ${adminBtnGhost}`} onClick={() => void fetchUsage()}>Retry counter</button>
        </div>
      ) : (
        <div className={`${adminCard} h-48 animate-pulse`} aria-label="Loading email allowance" />
      )}

      <div className={`${adminCard} p-4`}>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={searchTerm}
            aria-label="Search email logs"
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by recipient, subject, or booking reference..."
            className={`${adminInput} pl-11`}
          />
        </div>
      </div>

      <div className={`${adminPanel} overflow-hidden divide-y divide-white/5`}>
        {filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-white/40 text-xs">No system email logs found.</div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="p-5 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-primary">{log.bookingId}</span>
                  <span className="text-white/20">&bull;</span>
                  <span className="font-semibold text-white/80">{log.recipientEmail}</span>
                  <span className="text-white/20">&bull;</span>
                  <span className={`text-caption font-semibold px-2 py-0.5 uppercase ${emailStatusBadge(log.status as 'SENT' | 'FAILED')}`}>
                    {log.status}
                  </span>
                </div>
                <h4 className="font-bold text-white truncate">{log.subject}</h4>
                <div className="flex items-center gap-1 text-caption text-white/40">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(log.sentAt).toLocaleString()}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(log)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 ${adminBtnGhost}`}
              >
                <Eye className="w-3.5 h-3.5" /> View Body
              </button>
            </div>
          ))
        )}
      </div>

      {selectedLog && (
        <div className={`${adminOverlay} items-center justify-center p-4`}>
          <div className={`${adminModal} max-w-2xl w-full flex flex-col h-[85vh]`}>
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <div className="space-y-0.5">
                <span className="text-caption font-semibold text-white/40 uppercase tracking-label">Email Inspector</span>
                <h3 className="font-bold text-white">{selectedLog.subject}</h3>
                <p className="text-caption text-white/40">
                  Sent to: {selectedLog.recipientEmail} on {new Date(selectedLog.sentAt).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-1.5 hover:bg-white/5 text-white/40">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-black/40 p-4 sm:p-6 overflow-y-auto flex justify-center items-start">
              {/* iframe isolates email HTML from admin dark-theme text (avoids white-on-white). */}
              <iframe
                title="Email body preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><base target="_blank"/><style>
                  html,body{margin:0;padding:0;background:#f1f5f9;color:#0f172a;}
                  body{padding:16px;font-family:system-ui,-apple-system,sans-serif;}
                  a{color:#0500D0;}
                </style></head><body>${selectedLog.body}</body></html>`}
                className="w-full max-w-[640px] min-h-[420px] h-[min(60vh,560px)] bg-white shadow-md border border-white/10 rounded-sm"
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
              />
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className={`px-5 py-2.5 ${adminBtnGhost}`}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
