'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

type Enrollment = { id: string; qrCode: string; secret: string }

async function audit(eventType: 'mfa_enrollment_started' | 'mfa_verified' | 'mfa_challenge_failed') {
  await fetch('/api/security/mfa-event', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType }),
  }).catch(() => undefined)
}

export default function AdminMfaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [factorId, setFactorId] = useState('')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const client = createSupabaseBrowserClient()
    void (async () => {
      const { data: userData } = await client.auth.getUser()
      if (!userData.user) {
        router.replace('/admin')
        return
      }
      const { data: assurance } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance?.currentLevel === 'aal2') {
        router.replace('/admin/dashboard')
        return
      }
      const { data: factors, error } = await client.auth.mfa.listFactors()
      if (error) setMessage('Could not load your security factors. Please sign in again.')
      const verified = factors?.totp.find((factor) => factor.status === 'verified')
      if (verified) setFactorId(verified.id)
      setLoading(false)
    })()
  }, [router])

  const beginEnrollment = async () => {
    setBusy(true)
    setMessage('')
    const client = createSupabaseBrowserClient()
    try {
      const { data: factors } = await client.auth.mfa.listFactors()
      for (const factor of factors?.totp ?? []) {
        if (factor.status !== 'verified') await client.auth.mfa.unenroll({ factorId: factor.id })
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'FICO MANA Admin',
      })
      if (error) throw error
      setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
      setFactorId(data.id)
      await audit('mfa_enrollment_started')
    } catch {
      setMessage('Could not start MFA enrollment. Please sign out and try again.')
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!factorId || !/^\d{6}$/.test(code)) {
      setMessage('Enter the current six-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setMessage('')
    const client = createSupabaseBrowserClient()
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) throw error
      await client.auth.refreshSession()
      await audit('mfa_verified')
      router.replace('/admin/dashboard')
      router.refresh()
    } catch {
      await audit('mfa_challenge_failed')
      setMessage('That code could not be verified. Check the time on your device and try again.')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    const client = createSupabaseBrowserClient()
    await client.auth.signOut()
    router.replace('/admin')
    router.refresh()
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#181818] text-white">
        <Loader2 className="size-6 animate-spin text-[#C4CEFF]" aria-label="Loading security verification" />
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#181818] p-5 text-white">
      <section className="w-full max-w-lg border border-white/10 bg-[#222222] p-7 shadow-2xl sm:p-9">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/20 text-[#C4CEFF]">
          <ShieldCheck className="size-6" />
        </div>
        <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.3em] text-[#C4CEFF]">FICO MANA SECURITY</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">Two-step verification</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55">
          Owner and administrator accounts must verify an authenticator code before opening private client, payment, or financial records.
        </p>

        {!factorId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void beginEnrollment()}
            className="mt-7 flex h-11 w-full items-center justify-center gap-2 bg-primary text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 hover:bg-[#0300a8] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Set up authenticator
          </button>
        ) : null}

        {enrollment ? (
          <div className="mt-7 space-y-4 border border-white/10 bg-black/20 p-5">
            {/* Supabase returns a local data URI; no receipt or account data leaves the browser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qrCode} alt="Authenticator setup QR code" className="mx-auto size-48 bg-white p-2" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">Manual setup key</p>
              <code className="mt-1 block break-all rounded bg-black/30 p-2 text-xs text-white/75">{enrollment.secret}</code>
            </div>
          </div>
        ) : null}

        {factorId ? (
          <div className="mt-7 space-y-3">
            <label htmlFor="mfa-code" className="block text-[10px] font-bold uppercase tracking-wider text-white/45">
              Six-digit authenticator code
            </label>
            <input
              id="mfa-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="h-12 w-full border border-white/10 bg-black/25 px-4 text-center text-xl tracking-[0.45em] outline-none focus:border-[#C4CEFF]/60"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => void verify()}
              className="flex h-11 w-full items-center justify-center gap-2 bg-primary text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 hover:bg-[#0300a8] disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Verify and continue
            </button>
          </div>
        ) : null}

        {message ? <p role="alert" className="mt-4 border border-red-500/20 bg-red-500/[0.07] p-3 text-xs text-red-200">{message}</p> : null}

        <button type="button" onClick={() => void signOut()} className="mx-auto mt-6 flex items-center gap-2 text-xs text-white/40 hover:text-white">
          <LogOut className="size-3.5" /> Sign out
        </button>
      </section>
    </main>
  )
}
