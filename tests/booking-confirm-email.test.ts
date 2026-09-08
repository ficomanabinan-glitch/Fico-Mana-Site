import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { customerEmailsMatch } from '../lib/customer-email.ts'

test('email confirmation rejects missing values and typos, allowing case and surrounding whitespace', () => {
  assert.equal(customerEmailsMatch('client@example.com', 'client@example.com'), true)
  assert.equal(customerEmailsMatch(' Client@Example.com ', 'client@example.com'), true)
  for (const [email, confirm] of [['', ''], ['client@example.com', ''], ['client@example.com', 'client@exmaple.com'], ['client@example.com', 'other@example.com']]) {
    assert.equal(customerEmailsMatch(email, confirm), false)
  }
})

test('booking requires confirmation at contact and final submission and clears it for a new booking', () => {
  const source = readFileSync('components/booking.tsx', 'utf8')
  assert.match(source, /customerEmailsMatch\(email, confirmEmail\)/)
  assert.match(source, /id="booking-confirm-email"[^>]*required type="email"/)
  assert.match(source, /const submitBooking = async[\s\S]*?if \(!validateContactStep\(\)\) return[\s\S]*?uploadReceipt/)
  assert.match(source, /const resetBooking = \(\) => \{[\s\S]*?setConfirmEmail\(''\)/)
})
