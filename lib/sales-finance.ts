import type { Booking, PaymentRecord } from './data-store.ts'
import type { SalesBooking } from './sales-store.ts'

export type SalesPeriod = 'month' | 'quarter' | 'year'
export type SalesExpense = {
  id: string
  expenseType: 'fixed' | 'variable'
  name: string
  category: string
  amount: number
  expenseDate: string
  recurrence: 'one_time' | 'monthly'
  startDate?: string | null
  endDate?: string | null
  bookingId?: string | null
  notes?: string | null
  isActive: boolean
}

export type SalesSettings = {
  monthlyRevenueTarget: number
  desiredMonthlyProfit: number
  desiredProfitMargin: number
}

const VALID_SALES_STATUSES = new Set<Booking['bookingStatus']>(['Confirmed', 'Completed', 'No Show'])

export function toMinor(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0
}

export function fromMinor(value: number) {
  return value / 100
}

export function getPeriodBounds(period: SalesPeriod, anchor = new Date()) {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  let start: Date
  let end: Date

  if (period === 'year') {
    start = new Date(year, 0, 1)
    end = new Date(year + 1, 0, 1)
  } else if (period === 'quarter') {
    const quarterMonth = Math.floor(month / 3) * 3
    start = new Date(year, quarterMonth, 1)
    end = new Date(year, quarterMonth + 3, 1)
  } else {
    start = new Date(year, month, 1)
    end = new Date(year, month + 1, 1)
  }

  return { start, end }
}

function dateInRange(value: string | undefined | null, start: Date, end: Date) {
  if (!value) return false
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  return Number.isFinite(date.getTime()) && date >= start && date < end
}

function isVerifiedPayment(booking: SalesBooking, payment: PaymentRecord) {
  if (booking.paymentStatus === 'Refunded') return false
  if (payment.type === 'Deposit') return VALID_SALES_STATUSES.has(booking.bookingStatus)
  return true
}

function verifiedPaidMinor(booking: SalesBooking) {
  return (booking.paymentHistory || []).reduce(
    (sum, payment) => sum + (isVerifiedPayment(booking, payment) ? toMinor(payment.amount) : 0),
    0,
  )
}

function expenseApplies(expense: SalesExpense, start: Date, end: Date) {
  if (!expense.isActive) return false
  if (expense.recurrence === 'one_time') return dateInRange(expense.expenseDate, start, end)

  const begins = expense.startDate ? new Date(`${expense.startDate}T12:00:00`) : new Date(`${expense.expenseDate}T12:00:00`)
  const finishes = expense.endDate ? new Date(`${expense.endDate}T12:00:00`) : null
  return begins < end && (!finishes || finishes >= start)
}

function monthsOverlapping(start: Date, end: Date, expense: SalesExpense) {
  if (expense.recurrence !== 'monthly') return 1
  let count = 0
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor < end) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    if (expenseApplies(expense, cursor, next)) count += 1
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return count
}

function bucketRevenue(bookings: SalesBooking[], start: Date, end: Date) {
  return bookings
    .filter((b) => VALID_SALES_STATUSES.has(b.bookingStatus) && dateInRange(b.bookingDate, start, end))
    .reduce((sum, b) => sum + toMinor(b.price), 0)
}

function bucketExpenses(expenses: SalesExpense[], start: Date, end: Date, recurringOncePerMonth = false) {
  let total = 0
  for (const expense of expenses) {
    if (!expenseApplies(expense, start, end)) continue

    if (recurringOncePerMonth && expense.recurrence === 'monthly') {
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1)
      const begins = expense.startDate
        ? new Date(`${expense.startDate}T12:00:00`)
        : new Date(`${expense.expenseDate}T12:00:00`)
      const chargeDate = begins > monthStart ? begins : monthStart
      if (!(chargeDate >= start && chargeDate < end)) continue
    }

    total += toMinor(expense.amount)
  }
  return total
}

type SalesTrendPoint = {
  key: string
  label: string
  revenue: number
  expenses: number
  netProfit: number
}

function createTrendPoint(
  bookings: SalesBooking[],
  expenses: SalesExpense[],
  start: Date,
  end: Date,
  key: string,
  label: string,
  recurringOncePerMonth = false,
): SalesTrendPoint {
  const revenue = fromMinor(bucketRevenue(bookings, start, end))
  const expenseTotal = fromMinor(bucketExpenses(expenses, start, end, recurringOncePerMonth))
  return { key, label, revenue, expenses: expenseTotal, netProfit: revenue - expenseTotal }
}

function buildTrendBuckets(bookings: SalesBooking[], expenses: SalesExpense[], period: SalesPeriod, start: Date, end: Date) {
  const buckets: SalesTrendPoint[] = []

  if (period === 'month') {
    const cursor = new Date(start)
    while (cursor < end) {
      const next = new Date(cursor)
      next.setDate(next.getDate() + 1)
      buckets.push(createTrendPoint(
        bookings,
        expenses,
        cursor,
        next,
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
        String(cursor.getDate()),
        true,
      ))
      cursor.setDate(cursor.getDate() + 1)
    }
    return buckets
  }

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cursor < end) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    buckets.push(createTrendPoint(
      bookings,
      expenses,
      cursor,
      next,
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      cursor.toLocaleDateString('en-PH', { month: 'short' }),
    ))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return buckets
}

function buildSevenDayTrend(bookings: SalesBooking[], expenses: SalesExpense[], anchor: Date) {
  const cursor = new Date(anchor)
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() - 6)

  return Array.from({ length: 7 }, () => {
    const start = new Date(cursor)
    const end = new Date(cursor)
    end.setDate(end.getDate() + 1)
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const point = createTrendPoint(
      bookings,
      expenses,
      start,
      end,
      key,
      start.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }),
      true,
    )
    cursor.setDate(cursor.getDate() + 1)
    return point
  })
}

export function calculateSalesSummary(
  bookings: SalesBooking[],
  expenses: SalesExpense[],
  settings: SalesSettings,
  period: SalesPeriod,
  anchor = new Date(),
) {
  const { start, end } = getPeriodBounds(period, anchor)
  const validBookings = bookings.filter(
    (booking) => VALID_SALES_STATUSES.has(booking.bookingStatus) && dateInRange(booking.bookingDate, start, end),
  )

  const bookedSalesMinor = validBookings.reduce((sum, booking) => sum + toMinor(booking.price), 0)
  const cashCollectedMinor = bookings.reduce(
    (sum, booking) =>
      sum +
      (booking.paymentHistory || []).reduce(
        (paymentSum, payment) =>
          paymentSum +
          (isVerifiedPayment(booking, payment) && dateInRange(payment.date, start, end) ? toMinor(payment.amount) : 0),
        0,
      ),
    0,
  )
  const outstandingMinor = validBookings.reduce(
    (sum, booking) => sum + Math.max(toMinor(booking.price) - verifiedPaidMinor(booking), 0),
    0,
  )

  let fixedExpensesMinor = 0
  let variableExpensesMinor = 0
  for (const expense of expenses) {
    if (!expenseApplies(expense, start, end)) continue
    const amount = toMinor(expense.amount) * monthsOverlapping(start, end, expense)
    if (expense.expenseType === 'fixed') fixedExpensesMinor += amount
    else variableExpensesMinor += amount
  }

  const totalExpensesMinor = fixedExpensesMinor + variableExpensesMinor
  const netProfitMinor = bookedSalesMinor - totalExpensesMinor
  const bookingCount = validBookings.length
  const averageBookingMinor = bookingCount > 0 ? Math.round(bookedSalesMinor / bookingCount) : 0

  const periodMonths = period === 'month' ? 1 : period === 'quarter' ? 3 : 12
  const targetMinor = toMinor(settings.monthlyRevenueTarget) * periodMonths
  const desiredProfitMinor = toMinor(settings.desiredMonthlyProfit) * periodMonths
  const remainingTargetMinor = Math.max(targetMinor - bookedSalesMinor, 0)
  const goalProgress = targetMinor > 0 ? (bookedSalesMinor / targetMinor) * 100 : 0
  const bookingsNeeded = averageBookingMinor > 0 ? Math.ceil(remainingTargetMinor / averageBookingMinor) : null

  const variableBookings = new Set(
    expenses
      .filter((e) => e.expenseType === 'variable' && e.bookingId && expenseApplies(e, start, end))
      .map((e) => e.bookingId as string),
  )
  const variableCostBase = variableBookings.size > 0 ? variableBookings.size : bookingCount
  const averageVariableCostMinor = variableCostBase > 0 ? Math.round(variableExpensesMinor / variableCostBase) : 0
  const contributionMinor = averageBookingMinor - averageVariableCostMinor
  const breakEvenBookings = contributionMinor > 0 ? Math.ceil(fixedExpensesMinor / contributionMinor) : null
  const desiredProfitBookings =
    contributionMinor > 0 ? Math.ceil((fixedExpensesMinor + desiredProfitMinor) / contributionMinor) : null
  const profitMargin = bookedSalesMinor > 0 ? (netProfitMinor / bookedSalesMinor) * 100 : 0

  return {
    period: { start: start.toISOString(), end: end.toISOString(), months: periodMonths },
    bookedSales: fromMinor(bookedSalesMinor),
    cashCollected: fromMinor(cashCollectedMinor),
    outstandingReceivables: fromMinor(outstandingMinor),
    fixedExpenses: fromMinor(fixedExpensesMinor),
    variableExpenses: fromMinor(variableExpensesMinor),
    totalExpenses: fromMinor(totalExpensesMinor),
    netProfit: fromMinor(netProfitMinor),
    profitMargin,
    revenueGoal: fromMinor(targetMinor),
    revenueGoalProgress: goalProgress,
    remainingRevenueTarget: fromMinor(remainingTargetMinor),
    averageBookingValue: fromMinor(averageBookingMinor),
    totalBookings: bookingCount,
    bookingsNeeded,
    averageVariableCost: fromMinor(averageVariableCostMinor),
    contributionPerBooking: fromMinor(contributionMinor),
    breakEvenBookings,
    desiredProfit: fromMinor(desiredProfitMinor),
    desiredProfitBookings,
    desiredProfitMargin: settings.desiredProfitMargin,
    daily: buildSevenDayTrend(bookings, expenses, anchor),
    monthly: buildTrendBuckets(bookings, expenses, period, start, end),
  }
}
