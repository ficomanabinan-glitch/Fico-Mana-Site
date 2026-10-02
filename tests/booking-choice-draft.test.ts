import assert from 'node:assert/strict'
import test from 'node:test'
import { BOOKING_CHOICE_DRAFT_KEY as key, BOOKING_CHOICE_DRAFT_TTL as ttl, readBookingChoiceDraft, saveBookingChoiceDraft, clearBookingChoiceDraft } from '../lib/booking-choice-draft.ts'

const now = Date.parse('2026-10-02T01:00:00Z')
function storage(raw: string | null = null) {
  const map = new Map<string,string>(raw ? [[key, raw]] : [])
  return { map, getItem: (name: string) => map.get(name) ?? null, setItem: (name: string, value: string) => { map.set(name,value) }, removeItem: (name: string) => { map.delete(name) } }
}
test('draft projects only package/date and restores within one hour without contact payment or reservation data', () => {
  const s = storage()
  saveBookingChoiceDraft(s, { packageId: 'capping-pinning', date: '2026-10-03', email: 'private@example.test', receiptUrl: 'private', token: 'secret' } as { packageId: string; date: string }, now)
  assert.deepEqual(JSON.parse(s.map.get(key)!), { version: 1, packageId: 'capping-pinning', date: '2026-10-03', savedAt: now })
  assert.deepEqual(readBookingChoiceDraft(s, now + ttl - 1), { packageId: 'capping-pinning', date: '2026-10-03', savedAt: now })
  assert.equal(readBookingChoiceDraft(s, now + ttl), null)
  assert.equal(s.map.size, 0)
})
test('draft rejects future clocks malformed versions impossible dates and unexpected private fields', () => {
  for (const raw of ['broken', 'null', JSON.stringify({ version: 1, packageId: 'fico', date: '2026-02-30', savedAt: now }), JSON.stringify({ version: 1, packageId: 'fico', date: null, savedAt: now + 1 }), JSON.stringify({ version: 2, packageId: 'fico', date: null, savedAt: now }), JSON.stringify({ version: 1, packageId: 'fico', date: null, savedAt: now, email: 'private@example.test' })]) {
    const s = storage(raw); assert.equal(readBookingChoiceDraft(s, now), null); assert.equal(s.map.size, 0)
  }
})
test('clearing is immediate and unavailable storage cannot block read save or discard', () => {
  const s = storage(); saveBookingChoiceDraft(s,{ packageId:'fico', date:null },now); clearBookingChoiceDraft(s); assert.equal(readBookingChoiceDraft(s,now),null)
  const denied = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('denied') } }
  assert.equal(readBookingChoiceDraft(denied,now),null)
  assert.doesNotThrow(() => saveBookingChoiceDraft(denied,{packageId:'fico',date:null},now))
  assert.doesNotThrow(() => clearBookingChoiceDraft(denied))
})
