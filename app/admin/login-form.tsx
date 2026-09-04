'use client'

import { FormEvent, useRef, useState } from 'react'
import { AlertTriangle, Lock, Mail, RefreshCw, ShieldCheck } from 'lucide-react'
import { adminBtnPrimary, adminInput } from '@/lib/admin-ui'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function AdminLogin() {
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return

    // This is intentionally a dead-end admin screen. Credentials are never read,
    // sent to the server, logged, persisted, or passed to Supabase.
    setFailed(false)
    setPending(true)

    window.setTimeout(() => {
      formRef.current?.reset()
      setPending(false)
      setFailed(true)
    }, 700)
  }

  return (
    <div className="admin-console min-h-screen bg-black text-white flex flex-col justify-center items-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(143,160,255,0.18)_0%,_transparent_60%)] pointer-events-none" />

      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8 md:p-10 relative z-10 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="text-center space-y-2 mb-8">
          <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full border border-[#C4CEFF]/20 bg-[#C4CEFF]/10">
            <ShieldCheck className="size-5 text-[#C4CEFF]" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-white">FICO MANA</h1>
          <p className="text-[10px] font-bold tracking-[0.25em] text-[#C4CEFF] uppercase">Secure Staff Console</p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="space-y-5">
          {failed ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Sign-in unsuccessful</AlertTitle>
              <AlertDescription>Invalid email or password.</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email" className="text-[10px] font-semibold tracking-widest text-[#C4CEFF] uppercase">
              Staff Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" aria-hidden="true" />
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                maxLength={320}
                required
                disabled={pending}
                placeholder="you@ficomana.com"
                className={`${adminInput} pl-11`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-[10px] font-semibold tracking-widest text-[#C4CEFF] uppercase">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" aria-hidden="true" />
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                maxLength={1024}
                required
                disabled={pending}
                placeholder="Enter your password"
                className={`${adminInput} pl-11`}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={pending}
            className={`w-full h-auto py-4 flex items-center justify-center gap-2 ${adminBtnPrimary}`}
          >
            {pending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                Authenticating...
              </>
            ) : (
              'Login to Console'
            )}
          </Button>
        </form>

        <p className="text-[10px] text-white/30 text-center mt-8 leading-relaxed">
          Authorized staff access only.
        </p>
      </div>
    </div>
  )
}
