import assert from 'node:assert/strict'
import test from 'node:test'
import type { Booking } from '../lib/data-store.ts'
import { calculateSalesSummary, type SalesExpense, type SalesSettings } from '../lib/sales-finance.ts'

const settings: SalesSettings = {
  monthlyRevenueTarget: 50000,
  desiredMonthlyProfit: 20000,
  desiredProfitMargin: 30,
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'FM-100001',
    customerName: 'Client',
    customerEmail: 'client@example.com',
    customerPhone: '09000000000',
    customerFbLink: '',
    customerFbName: '',
    packageId: 'fico-package',
    packageName: 'FICO Package',
    bookingDate: '2026-09-10',
    bookingTime: '10:00 AM',
    depositAmount: 500,
    price: 25000,
    bookingStatus: 'Confirmed',
    paymentStatus: 'Paid Deposit',
    createdAt: '2026-09-01T00:00:00.000Z',
    paymentHistory: [
      { id: 'PAY-1', amount: 5000, method: 'Cash', type: 'Deposit', date: '2026-09-10T02:00:00.000Z' },
    ],
    ...overrides,
  }
}

const anchor = new Date('2026-09-15T12:00:00+08:00')

test('separates booked sales, cash collected, and outstanding balance', () => {
  const result = calculateSalesSummary([booking()], [], settings, 'month', anchor)
  assert.equal(result.bookedSales, 25000)
  assert.equal(result.cashCollected, 5000)
  assert.equal(result.outstandingReceivables, 20000)
})

test('calculates revenue goal remaining, progress, average booking, and shoots needed', () => {
  const result = calculateSalesSummary([booking()], [], settings, 'month', anchor)
  assert.equal(result.remainingRevenueTarget, 25000)
  assert.equal(result.revenueGoalProgress, 50)
  assert.equal(result.averageBookingValue, 25000)
  assert.equal(result.bookingsNeeded, 1)
})

test('calculates fixed and variable expenses, profit, margin and break-even bookings', () => {
  const expenses: SalesExpense[] = [
    {
      id: 'fixed', expenseType: 'fixed', name: 'Rent', category: 'Studio', amount: 10000,
      expenseDate: '2026-09-01', recurrence: 'monthly', startDate: '2026-09-01', isActive: true,
    },
    {
      id: 'variable', expenseType: 'variable', name: 'Freelancer', category: 'Crew', amount: 5000,
      expenseDate: '2026-09-10', recurrence: 'one_time', bookingId: 'FM-100001', isActive: true,
    },
  ]
  const result = calculateSalesSummary([booking()], expenses, settings, 'month', anchor)
  assert.equal(result.fixedExpenses, 10000)
  assert.equal(result.variableExpenses, 5000)
  assert.equal(result.totalExpenses, 15000)
  assert.equal(result.netProfit, 10000)
  assert.equal(result.profitMargin, 40)
  assert.equal(result.contributionPerBooking, 20000)
  assert.equal(result.breakEvenBookings, 1)
  assert.equal(result.desiredProfitBookings, 2)
})

test('counts a recurring monthly expense only once across daily chart buckets', () => {
  const expenses: SalesExpense[] = [
    {
      id: 'fixed', expenseType: 'fixed', name: 'RICA', category: 'Other', amount: 15000,
      expenseDate: '2026-09-04', recurrence: 'monthly', startDate: '2026-09-04', isActive: true,
    },
  ]
  const result = calculateSalesSummary([], expenses, settings, 'month', anchor)
  const chartExpenseTotal = result.monthly.reduce((sum, point) => sum + point.expenses, 0)
  assert.equal(result.fixedExpenses, 15000)
  assert.equal(chartExpenseTotal, 15000)
  assert.equal(result.monthly.find((point) => point.key === '2026-09-04')?.expenses, 15000)
})

test('builds a seven-day financial trend ending on the selected reporting date', () => {
  const expenses: SalesExpense[] = [
    {
      id: 'crew', expenseType: 'variable', name: 'Crew', category: 'Production', amount: 5000,
      expenseDate: '2026-09-10', recurrence: 'one_time', bookingId: 'FM-100001', isActive: true,
    },
  ]
  const result = calculateSalesSummary([booking()], expenses, settings, 'month', anchor)

  assert.equal(result.daily.length, 7)
  assert.equal(result.daily[0]?.key, '2026-09-09')
  assert.equal(result.daily[6]?.key, '2026-09-15')
  assert.deepEqual(
    result.daily.find((point) => point.key === '2026-09-10'),
    {
      key: '2026-09-10',
      label: 'Thu, Sep 10',
      revenue: 25000,
      expenses: 5000,
      netProfit: 20000,
    },
  )
})

test('excludes cancelled bookings from sales and safely handles zero data', () => {
  const cancelled = booking({ bookingStatus: 'Cancelled', paymentStatus: 'Unpaid', paymentHistory: [] })
  const result = calculateSalesSummary([cancelled], [], settings, 'month', anchor)
  assert.equal(result.bookedSales, 0)
  assert.equal(result.totalBookings, 0)
  assert.equal(result.averageBookingValue, 0)
  assert.equal(result.bookingsNeeded, null)
  assert.equal(result.profitMargin, 0)
  assert.equal(result.breakEvenBookings, null)
})

test('never returns a negative remaining target after exceeding goal', () => {
  const result = calculateSalesSummary([
    booking({ id: 'FM-100001', price: 30000 }),
    booking({ id: 'FM-100002', price: 30000 }),
  ], [], settings, 'month', anchor)
  assert.equal(result.remainingRevenueTarget, 0)
  assert.equal(result.bookingsNeeded, 0)
})

test('reconciles package and add-on revenue with verified payments and outstanding balance', () => {
  const result = calculateSalesSummary(
    [booking({ price: 2000, paymentHistory: [{ id: 'PAY-1', amount: 500, method: 'Cash', type: 'Deposit', date: '2026-09-01' }] })],
    [
      { bookingId: 'FM-100001', name: '8R Frame', quantity: 1, totalAmount: 1000 },
      { bookingId: 'FM-100001', name: 'Extra Edit', quantity: 2, totalAmount: 800 },
    ],
    [],
    settings,
    'month',
    anchor,
  )
  assert.equal(result.bookedSales, 3800)
  assert.equal(result.cashCollected, 500)
  assert.equal(result.outstandingReceivables, 3300)
  assert.equal(result.revenueBreakdown.packageRevenue, 2000)
  assert.equal(result.revenueBreakdown.printFrameRevenue, 1000)
  assert.equal(result.revenueBreakdown.otherAddonRevenue, 800)
  assert.equal(result.revenueBreakdown.total, 3800)
})

test('uses the selected report date semantics consistently', () => {
  const futureShoot = booking({ bookingDate: '2026-10-10', createdAt: '2026-09-05T02:00:00.000Z' })
  const byShoot = calculateSalesSummary([futureShoot], [], settings, 'month', anchor)
  const byBooking = calculateSalesSummary([futureShoot], [], settings, 'month', anchor, { reportBy: 'booking_date' })
  assert.equal(byShoot.bookedSales, 0)
  assert.equal(byBooking.bookedSales, 25000)
})

test('booking-date reports use Asia/Manila calendar boundaries', () => {
  const nearMidnight = booking({
    bookingDate: '2026-10-10',
    createdAt: '2026-08-31T16:30:00.000Z',
  })
  const result = calculateSalesSummary([nearMidnight], [], settings, 'month', anchor, { reportBy: 'booking_date' })
  assert.equal(result.bookedSales, 25000)
})
