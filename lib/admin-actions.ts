import type { Booking, PaymentRecord } from '@/lib/data-store'
import { saveBooking, dispatchAdminRefresh } from '@/lib/data-store'
import { dispatchEmail, type EmailDispatchPayload } from '@/lib/email-dispatch'

export type AdminActionResult = {
  saved: Booking
  emailErrors: string[]
}

/** Save booking to API/DB, then dispatch emails. Returns email errors separately. */
export async function runAdminTransaction(
  booking: Booking,
  emails: EmailDispatchPayload[] = [],
): Promise<AdminActionResult> {
  const { booking: saved, emailErrors: saveEmailErrors } = await saveBooking(booking)
  const emailErrors: string[] = [...saveEmailErrors]

  for (const payload of emails) {
    const emailBooking = {
      ...saved,
      customerEmail: payload.booking.customerEmail || saved.customerEmail,
      customerName: payload.booking.customerName || saved.customerName,
    }
    const result = await dispatchEmail({ ...payload, booking: emailBooking })
    if (!result.success) {
      emailErrors.push(result.error || `Email failed: ${payload.action}`)
    }
  }

  if (typeof window !== 'undefined') {
    dispatchAdminRefresh()
  }

  return { saved, emailErrors }
}

export function formatEmailResult(errors: string[]): string | undefined {
  if (errors.length === 0) return undefined
  return errors.join(' · ')
}

export function depositPaymentFromBooking(booking: Booking): PaymentRecord | undefined {
  const history = booking.paymentHistory || []
  return history.find((p) => p.type === 'Deposit') ?? history[history.length - 1]
}
