import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculateStudioPayment, validateCashDiscountMutation } from '../lib/studio-cash-discount.ts'
import { buildOfficialReceiptHtml } from '../lib/receipt-document.ts'
import type { Booking, PaymentRecord } from '../lib/data-store.ts'
import { PGlite } from '@electric-sql/pglite'

test('cash voucher reduces amount due without treating the discount as collected cash', () => {
  const terms = calculateStudioPayment({ price: 6500, paid: 500, amount: 5500, method: 'Cash', discountAmount: 500, discountLabel: ' Studio promo ' })
  assert.deepEqual(terms, { discountAmount: 500, discountLabel: 'Studio promo', adjustedPrice: 6000, remainingBalance: 0, isFullyPaid: true })
  assert.equal(calculateStudioPayment({ price: 6500, paid: 500, amount: 2000, method: 'Cash', discountAmount: 500, discountLabel: 'Studio promo' }).remainingBalance, 3500)
})

test('cash voucher rejects noncash payments, reuse, invalid label, excessive discount and overpayment', () => {
  const base = { price: 6500, paid: 500, amount: 5500, discountAmount: 500, discountLabel: 'Promo' }
  assert.throws(() => calculateStudioPayment({ ...base, method: 'GCash' }), /cash studio/)
  assert.throws(() => calculateStudioPayment({ ...base, method: 'Cash', existingDiscountAmount: 100 }), /already been applied/)
  assert.throws(() => calculateStudioPayment({ ...base, method: 'Cash', discountLabel: ' ' }), /voucher code or reason/)
  assert.throws(() => calculateStudioPayment({ ...base, method: 'Cash', discountAmount: 6000 }), /leave an amount/)
  assert.throws(() => calculateStudioPayment({ ...base, method: 'Cash', amount: 5500.01 }), /cannot exceed/)
  assert.throws(() => calculateStudioPayment({ ...base, method: 'Cash', amount: 5500.001 }), /decimal places/)
})

test('server mutation accepts one new cash payment matching the discounted total only', () => {
  const deposit = { id: 'PAY-DEP', amount: 500, method: 'BPI' }
  const previous = { price: 6500, discountAmount: 0, paymentHistory: [deposit] }
  const incoming = { price: 6000, discountAmount: 500, discountLabel: 'Promo', paymentHistory: [deposit, { id: 'PAY-CASH', amount: 5500, method: 'Cash' }] }
  assert.equal(validateCashDiscountMutation(previous, incoming), true)
  assert.equal(validateCashDiscountMutation(previous, { ...incoming, price: 5999 }), false)
  assert.equal(validateCashDiscountMutation(previous, { ...incoming, paymentHistory: [deposit, { id: 'PAY-CASH', amount: 5500, method: 'Card' }] }), false)
  assert.equal(validateCashDiscountMutation(null, incoming), false)
})

test('printed receipt separates package price, discount and actual payment', () => {
  const payment: PaymentRecord = { id: 'PAY-CASH', amount: 5500, method: 'Cash', type: 'Balance Payment', date: '2026-09-20T00:00:00Z' }
  const booking = { id: 'FM-100001', price: 6000, discountAmount: 500, discountLabel: '<Promo>', customerName: 'Client', packageName: 'Package', bookingDate: '2026-09-20', bookingTime: '10 AM', bookingStatus: 'Confirmed', paymentHistory: [{ ...payment, amount: 500, id: 'PAY-DEP' }, payment] } as Booking
  const html = buildOfficialReceiptHtml(booking, payment)
  assert.match(html, /Package Total<\/td><td>₱6500\.00/)
  assert.match(html, /Cash discount \(&lt;Promo&gt;\)/)
  assert.match(html, /Total after discount<\/td><td>₱6000\.00/)
  assert.match(html, /Amount Paid<\/td><td>₱5500\.00/)
})

test('portal expiry spacing is scoped to the selection workspace', () => {
  const portal = readFileSync(new URL('../components/client-portal-page.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../components/portal-workspace.module.css', import.meta.url), 'utf8')
  assert.match(portal, /<PortalExpiryNotice expiry=\{data\.expiry\} className=\{styles\.expiryNotice\}/)
  assert.match(css, /\.expiryNotice \{ margin-bottom:20px; \}/)
  assert.match(css, /\.expiryNotice \{ margin-bottom:16px; \}/)
})

test('cash discount migration preserves bookings and rejects invalid discount rows', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec("create table public.bookings (id text primary key, price numeric(12,2) not null, payment_history jsonb not null default '[]'::jsonb); insert into public.bookings values ('FM-100001', 6500, '[{\"id\":\"PAY-DEP\",\"amount\":500,\"method\":\"BPI\"}]');")
  const migration = readFileSync(new URL('../supabase/migrations/20260921035628_booking_cash_discount.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  assert.deepEqual((await db.query('select price::text, discount_amount::text, discount_label from public.bookings')).rows, [{ price: '6500.00', discount_amount: '0.00', discount_label: null }])
  await assert.rejects(() => db.exec(`update public.bookings set price = 6400, discount_amount = 100, payment_history = payment_history || '[{"id":"PAY-CASH","amount":5900,"method":"Cash"}]'::jsonb where id = 'FM-100001'`), /bookings_cash_discount_label_valid/)
  await assert.rejects(() => db.exec("update public.bookings set price = 6400, discount_amount = 100, discount_label = 'Studio promo' where id = 'FM-100001'"), /requires one valid new cash payment/)
  await db.exec(`update public.bookings set price = 6400, discount_amount = 100, discount_label = 'Studio promo', payment_history = payment_history || '[{"id":"PAY-CASH","amount":5900,"method":"Cash"}]'::jsonb where id = 'FM-100001'`)
  assert.deepEqual((await db.query('select price::text, discount_amount::text from public.bookings')).rows, [{ price: '6400.00', discount_amount: '100.00' }])
  await assert.rejects(() => db.exec("update public.bookings set price = 6300, discount_amount = 200, discount_label = 'Another promo' where id = 'FM-100001'"), /applied once/)
})
