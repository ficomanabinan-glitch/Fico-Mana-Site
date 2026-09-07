'use client'

import { useActionState } from 'react'
import { LockKeyhole, LogIn } from 'lucide-react'
import { loginEditor } from './actions'
import { initialLoginState } from '@/lib/auth/login-state'

export default function EditorLogin(){
  const[state,action,pending]=useActionState(loginEditor,initialLoginState)
  return <main className="flex min-h-screen items-center justify-center bg-[#181818] p-5 text-white"><div className="w-full max-w-md border border-white/10 bg-[#222222] p-7 shadow-2xl sm:p-9"><p className="text-caption font-semibold uppercase tracking-label text-[#C4CEFF]">FICO MANA</p><h1 className="mt-3 font-serif text-3xl font-bold">Editor Portal</h1><p className="mt-2 text-sm leading-relaxed text-white/40">Sign in to upload photos and manage editing.</p><form action={action} className="mt-8 space-y-4"><label className="block space-y-1.5"><span className="text-caption font-semibold uppercase tracking-wider text-white/40">Staff email</span><input name="email" type="email" autoComplete="email" required className="h-11 w-full border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-[#C4CEFF]/60"/></label><label className="block space-y-1.5"><span className="text-caption font-semibold uppercase tracking-wider text-white/40">Password</span><input name="password" type="password" autoComplete="current-password" required className="h-11 w-full border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-[#C4CEFF]/60"/></label>{state.message?<p role="alert" className="border border-red-500/20 bg-red-500/[0.07] p-3 text-xs text-red-200">{state.message}</p>:null}<button disabled={pending} className="flex h-11 w-full items-center justify-center gap-2 bg-primary text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 hover:bg-[#0300a8] disabled:opacity-50"><LogIn className="size-4"/>{pending?'Signing in…':'Open Editor Portal'}</button></form><p className="mt-7 flex items-center justify-center gap-1.5 text-caption text-white/25"><LockKeyhole className="size-3"/>Access is limited to authorized staff</p></div></main>
}
