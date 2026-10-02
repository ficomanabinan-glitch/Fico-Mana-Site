import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchBookingFormList } from '../lib/booking-form-read.ts'

// REQ-3: only successful arrays are authoritative. HTTP is the isolated boundary.
test('an authoritative empty booking list remains empty', async () => {
  const result = await fetchBookingFormList('/api/bookings/availability', async () => Response.json([]))
  assert.deepEqual(result, [])
})
test('a successful current catalog remains intact', async () => {
  const current = [{ id: 'synthetic-package', price: '₱3,500' }]
  assert.deepEqual(await fetchBookingFormList('/api/packages', async () => Response.json(current)), current)
})
test('HTTP failure is not replaced with empty availability', async () => {
  await assert.rejects(fetchBookingFormList('/api/blocked-slots', async () => Response.json({ error: 'Synthetic outage' }, { status: 503 })))
})
test('transport failure is not replaced with empty held spots', async () => {
  await assert.rejects(fetchBookingFormList('/api/fico-spot-blocks', async () => { throw new Error('Synthetic offline') }), /Synthetic offline/)
})
test('malformed successful data is not treated as an empty list', async () => {
  await assert.rejects(fetchBookingFormList('/api/packages', async () => Response.json({ packages: [] })), /could not be loaded/)
})
