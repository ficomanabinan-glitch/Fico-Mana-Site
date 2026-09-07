'use client'

import { useRef, useState } from 'react'
import { Mail } from 'lucide-react'
import { adminBtnPrimary, adminInput, adminLabel, adminPanel } from '@/lib/admin-ui'

export default function EmailTestSettings({ configured, fromAddress }: { configured: boolean; fromAddress?: string | null }) {
  const [to, setTo] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const inFlight = useRef(false)
  const attempt = useRef<{ to: string; requestId: string } | null>(null)

  async function sendTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || !configured || result?.success) return
    inFlight.current = true
    setSending(true)
    setResult(null)
    try {
      const recipient = to.trim()
      if (!attempt.current || attempt.current.to !== recipient) {
        attempt.current = { to: recipient, requestId: crypto.randomUUID() }
      }
      const response = await fetch('/api/emails/health', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current),
      })
      const body = await response.json().catch(() => ({})) as { success?: boolean; resendId?: string; error?: string; to?: string }
      if (!response.ok || !body.success || !body.resendId) {
        const reason = body.error || 'Email result could not be confirmed.'
        throw new Error(reason.includes('Try:') ? reason : `${reason} Try: check that you are signed in and review the email history before retrying.`)
      }
      setResult({ success: true, message: `The email service accepted the test for ${body.to || recipient}. Check the inbox and spam folder to confirm delivery. Reference: ${body.resendId}` })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Email result could not be confirmed.'
      setResult({ success: false, message: reason.includes('Try:') ? reason : `${reason} Try: review the email history, then retry this same request.` })
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <section className={`${adminPanel} space-y-4 p-5`} aria-labelledby="email-test-title">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 size-5 shrink-0 text-[#C4CEFF]" />
        <div className="min-w-0">
          <h2 id="email-test-title" className="text-sm font-semibold">Test email delivery</h2>
          <p className="mt-1 break-words text-xs text-white/50">Sender: {fromAddress || 'Not available'}</p>
          <p className="mt-1 text-xs text-white/40">Send one real test email without creating a booking. You can send up to 5 test requests per hour.</p>
        </div>
      </div>
      <form onSubmit={sendTest} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="email-test-recipient" className={adminLabel}>Test recipient</label>
          <input id="email-test-recipient" type="email" required maxLength={254} autoComplete="email"
            className={`${adminInput} mt-1.5`} placeholder="Your email address" value={to} disabled={sending}
            onChange={(event) => { setTo(event.target.value); setResult(null) }} />
        </div>
        <button type="submit" disabled={!configured || sending || !to.trim() || result?.success}
          className={`${adminBtnPrimary} shrink-0 cursor-pointer px-5 py-3`}>
          {sending ? 'Sending test…' : result?.success ? 'Test accepted' : result ? 'Retry same test' : 'Send test email'}
        </button>
      </form>
      {result && <p role={result.success ? 'status' : 'alert'} className={`break-words rounded-lg border p-3 text-xs leading-relaxed ${result.success ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200' : 'border-amber-400/20 bg-amber-400/5 text-amber-200'}`}>{result.message}</p>}
    </section>
  )
}
