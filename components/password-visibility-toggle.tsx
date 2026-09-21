'use client'

import { Eye, EyeOff } from 'lucide-react'

export function PasswordVisibilityToggle({ visible, onToggle, disabled = false, label = 'password' }: {
  visible: boolean
  onToggle: () => void
  disabled?: boolean
  label?: string
}) {
  return <button
    type="button"
    aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
    aria-pressed={visible}
    disabled={disabled}
    onClick={onToggle}
    className="absolute inset-y-0 right-1 my-auto flex size-10 items-center justify-center rounded-control text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4CEFF]/70 disabled:opacity-40"
  >{visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}</button>
}
