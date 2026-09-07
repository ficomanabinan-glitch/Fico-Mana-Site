import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('System package card omits its decorative icon while retaining package management', () => {
  const source = readFileSync('app/admin/system/page.tsx', 'utf8')
  assert.doesNotMatch(source, /\bPackageOpen\b/)
  assert.match(source, /Packages and client photo-selection rules/)
  assert.match(source, /href="\/admin\/packages"/)
  assert.match(source, /Manage Packages/)
  assert.match(source, /number of photos clients select for each package/)
})
