type StudioPaymentInput = {
  price: number
  paid: number
  amount: number
  method: string
  discountAmount?: number
  discountLabel?: string
  existingDiscountAmount?: number
}

function cents(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || Math.abs(Math.round(value * 100) - value * 100) > 0.000001) {
    throw new Error(`${name} must be a valid peso amount with at most two decimal places.`)
  }
  return Math.round(value * 100)
}

/** A discount reduces the booking total; it is never included in collected payments. */
export function calculateStudioPayment(input: StudioPaymentInput) {
  const price = cents(input.price, 'Booking total')
  const paid = cents(input.paid, 'Payments received')
  const amount = cents(input.amount, 'Amount received')
  const discount = cents(input.discountAmount ?? 0, 'Discount')
  const existingDiscount = cents(input.existingDiscountAmount ?? 0, 'Existing discount')
  const label = input.discountLabel?.trim() ?? ''
  const outstanding = price - paid

  if (outstanding <= 0) throw new Error('This booking has no outstanding balance.')
  if (discount > 0) {
    if (input.method !== 'Cash') throw new Error('Discounts in this form are available only for cash studio payments.')
    if (existingDiscount > 0) throw new Error('A cash discount has already been applied to this booking.')
    if (!label || label.length > 80) throw new Error('Enter a voucher code or reason (up to 80 characters).')
    if (discount >= outstanding) throw new Error('The discount must leave an amount to collect in cash.')
  } else if (label) {
    throw new Error('Enter a discount amount or clear the voucher code or reason.')
  }

  const due = outstanding - discount
  if (amount <= 0) throw new Error('Payment must be greater than zero.')
  if (amount > due) throw new Error(`Amount received cannot exceed ₱${(due / 100).toFixed(2)}.`)

  return {
    discountAmount: discount / 100,
    discountLabel: discount > 0 ? label : undefined,
    adjustedPrice: (price - discount) / 100,
    remainingBalance: (due - amount) / 100,
    isFullyPaid: amount === due,
  }
}

export function validateCashDiscountMutation(
  previous: { price: number; discountAmount?: number; discountLabel?: string; paymentHistory?: Array<{ id: string; amount: number; method: string }> } | null,
  incoming: { price: number; discountAmount?: number; discountLabel?: string; paymentHistory?: Array<{ id: string; amount: number; method: string }> },
) {
  const oldDiscount = previous?.discountAmount ?? 0
  const newDiscount = incoming.discountAmount ?? 0
  if (!previous) return newDiscount === 0 && !incoming.discountLabel?.trim()
  if (newDiscount === oldDiscount && (incoming.discountLabel ?? '') === (previous.discountLabel ?? '')) return true
  if (oldDiscount !== 0 || newDiscount <= 0) return false
  const previousIds = new Set(previous.paymentHistory?.map(payment => payment.id) ?? [])
  const added = (incoming.paymentHistory ?? []).filter(payment => !previousIds.has(payment.id))
  if (added.length !== 1 || added[0].method !== 'Cash') return false
  try {
    const terms = calculateStudioPayment({
      price: previous.price,
      paid: (previous.paymentHistory ?? []).reduce((sum, payment) => sum + payment.amount, 0),
      amount: added[0].amount,
      method: added[0].method,
      discountAmount: newDiscount,
      discountLabel: incoming.discountLabel,
      existingDiscountAmount: oldDiscount,
    })
    return terms.adjustedPrice === incoming.price
  } catch {
    return false
  }
}
