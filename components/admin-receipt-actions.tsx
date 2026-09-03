'use client'

import { Mail, Printer } from 'lucide-react'
import type { Booking, PaymentRecord } from '@/lib/data-store'
import { dispatchEmail } from '@/lib/email-dispatch'
import { formatReceiptNumber, printOfficialReceipt } from '@/lib/receipt-document'

type Props = {
  booking: Booking
  payment: PaymentRecord
  disabled?: boolean
  onResult?: (success: boolean, message: string) => void
}

export default function AdminReceiptActions({ booking, payment, disabled, onResult }: Props) {
  const receiptNo = formatReceiptNumber(booking.id, payment.id)

  const handlePrint = () => {
    const ok = printOfficialReceipt(booking, payment)
    if (!ok) {
      onResult?.(false, 'Could not open print view. Please try again.')
    }
  }

  const handleResend = async () => {
    const result = await dispatchEmail({
      action: 'transaction_receipt',
      booking,
      payment,
    })
    if (result.success) {
      onResult?.(true, `Official receipt emailed to ${booking.customerEmail}.`)
    } else {
      onResult?.(false, result.error || 'Could not send receipt email.')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <span className="font-bold text-white">₱{payment.amount.toFixed(2)}</span>
      <p className="text-[9px] font-mono text-primary">{receiptNo}</p>
      <div className="flex gap-1 mt-1">
        <button
          type="button"
          onClick={handlePrint}
          disabled={disabled}
          title="Print official receipt"
          className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider border border-white/15 text-white/80 hover:border-white/30 disabled:opacity-40"
        >
          <Printer className="w-3 h-3" /> Print
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={disabled}
          title="Resend receipt email"
          className="inline-flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-40"
        >
          <Mail className="w-3 h-3" /> Email
        </button>
      </div>
    </div>
  )
}
