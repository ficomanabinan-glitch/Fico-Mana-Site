'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, ArrowRight } from 'lucide-react'
import { adminInput, adminPanel } from '@/lib/admin-ui'
import type { ClientWorkspaceSearch } from '@/lib/client-workspace-types'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

const statusLabel = (status: string) => status.replace(/[_-]+/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())
const openSearchEvent = 'fico:open-client-search'

export function ClientSearchResults({ onOpen }: { onOpen?: () => void }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ClientWorkspaceSearch | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const term = query.trim()
  useEffect(() => {
    const controller = new AbortController()
    setResult(null); setError('')
    if (term.length < 2) { setLoading(false); return }
    setLoading(true)
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/client-workspace/search?q=${encodeURIComponent(term)}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
        .then(async response => {
          const body = await response.json()
          if (!response.ok) throw new Error(body.error || 'Client search is unavailable.')
          return body as ClientWorkspaceSearch
        }).then(value => { if (!controller.signal.aborted) setResult(value) })
        .catch(() => { if (!controller.signal.aborted) setError('Client search could not be loaded. Your search is kept; try again.') })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [term, retry])
  return <div className="space-y-4">
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white">Find a client or booking</label>
      <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/65"/>
        <input id={id} type="search" value={query} onChange={event => setQuery(event.target.value)} className={`${adminInput} pl-10`} placeholder="Name, FM reference, email, or phone" autoComplete="off" maxLength={120} aria-describedby={`${id}-help`}/></div>
      <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-white/65">Search once, then open the client’s bookings, payments, photos, and production history.</p>
    </div>
    <div aria-live="polite" aria-busy={loading}>
      {loading ? <p className="text-sm text-white/70">Searching clients…</p> : error ? <div role="alert" className="space-y-2 text-sm text-amber-200"><p>{error}</p><button type="button" onClick={() => setRetry(n => n + 1)} className="min-h-11 rounded-control border border-amber-200/30 px-4 text-white">Retry search</button></div> : result ? <>
        <p className="mb-3 text-xs text-white/65">{result.results.length} matching booking{result.results.length === 1 ? '' : 's'}{result.hasMore ? ' · Refine your search for more matches' : ''}</p>
        {result.results.length ? <ul className="divide-y divide-white/10">{result.results.map(item => <li key={item.bookingId}>
          <Link href={item.href} onClick={onOpen} className="group flex min-h-11 items-center justify-between gap-4 rounded-control px-3 py-4 outline-none transition hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-primary">
            <div className="min-w-0"><p className="break-words text-sm font-semibold text-white">{item.name}</p><p className="mt-1 break-words text-xs text-white/70">{item.bookingId} · {item.packageName} · {item.shootDate}</p><p className="mt-1 text-xs text-white/65">{item.contactHint ? `${item.contactHint} · ` : ''}{statusLabel(item.productionStatus || item.bookingStatus)}</p></div><ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true"/>
          </Link></li>)}</ul> : <p className="text-sm text-white/70">No clients found. Try their FM reference, email, or phone instead.</p>}
      </> : <p className="text-sm text-white/65">Enter at least two characters. People with similar names stay separate.</p>}
    </div>
  </div>
}
export function ClientSearchCard() {
  return <section aria-label="Client search" className={`${adminPanel} flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5`}>
    <div><h2 className="text-sm font-semibold text-white">Find a client</h2><p className="mt-1 text-sm text-white/70">Open their bookings, payments, photos, and production history in one workspace.</p></div>
    <button type="button" onClick={event => window.dispatchEvent(new CustomEvent(openSearchEvent, { detail: event.currentTarget }))} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-white/15 px-4 text-sm text-white outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary"><Search className="size-4" aria-hidden="true"/>Open client search</button>
  </section>
}

export default function AdminClientSearch() {
  const [open, setOpen] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const handleOpen = (event: Event) => {
      const opener = (event as CustomEvent<unknown>).detail
      if (!(opener instanceof HTMLElement)) return
      returnFocus.current = opener
      setOpen(true)
    }
    window.addEventListener(openSearchEvent, handleOpen)
    return () => window.removeEventListener(openSearchEvent, handleOpen)
  }, [])
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger onClick={() => { returnFocus.current = null }} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control border border-white/15 px-3 text-sm text-white/85 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary" aria-label="Search clients"><Search className="size-4" aria-hidden="true"/><span className="hidden sm:inline">Search clients</span></SheetTrigger>
    <SheetContent side="right" finalFocus={() => returnFocus.current?.isConnected ? returnFocus.current : true} className="!w-full !max-w-xl overflow-y-auto border-white/15 bg-[#222222] p-5 font-sans text-white [&_[data-slot=sheet-close]]:min-h-11 [&_[data-slot=sheet-close]]:min-w-11 sm:p-6" overlayClassName="bg-black/70">
      <SheetHeader className="p-0 pr-14"><SheetTitle className="font-sans text-xl text-white">Search clients</SheetTitle><SheetDescription className="mt-2 text-white/70">Open one workspace for the whole client journey.</SheetDescription></SheetHeader>
      <ClientSearchResults onOpen={() => setOpen(false)}/>
    </SheetContent>
  </Sheet>
}
