'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Expand, X } from 'lucide-react'

type Props = {
  depositLabel: string
  hint?: string
  className?: string
}

export default function BpiQrDisplay({ depositLabel, hint, className = '' }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <div className={`border border-white/10 bg-white/[0.03] p-4 sm:p-5 text-center ${className}`}>
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-white/50 mb-3">
          BPI Deposit — {depositLabel}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative mx-auto block w-full max-w-[240px] aspect-square bg-white rounded-sm overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="View full size BPI QR code"
        >
          <Image
            src="/bpi_qr.jpg"
            alt="BPI payment QR code for FICO MANA deposit"
            fill
            className="object-contain"
            sizes="240px"
          />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/65 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Expand className="w-3 h-3" />
            View full size
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-primary/80 hover:text-primary transition-colors"
        >
          View full QR image
        </button>
        {hint && (
          <p className="text-[10px] text-white/40 mt-3 leading-relaxed">{hint}</p>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="BPI QR code full view"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            aria-label="Close full size QR"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="relative max-w-lg w-full bg-white rounded-sm p-2" onClick={(e) => e.stopPropagation()}>
            <Image
              src="/bpi_qr.jpg"
              alt="BPI payment QR code for FICO MANA deposit"
              width={800}
              height={800}
              className="w-full h-auto"
              sizes="90vw"
              priority
            />
          </div>
        </div>
      )}
    </>
  )
}
