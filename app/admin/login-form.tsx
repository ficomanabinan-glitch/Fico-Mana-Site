'use client'

import { useActionState, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, Lock, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import { loginAdmin } from './actions'
import { initialLoginState } from '@/lib/auth/login-state'
import { adminBtnPrimary, adminInput } from '@/lib/admin-ui'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function AdminLogin() {
  const searchParams = useSearchParams()
  const [state, formAction, pending] = useActionState(loginAdmin, initialLoginState)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (!state.retryAt) { setNow(null); return }
    const update = () => setNow(Math.floor(Date.now() / 1000))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [state.retryAt])

  const remainingSeconds = state.code === 'RATE_LIMITED' && state.retryAt
    ? Math.max(0, state.retryAt - (now ?? Math.floor(Date.now() / 1000)))
    : 0
  const locked = state.code === 'RATE_LIMITED' && remainingSeconds > 0
  const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60))
  const legacyAuthError = searchParams.get('error') === 'auth'

  return <div className="admin-console relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(143,160,255,0.18)_0%,_transparent_60%)]"/>
    <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-sm md:p-10">
      <div className="mb-8 space-y-2 text-center"><div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full border border-[#C4CEFF]/20 bg-[#C4CEFF]/10"><ShieldCheck className="size-5 text-[#C4CEFF]" aria-hidden="true"/></div><h1 className="font-serif text-3xl font-bold tracking-tight">FICO MANA</h1><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#C4CEFF]">Secure Staff Console</p></div>
      <form action={formAction} className="space-y-5">
        {locked?<Alert variant="warning"><AlertTriangle aria-hidden="true"/><AlertTitle>Login temporarily locked</AlertTitle><AlertDescription>Too many login attempts. Please try again in {remainingMinutes} {remainingMinutes===1?'minute':'minutes'}.</AlertDescription></Alert>:state.message?<Alert variant="destructive"><AlertTriangle aria-hidden="true"/><AlertTitle>Sign-in unsuccessful</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>:legacyAuthError?<Alert variant="destructive"><AlertTriangle aria-hidden="true"/><AlertTitle>Sign-in unsuccessful</AlertTitle><AlertDescription>Sign-in failed. Please try again.</AlertDescription></Alert>:null}
        <div className="space-y-2"><label htmlFor="email" className="text-[10px] font-semibold uppercase tracking-widest text-[#C4CEFF]">Staff Email</label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" aria-hidden="true"/><Input id="email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={320} required disabled={pending||locked} placeholder="you@ficomana.com" className={`${adminInput} pl-11`}/></div></div>
        <div className="space-y-2"><label htmlFor="password" className="text-[10px] font-semibold uppercase tracking-widest text-[#C4CEFF]">Password</label><div className="relative"><Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" aria-hidden="true"/><Input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required disabled={pending||locked} placeholder="Enter your password" className={`${adminInput} pl-11`}/></div></div>
        <Button type="submit" disabled={pending||locked} className={`flex h-auto w-full items-center justify-center gap-2 py-4 ${adminBtnPrimary}`}>{pending?<><RefreshCw className="size-4 animate-spin" aria-hidden="true"/>Authenticating…</>:locked?`Try again in ${remainingMinutes} ${remainingMinutes===1?'minute':'minutes'}`:'Login to Console'}</Button>
      </form>
      <p className="mt-8 text-center text-[10px] leading-relaxed text-white/30">Protected by server-validated Supabase authentication and rate limiting.</p>
    </div>
  </div>
}
