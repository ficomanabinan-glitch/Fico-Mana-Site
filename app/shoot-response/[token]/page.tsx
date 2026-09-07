'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { CalendarDays, CheckCircle2, MessageCircle, XCircle } from 'lucide-react'
import type { ShootResponse } from '@/lib/shoot-reminder-content'

type Invitation = {
  customerName: string; bookingId: string; packageName: string; shootDate: string
  bookingTime: string; arrivalTime: string; response: ShootResponse; responseNote: string
}

export default function ShootResponsePage() {
  const { token } = useParams<{ token: string }>()
  const query = useSearchParams()
  const initialChoice = query.get('choice') === 'declined' ? 'declined' : 'confirmed'
  const [choice, setChoice] = useState<'confirmed' | 'declined'>(initialChoice)
  const [data, setData] = useState<Invitation | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/shoot-response/${encodeURIComponent(token)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Could not load your reminder. Try: refresh this page.')
        setData(body); setNote(body.responseNote || '')
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message || 'Try: check your connection and reload.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token])

  async function submit() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const response = await fetch(`/api/shoot-response/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: choice, note }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not save your choice. Try: press Submit Response again.')
      setData(body); setSaved(true)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Try: check your connection and submit again.') }
    finally { setSaving(false) }
  }

  return <main className="min-h-screen bg-[#171717] px-4 py-10 text-white sm:py-16"><div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4CEFF]">FICO MANA Studio</p>
    <h1 className="mt-3 text-2xl font-semibold">Confirm your shoot</h1>
    {loading ? <div role="status" aria-label="Loading session details" className="mt-6 space-y-3 animate-pulse"><div className="h-5 w-2/3 rounded bg-white/10"/><div className="h-28 rounded bg-white/10"/><div className="h-12 rounded bg-white/10"/></div> : data ? <>
      <p className="mt-3 text-sm text-white/65">Hi {data.customerName}, please let us know if you can attend.</p>
      <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm"><p className="flex items-center gap-2 font-semibold"><CalendarDays className="size-4 text-[#C4CEFF]"/>{data.shootDate}</p><p className="mt-2">{data.packageName}</p><p className="mt-2 text-white/55">Session: {data.bookingTime}<br/>Arrival: {data.arrivalTime}<br/>Philippine time · {data.bookingId}</p></div>
      {data.response !== 'pending' ? <p role="status" className="mt-4 text-sm text-[#C4CEFF]">{saved ? 'Response saved: ' : 'Current response: '}{data.response === 'confirmed' ? 'Confirmed — we’ll see you at the studio.' : 'Unable to attend — our team will follow up.'}</p> : null}
      <fieldset className="mt-6 space-y-3" disabled={saving}><legend className="mb-3 text-sm font-semibold">Will you attend?</legend>{(['confirmed','declined'] as const).map(value => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition hover:bg-white/[0.06] ${choice===value?'border-[#C4CEFF]/60 bg-[#C4CEFF]/10':'border-white/15'}`}><input type="radio" name="attendance" value={value} checked={choice===value} onChange={()=>{setChoice(value);setSaved(false)}} className="accent-[#8d9aff]"/>{value==='confirmed'?<CheckCircle2 className="size-5 text-emerald-300"/>:<XCircle className="size-5 text-amber-200"/>}<span className="text-sm font-semibold">{value==='confirmed'?'Confirm My Shoot':'I Can’t Attend'}</span></label>)}</fieldset>
      <label className="mt-5 block text-sm text-white/60">Message for the studio (optional)<textarea value={note} onChange={event=>{setNote(event.target.value);setSaved(false)}} maxLength={500} rows={3} disabled={saving} className="mt-2 w-full resize-y rounded-lg border border-white/15 bg-black/20 p-3 text-sm text-white outline-none focus:border-[#C4CEFF]"/></label>
      {choice==='declined'?<p className="mt-2 text-xs leading-relaxed text-white/50">Our team will contact you about rescheduling or other next steps. This response does not automatically cancel your booking or change your payments.</p>:null}
      <button onClick={()=>void submit()} disabled={saving||saved} className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0500d0] px-4 py-3.5 text-sm font-semibold transition hover:bg-[#221bed] disabled:cursor-default disabled:opacity-60"><MessageCircle className="size-4"/>{saving?'Saving…':saved?'Response Saved':'Submit Response'}</button>
    </> : null}
    {error?<p role="alert" className="mt-5 rounded-lg border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>:null}
    <p className="mt-7 text-xs leading-relaxed text-white/40">FICO MANA Studio · Cabuyao Retail Plaza, Cabuyao, Laguna<br/><a className="mt-2 inline-block cursor-pointer text-[#C4CEFF] hover:underline" href="tel:+63495765176">Contact the studio: +63 49 576 5176</a></p>
  </div></main>
}
