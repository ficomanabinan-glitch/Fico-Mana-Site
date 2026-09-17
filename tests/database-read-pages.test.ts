import assert from 'node:assert/strict'
import test from 'node:test'
import { readDatabasePages } from '../lib/database/read-pages.ts'

test('metadata pagination returns rows beyond the former 5000 cap with stable ordering', async () => {
  const source = Array.from({ length: 5001 }, (_, id) => ({ id }))
  let calls = 0
  const rows = await readDatabasePages(() => ({ order(column: string) {
    assert.equal(column, 'id'); calls++
    return { range: async (from: number, to: number) => ({ data: source.slice(from, to + 1), error: null }) }
  } }))
  assert.equal(rows.length, 5001)
  assert.equal(calls, 11)
  assert.deepEqual(rows, source)
})

test('query failures and the safety ceiling never masquerade as complete listings', async () => {
  await assert.rejects(readDatabasePages(() => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'offline' } }) }) })), /offline/)
  await assert.rejects(readDatabasePages(() => ({ order: () => ({ range: async () => ({ data: [{ id: 1 }], error: null }) }) }), { pageSize: 1, maxPages: 1 }), /too large/)
})
