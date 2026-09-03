'use client'

import { isLikelyInvalidReceipt, receiptDisplayLabel } from '@/lib/booking-display'
import { AlertCircle, FileText } from 'lucide-react'

type Props = {
  receiptUrl?: string
  alt?: string
  className?: string
  fill?: boolean
}

export default function ReceiptPreview({ receiptUrl, alt = 'Payment receipt', className = '', fill }: Props) {
  if (!receiptUrl) {
    return (
      <div className={`flex items-center justify-center text-white/40 text-xs uppercase tracking-wider ${className}`}>
        No receipt image
      </div>
    )
  }

  const invalid = isLikelyInvalidReceipt(receiptUrl)

  if (receiptUrl.endsWith('.pdf')) {
    return (
      <div className={`flex flex-col items-center justify-center text-white/50 gap-2 ${className}`}>
        <FileText className="w-12 h-12 text-primary/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">PDF Receipt</span>
      </div>
    )
  }

  return (
    <div className={`relative ${fill ? 'w-full h-full' : className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={receiptUrl}
        alt={alt}
        className={fill ? 'absolute inset-0 w-full h-full object-contain bg-black/40' : `w-full h-full object-contain bg-black/40 ${className}`}
      />
      {invalid && (
        <div className="absolute inset-x-0 bottom-0 bg-red-600/90 text-white text-[9px] uppercase tracking-wider font-bold px-2 py-1.5 flex items-center gap-1 justify-center">
          <AlertCircle className="w-3 h-3 shrink-0" />
          Not a GCash/BPI screenshot
        </div>
      )}
    </div>
  )
}

export { receiptDisplayLabel, isLikelyInvalidReceipt }
