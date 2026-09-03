export type RejectionReasonId =
  | 'forged'
  | 'unable_to_verify'
  | 'incorrect_amount'
  | 'duplicate'
  | 'blurry'
  | 'wrong_account'
  | 'other'

export type RejectionReasonOption = {
  id: RejectionReasonId
  label: string
  customerMessage: string
}

export const REJECTION_REASONS: RejectionReasonOption[] = [
  {
    id: 'forged',
    label: 'Forged or fake receipt',
    customerMessage:
      'The uploaded image does not appear to be a genuine GCash or BPI payment screenshot. Please upload an authentic receipt from your own transaction history showing the correct deposit amount and reference number.',
  },
  {
    id: 'unable_to_verify',
    label: 'Unable to verify payment',
    customerMessage:
      'We could not match your upload to a verified deposit payment. Please upload a clear GCash or BPI screenshot that shows the transaction details.',
  },
  {
    id: 'incorrect_amount',
    label: 'Incorrect deposit amount',
    customerMessage:
      'The payment amount on your receipt does not match the required ₱500.00 studio deposit. Please pay the correct amount and upload a new screenshot.',
  },
  {
    id: 'duplicate',
    label: 'Duplicate or reused receipt',
    customerMessage:
      'This receipt appears to have been used for another booking or is not unique to this reservation. Please upload a new screenshot from your own fresh deposit payment.',
  },
  {
    id: 'blurry',
    label: 'Blurry or unreadable image',
    customerMessage:
      'The receipt image is too blurry to read the amount, date, or reference number. Please upload a clear, uncropped GCash or BPI screenshot.',
  },
  {
    id: 'wrong_account',
    label: 'Paid to wrong account',
    customerMessage:
      'The payment was not sent to the official FICO MANA studio account. Please send the deposit to the correct GCash/BPI details on our booking page and upload a new receipt.',
  },
  {
    id: 'other',
    label: 'Other (custom reason)',
    customerMessage: '',
  },
]

export function getRejectionReason(id: string): RejectionReasonOption | undefined {
  return REJECTION_REASONS.find((r) => r.id === id)
}

export function resolveRejectionMessage(reasonId: string, customReason?: string): string {
  if (reasonId === 'other') {
    return customReason?.trim() || 'Please upload a valid GCash or BPI payment screenshot.'
  }
  return getRejectionReason(reasonId)?.customerMessage ?? customReason?.trim() ?? 'Unable to verify payment.'
}

export function isForgedRejection(reasonId: string, message?: string): boolean {
  if (reasonId === 'forged') return true
  const m = (message ?? '').toLowerCase()
  return m.includes('forged') || m.includes('fake receipt') || m.includes('not genuine')
}
