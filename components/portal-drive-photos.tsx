'use client'

import { useRef, useState } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const action = 'inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-[#C4CEFF]/25 bg-[#C4CEFF]/[0.06] px-4 py-2.5 text-xs font-semibold text-[#C4CEFF] transition hover:border-[#C4CEFF]/50 hover:bg-[#C4CEFF]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto'
const validFolderUrl = (value?: string) => typeof value === 'string' && /^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+$/.test(value) ? value : ''

/** Keep the verified link in memory only. A new visit asks for the PIN again. */
export default function PortalDrivePhotos({ publicId, initialUrl, warning }: { publicId: string; initialUrl?: string; warning?: string }) {
  const [url, setUrl] = useState(() => validFolderUrl(initialUrl))
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(warning || '')
  const title = useRef<HTMLHeadingElement>(null)
  const pending = useRef(false)

  const verify = async () => {
    if (pending.current || !/^[0-9]{4}$/.test(pin)) return
    pending.current = true
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/editor-workflow/portal/${encodeURIComponent(publicId)}/drive-photos`, {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
      })
      const body = await response.json().catch(() => ({})) as { url?: string; error?: string; code?: string }
      if (body.code === 'RATE_LIMITED') throw new Error('Too many PIN attempts. Try: wait 15 minutes before trying again. You can still view your portal photos.')
      if (!response.ok || !validFolderUrl(body.url)) throw new Error(body.error || 'Your photo folder could not be opened. Try: wait a moment and try again, or ask FICO MANA to check your folder.')
      setUrl(validFolderUrl(body.url))
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your photo folder could not be opened. Try: check your connection and try again.')
    } finally {
      setPin('')
      setBusy(false)
      pending.current = false
    }
  }

  return <section className="fico-card border border-white/10 bg-white/[0.02]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-card-title font-semibold tracking-heading"><FolderOpen className="size-4 shrink-0 text-[#C4CEFF]"/>All Photos</h2><p className="mt-2 text-xs leading-relaxed text-white/45">Open your original photos in Google Drive.</p></div>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={action}>View All Photos<ExternalLink className="size-3.5 shrink-0"/></a> : <button type="button" onClick={() => { setPin(''); setMessage(''); setOpen(true) }} className={action}>View All Photos<ExternalLink className="size-3.5 shrink-0"/></button>}
    </div>
    <p className="mt-3 text-caption leading-relaxed text-white/40">Use the Google account that has access to your folder. If Drive asks for permission, contact FICO MANA to share it with you.</p>
    {!open && message ? <p role="status" className="mt-3 text-xs leading-relaxed text-amber-200">{message}</p> : null}
    <Sheet open={open} onOpenChange={value => { if (!pending.current) { setOpen(value); setPin('') } }}>
      {open ? <SheetContent side="bottom" initialFocus={title} showCloseButton={!busy} className="client-portal max-h-[90dvh] rounded-t-card border-white/10 bg-[#202020] text-white sm:mx-auto sm:max-w-lg">
        <SheetHeader className="pr-12"><SheetTitle ref={title} tabIndex={-1} className="font-sans text-white">View All Photos</SheetTitle><SheetDescription className="mt-2 text-xs leading-relaxed text-white/50">Enter the last 4 digits of your booking phone number to open your Google Drive folder. This will not change your submitted selection.</SheetDescription></SheetHeader>
        <form className="fico-portal-sheet-content min-h-0 overflow-y-auto px-4" onSubmit={event => { event.preventDefault(); void verify() }}>
          <label htmlFor="drive-photos-pin" className="block text-xs font-semibold text-[#C4CEFF]">PIN</label>
          <input id="drive-photos-pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" disabled={busy} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} className="mt-2 h-11 w-full rounded-control border border-white/15 bg-[#252525] px-3 text-base tracking-[0.35em] outline-none focus:border-[#C4CEFF]/60"/>
          {message ? <p role="alert" className="mt-3 text-xs leading-relaxed text-red-200">{message}</p> : null}
          <button type="submit" disabled={busy || !/^[0-9]{4}$/.test(pin)} className={`${action} mt-4`}>{busy ? 'Checking PIN…' : 'Verify PIN'}</button>
        </form>
      </SheetContent> : null}
    </Sheet>
  </section>
}
