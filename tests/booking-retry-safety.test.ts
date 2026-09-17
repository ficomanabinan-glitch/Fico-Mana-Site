import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { normalizeCustomerFacebookUrl } from '../lib/customer-facebook.ts'

test('customer Facebook links are normalized before reservation submission', () => {
  assert.equal(
    normalizeCustomerFacebookUrl('facebook.com/elrish.rull'),
    'https://facebook.com/elrish.rull',
  )
  assert.equal(
    normalizeCustomerFacebookUrl('  https://www.facebook.com/elrish.rull  '),
    'https://www.facebook.com/elrish.rull',
  )
  assert.equal(normalizeCustomerFacebookUrl('http://facebook.com/elrish.rull'), null)
  assert.equal(normalizeCustomerFacebookUrl('not a link'), null)
})

test('reservation retries reuse the booking ID and uploaded receipt', () => {
  const source = readFileSync(new URL('../components/booking.tsx', import.meta.url), 'utf8')

  assert.match(source, /const id = bookingId \|\| generateBookingId/)
  assert.match(source, /previousReceipt\?\.bookingId === id && previousReceipt\.file === receiptFile/)
  assert.match(source, /uploadedReceiptRef\.current = \{ bookingId: id, file: receiptFile, receiptUrl: uploadedUrl \}/)
})

test('an orphaned receipt can be recovered but a real booking keeps duplicate protection', () => {
  const source = readFileSync(new URL('../app/api/receipts/upload/route.ts', import.meta.url), 'utf8')

  assert.match(source, /from\('bookings'\)[\s\S]*\.eq\('id', previousBookingId\)[\s\S]*\.maybeSingle\(\)/)
  assert.match(source, /if \(!previousBooking && data\.storage_path\)/)
  assert.match(source, /\.update\(\{ booking_id: bookingId \}\)/)
  assert.match(source, /recovered: true/)
  assert.match(source, /This exact receipt image has already been submitted for another booking/)
})
