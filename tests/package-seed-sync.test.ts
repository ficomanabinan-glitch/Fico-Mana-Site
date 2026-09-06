import assert from 'node:assert/strict'
import test from 'node:test'
import { PACKAGE_SEED_ROWS } from '../lib/packages-seed.ts'
import { filterMissingPackageRows } from '../lib/package-seed-sync.ts'

test('package seed sync never overwrites packages already managed in Admin', async () => {
  const allIds = PACKAGE_SEED_ROWS.map((row) => row.id)
  assert.deepEqual(filterMissingPackageRows(PACKAGE_SEED_ROWS, allIds), [])
})

test('package seed sync inserts only missing defaults', async () => {
  const missingId = PACKAGE_SEED_ROWS[0]?.id
  assert.ok(missingId)
  const existingIds = PACKAGE_SEED_ROWS.slice(1).map((row) => row.id)
  const missing = filterMissingPackageRows(PACKAGE_SEED_ROWS, existingIds)
  assert.deepEqual(missing.map((row) => row.id), [missingId])
})
