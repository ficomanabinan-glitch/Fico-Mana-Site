import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync('app/admin/bookings/page.tsx', 'utf8')
const table = source.match(/\{\/\* TABLE \*\/\}([\s\S]*?)<\/table>/)?.[1] ?? ''

test('Bookings table starts with Reference and omits the client-number dropdown column', () => {
  const headings = [...table.matchAll(/<th\b[^>]*>([^<]+)<\/th>/g)].map(match => match[1])
  assert.deepEqual(headings, ['Reference', 'Customer', 'Package', 'Date & Time', 'Price', 'Deposit', 'Payment', 'Status', 'Actions'])
  assert.doesNotMatch(table, /BookingPrioritySelect|dayPriorityMap|getDayPriorityCount/)
  assert.match(table, /<td className="p-4 pl-6 font-mono font-bold text-primary">\{b.id\}<\/td>/)
  assert.match(table, /colSpan=\{9\}/)
  assert.match(table, /handleOpenDetails\(b\)/)
  assert.match(table, /openDeleteModal\(b\)/)
})

test('arrival-order management remains available in the booking details', () => {
  assert.equal((source.match(/<BookingPrioritySelect\b/g) ?? []).length, 1)
  assert.match(source, /priority=\{dayPriorityMap.get\(selectedBooking.id\) \?\? null\}/)
  assert.match(source, /maxPriority=\{getDayPriorityCount\(bookings, selectedBooking.bookingDate\)\}/)
})
