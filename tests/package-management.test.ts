import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatPackagePrice,
  packageManagerInputToRow,
  validatePackageManagerInput,
} from '../lib/package-management.ts'

const validPackage = {
  id: 'fico-5',
  category: 'self-portrait',
  title: 'FICO 5 — Solo or Duo',
  priceAmount: 1800,
  duration: '25 mins',
  description: 'Premium solo session',
  features: ['25 mins studio shoot', '12 enhanced photos'],
  slotType: 'standard',
  selectionLimit: 12,
  note: '',
  isActive: true,
  sortOrder: 28,
}

test('validates and normalizes a managed package', () => {
  const result = validatePackageManagerInput(validPackage)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.selectionLimit, 12)
  assert.equal(result.value.features.length, 2)
  const row = packageManagerInputToRow(result.value)
  assert.equal(row.price_display, '₱1,800')
  assert.equal(row.selection_limit, 12)
})

test('rejects unsafe IDs and invalid photo counts', () => {
  const badId = validatePackageManagerInput({ ...validPackage, id: 'FICO 5!' })
  assert.deepEqual(badId, {
    ok: false,
    error: 'Package ID must use lowercase letters, numbers, and single hyphens only.',
  })

  const badLimit = validatePackageManagerInput({ ...validPackage, selectionLimit: 0 })
  assert.deepEqual(badLimit, {
    ok: false,
    error: 'Photo selection count must be a whole number from 1 to 200.',
  })

  const ungroupedSelfPortrait = validatePackageManagerInput({
    ...validPackage,
    id: 'studio-special',
    title: 'Studio Special',
  })
  assert.deepEqual(ungroupedSelfPortrait, {
    ok: false,
    error: 'Self Portrait packages must start with FICO or MANA so they appear in the correct website section.',
  })
})

test('formats Philippine peso amounts consistently', () => {
  assert.equal(formatPackagePrice(3500), '₱3,500')
  assert.equal(formatPackagePrice(1250.5), '₱1,250.50')
})
