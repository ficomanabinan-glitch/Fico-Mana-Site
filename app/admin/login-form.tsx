'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Mail, RefreshCw } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { isSupabaseConfigured } from '@/lib/supabase'
import { adminInput, adminBtnPrimary } from '@/lib/admin-ui'

export default function AdminLogin() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (searchParams.get('error') === 'auth') {
      setError('Sign-in failed. Please try again.')
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!isSupabaseConfigured()) {
      setError('Supabase is not configured. Check .env.local and restart the dev server.')
      return
    }

    setLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Invalid email address or password.'
            : signInError.message,
        )
        return
      }

      const redirect = searchParams.get('redirect')
      router.push(redirect && redirect.startsWith('/') ? redirect : '/admin/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-console min-h-screen bg-black text-white flex flex-col justify-center items-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(143,160,255,0.18)_0%,_transparent_60%)] pointer-events-none" />

      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8 md:p-10 relative z-10 shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        <div className="text-center space-y-2 mb-8">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-white">FICO MANA</h1>
          <p className="text-[10px] font-bold tracking-[0.25em] text-[#C4CEFF] uppercase">Staff Console</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 text-red-400 border border-red-500/25 p-3.5 text-xs font-medium text-center">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-[10px] font-semibold tracking-widest text-[#C4CEFF] uppercase">
              Staff Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={`${adminInput} pl-11`}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-4 flex items-center justify-center gap-2 ${adminBtnPrimary}`}
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Authenticating...
              </>
            ) : (
              'Login to Console'
            )}
          </button>
        </form>

        <p className="text-[10px] text-white/30 text-center mt-8 leading-relaxed">
          Staff accounts are created in Supabase Auth.
        </p>
      </div>
    </div>
  )
}
