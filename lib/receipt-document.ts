import type { Booking, PaymentRecord } from '@/lib/data-store'

export function formatReceiptNumber(bookingId: string, paymentId: string) {
  return `FM-RCP-${bookingId.replace('FM-', '')}-${paymentId.replace('PAY-', '')}`
}
function formatMoney(amount: number) { return `₱${amount.toFixed(2)}` }
function totalPaid(booking: Booking) { return (booking.paymentHistory || []).reduce((sum, payment) => sum + payment.amount, 0) }
export function buildOfficialReceiptHtml(booking: Booking, payment: PaymentRecord) {
  const receiptNo = formatReceiptNumber(booking.id, payment.id)
  const price = booking.price
  const paid = totalPaid(booking)
  const remaining = Math.max(0, price - paid)
  const verifiedLabel = payment.type === 'Deposit' ? 'Deposit Verified by FICO MANA Studio' : 'Payment Recorded'
  const paidAt = new Date(payment.date).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Official Receipt ${receiptNo}</title><style>body{font-family:Arial,sans-serif;color:#111827;background:#fff;padding:24px}.wrap{max-width:640px;margin:auto;border:2px solid #0500D0;padding:24px}.brand{text-align:center}.brand h1{color:#0500D0}.receipt-box{border:2px solid #0500D0;padding:20px;text-align:center;margin:16px 0}.number{font-size:24px;font-weight:bold;color:#0500D0}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #EEF0FF}td:last-child{text-align:right;font-weight:bold}</style></head><body><div class="wrap"><div class="brand"><h1>FICO MANA</h1><p>Self Portrait Studio</p></div><h2>Official Payment Receipt</h2><p>Hello <strong>${booking.customerName}</strong>, this document serves as proof of payment.</p><div class="receipt-box"><p>Official Receipt</p><p class="number">${receiptNo}</p><p>${verifiedLabel}</p></div><table><tr><td>Booking Reference</td><td>${booking.id}</td></tr><tr><td>Transaction ID</td><td>${payment.id}</td></tr><tr><td>Payment Type</td><td>${payment.type}</td></tr><tr><td>Payment Method</td><td>${payment.method}</td></tr><tr><td>Transaction Ref</td><td>${payment.transactionRef || 'N/A'}</td></tr><tr><td>Date</td><td>${paidAt}</td></tr><tr><td>Amount Paid</td><td>${formatMoney(payment.amount)}</td></tr><tr><td>Package</td><td>${booking.packageName}</td></tr><tr><td>Session Date</td><td>${booking.bookingDate} · ${booking.bookingTime}</td></tr><tr><td>Package Total</td><td>${formatMoney(price)}</td></tr><tr><td>Remaining Balance</td><td>${formatMoney(remaining)}</td></tr><tr><td>Booking Status</td><td>${booking.bookingStatus}</td></tr></table></div></body></html>`
}
export function printOfficialReceipt(booking: Booking, payment: PaymentRecord): boolean {
  if (typeof document === 'undefined') return false
  const html = buildOfficialReceiptHtml(booking, payment)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('style','position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;')
  iframe.setAttribute('title', 'Receipt print frame')
  document.body.appendChild(iframe)
  const frameWindow = iframe.contentWindow
  const frameDoc = frameWindow?.document
  if (!frameWindow || !frameDoc) { iframe.remove(); return false }
  let printed = false
  const cleanup = () => window.setTimeout(() => iframe.remove(), 1500)
  const triggerPrint = () => {
    if (printed) return
    printed = true
    try { frameWindow.focus(); frameWindow.print(); cleanup() } catch { iframe.remove() }
  }
  frameDoc.open(); frameDoc.write(html); frameDoc.close()
  if (frameDoc.readyState === 'complete') window.setTimeout(triggerPrint, 150)
  else iframe.addEventListener('load', () => window.setTimeout(triggerPrint, 150), { once: true })
  return true
}
