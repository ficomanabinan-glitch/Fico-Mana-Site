import type { Booking } from '@/lib/data-store'
import { buildDayPriorityMap, sortBookingsByDayPriority } from '@/lib/booking-priority'

function escapeCsv(value: string | number | undefined | null): string {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function paymentSummary(booking: Booking): string {
  if (!booking.paymentHistory?.length) return ''
  return booking.paymentHistory
    .map(
      (p) =>
        `${p.type}: ₱${p.amount} via ${p.method}${p.transactionRef ? ` (ref ${p.transactionRef})` : ''}`,
    )
    .join(' | ')
}

/** Download day bookings as a UTF-8 CSV file (opens in Excel). */
export function downloadDayBookingsExcel(bookings: Booking[], date: string) {
  const dayRows = sortBookingsByDayPriority(
    bookings.filter((b) => b.bookingDate === date && b.bookingStatus !== 'Cancelled'),
  )
  const priorities = buildDayPriorityMap(bookings)

  const headers = [
    'Client',
    'Booking ID',
    'Customer Name',
    'Email',
    'Phone',
    'Facebook Name',
    'Package',
    'Date',
    'Time',
    'Arrival',
    'Booking Status',
    'Payment Status',
    'Deposit (PHP)',
    'Package Price (PHP)',
    'Transaction Ref',
    'Payments',
    'School',
    'Course',
    'Notes',
    'Booked At',
  ]

  const lines = [
    headers.join(','),
    ...dayRows.map((b) =>
      [
        priorities.get(b.id) ?? '',
        b.id,
        b.customerName,
        b.customerEmail,
        b.customerPhone,
        b.customerFbName,
        b.packageName,
        b.bookingDate,
        b.bookingTime,
        b.arrivalTime ?? '',
        b.bookingStatus,
        b.paymentStatus,
        b.depositAmount,
        b.price,
        b.transactionRef ?? '',
        paymentSummary(b),
        b.schoolName ?? '',
        b.course ?? '',
        b.note ?? b.staffNotes ?? '',
        b.createdAt,
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ]

  const csv = `\uFEFF${lines.join('\r\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `fico-mana-transactions-${date}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
