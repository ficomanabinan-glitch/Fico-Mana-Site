'use client'
import { useCachedPageRead } from '@/components/use-cached-page-read'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCircle2, Pause, ShieldCheck } from 'lucide-react'
import { adminBtnGhost, adminBtnPrimary, adminCard } from '@/lib/admin-ui'
import type { ShootReminderControl } from '@/lib/shoot-reminder-settings'

const endpoint = '/api/admin/shoot-reminders/settings'
const stamp = (date: string) => new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(date))

export default function ShootReminderSettings() {
  const [control, setControl, loading, setLoading] = useCachedPageRead<ShootReminderControl | null>('admin:reminder-settings', null)
  const [busy, setBusy] = useState<'check' | 'enable' | 'pause' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const requestVersion = useRef(0)
  const mutationInFlight = useRef(false)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (mutationInFlight.current) return
    const version = ++requestVersion.current
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Settings unavailable. Try: refresh this page.')
      if (!signal?.aborted && version === requestVersion.current) { setControl(body); setError('') }
    } catch (failure) {
      if (!signal?.aborted && version === requestVersion.current) {
        setError(failure instanceof Error ? failure.message : 'Try: check your connection and refresh.')
      }
    } finally { if (!signal?.aborted && version === requestVersion.current) setLoading(false) }
  }, [setControl, setLoading])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    if (control?.probeStatus !== 'checking' || busy) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const stopAt = Date.now() + 100_000
    const poll = async () => {
      await refresh(controller.signal)
      if (!controller.signal.aborted && Date.now() < stopAt) timer = setTimeout(poll, 3000)
    }
    timer = setTimeout(poll, 2000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [control?.probeStatus, control?.checkedAt, busy, refresh])

  useEffect(() => {
    if (!control?.enabled) return
    const controller = new AbortController()
    const update = () => { if (document.visibilityState === 'visible') void refresh(controller.signal) }
    const timer = setInterval(update, 3 * 60_000)
    document.addEventListener('visibilitychange', update)
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [control?.enabled, refresh])

  async function apply(action: 'check' | 'enable' | 'pause') {
    if (mutationInFlight.current) return
    mutationInFlight.current = true
    const version = ++requestVersion.current
    setBusy(action); setError(''); setMessage('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Settings were not saved. Try: refresh and try again.')
      if (version === requestVersion.current) {
        setControl(body)
        setMessage(action === 'enable' ? 'Reminders enabled. They stay on until an administrator disables them.'
          : action === 'pause' ? 'Reminders disabled. Client responses and email history are preserved.'
            : 'Checking the reminder service. This check does not send client emails.')
      }
    } catch (failure) {
      if (version === requestVersion.current) setError(failure instanceof Error ? failure.message : 'Try: check your connection and try again.')
    } finally { mutationInFlight.current = false; setBusy(null) }
  }

  const checking = control?.probeStatus === 'checking'
  const enabled = control?.enabled
  const mismatch = control && control.enabled !== control.schedulerActive
  const button = 'inline-flex cursor-pointer items-center justify-center gap-2 px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50'

  return <section className={`${adminCard} p-5 sm:p-6`} aria-labelledby="reminder-settings-title" data-testid="shoot-reminder-settings">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-[#C4CEFF]"><Bell className="size-4"/>Automation settings</p>
        <h2 id="reminder-settings-title" className="mt-2 text-lg font-semibold">Shoot reminders</h2>
        <p className="mt-1 max-w-2xl text-sm text-white/50">Once enabled, reminders stay on until an administrator disables them. Errors are reported without switching reminders off.</p>
      </div>
      {!loading && control ? <span role="status" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${enabled&&!mismatch&&!control.runtimeIssue?'border-emerald-300/25 text-emerald-300':'border-amber-200/25 text-amber-200'}`}>{enabled?(mismatch||control.runtimeIssue?'Enabled · Needs attention':'Enabled'):mismatch?'Disabled · Needs attention':'Disabled'}</span>:null}
    </div>

    {loading ? <div role="status" aria-label="Loading reminder settings" className="mt-5 animate-pulse space-y-3"><div className="h-20 rounded-lg bg-white/5"/><div className="h-11 w-56 rounded-lg bg-white/10"/></div> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-black/10 p-4"><p className="text-xs text-white/45">First reminder</p><p className="mt-1 font-semibold">1 day before · 6:00 AM</p><p className="mt-1 text-xs text-white/45">Philippine time (Asia/Manila)</p></div>
        <div className="rounded-lg border border-white/10 bg-black/10 p-4"><p className="text-xs text-white/45">Shoot-day reminder</p><p className="mt-1 font-semibold">On the shoot date · 6:00 AM</p><p className="mt-1 text-xs text-white/45">Philippine time (Asia/Manila)</p></div>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-[#C4CEFF]/5 p-4 text-xs leading-relaxed text-white/65"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#C4CEFF]"/><p>The shoot-day email is sent only after a successful first email, to clients who <strong className="text-white">confirmed or have not responded</strong>. Clients who can’t attend are excluded. Declining does not cancel a booking or change payments.</p></div>
      {control ? <div className="mt-4 space-y-1 text-xs text-white/50" aria-live="polite">
        <p>Email setup: {control.emailConfigured?'Present':'Missing'}{control.senderAddress?` · ${control.senderAddress}`:''}</p>
        <p>Reminder service: {checking?'Checking…':control.probeStatus==='ready'?'Check passed':control.probeStatus==='failed'?'Check failed':'Not checked yet'}</p>
        {control.checkedAt?<p>Last check: {stamp(control.checkedAt)} PHT</p>:null}
        {control.lastCompletedAt?<p>Last scheduled run: {stamp(control.lastCompletedAt)} PHT</p>:null}
        <p className="pt-1 text-white/35">This check confirms that reminders can run. Use a test email to check delivery. Failed reminders are retried between 6 and 8 AM.</p>
      </div>:null}
      {mismatch?<p role="alert" className="mt-4 text-sm text-amber-200">The reminder schedule needs attention. Try: Check Reminder Service to repair the schedule, or Disable Reminders to stop future sends.</p>:null}
      {control?.problem?<p role="alert" className="mt-4 text-sm text-amber-200">{control.problem}</p>:null}
      {control?.runtimeIssue?<p role="alert" className="mt-4 text-sm text-amber-200">{control.runtimeIssue.message}{typeof control.failedToday==='number'&&control.failedToday>0?` ${control.failedToday} reminder${control.failedToday===1?'':'s'} failed today.`:''} {enabled?'Reminders are still enabled.':'Reminders are disabled.'}</p>:null}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" disabled={!!busy || !!checking || !control} onClick={()=>void apply('check')} className={`${adminBtnGhost} ${button}`}>
          <ShieldCheck className="size-4"/>{busy==='check'||checking?'Checking…':'Check Reminder Service'}
        </button>
        {control?.enabled || control?.schedulerActive ? <button type="button" disabled={!!busy} onClick={()=>void apply('pause')} className={`${adminBtnGhost} ${button}`}>
          <Pause className="size-4"/>{busy==='pause'?'Disabling…':'Disable Reminders'}
        </button> : <button type="button" disabled={!!busy || !control?.canActivate || !control.emailConfigured} onClick={()=>void apply('enable')} className={`${adminBtnPrimary} ${button}`}>
          <CheckCircle2 className="size-4"/>{busy==='enable'?'Enabling…':'Enable Reminders'}
        </button>}
        <button type="button" disabled={!!busy} onClick={()=>void refresh()} className={`${button} rounded-lg text-xs text-white/50 transition hover:bg-white/5 hover:text-white`}>Refresh status</button>
      </div>
      {!enabled&&!control?.canActivate?<p className="mt-3 text-xs text-white/40">Check the service before enabling reminders. Once enabled, they stay on until an administrator disables them.</p>:null}
    </>}
    {error?<p role="alert" className="mt-4 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>:null}
    {message?<p role="status" className="mt-4 text-sm text-[#C4CEFF]">{message.startsWith('Checking')&&control?.probeStatus==='ready'?'Reminder service check passed. No client emails were sent by this check.':message.startsWith('Checking')&&control?.probeStatus==='failed'?'The service check failed; reminder settings were not enabled.':message}</p>:null}
  </section>
}
