import type { Booking, PaymentRecord } from '@/lib/data-store'

export type EmailAction =
  | 'booking_created'
  | 'booking_submitted'
  | 'payment_received'
  | 'payment_approved'
  | 'deposit_approved'
  | 'payment_rejected'
  | 'transaction_confirmation'
  | 'transaction_receipt'
  | 'transaction_both'
  | 'final_receipt'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'booking_reminder'
  | 'gallery_link'

export type EmailDispatchPayload = {
  action: EmailAction
  booking: Booking
  payment?: PaymentRecord
  reason?: string
  reasonId?: string
  rebookingFee?: number
  driveLink?: string
}

export async function dispatchEmail(payload: EmailDispatchPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const data = (await res.json()) as { success?: boolean; error?: string }
    if (!res.ok) return { success: false, error: data.error || 'Email dispatch failed' }
    return { success: data.success ?? true }
  } catch (error) {
    console.error('dispatchEmail failed:', error)
    return { success: false, error: 'Network error sending email' }
  }
}

/** Send confirmation + official receipt for a single payment transaction. */
export async function dispatchTransactionEmails(booking: Booking, payment: PaymentRecord) {
  return dispatchEmail({ action: 'transaction_both', booking, payment })
}
