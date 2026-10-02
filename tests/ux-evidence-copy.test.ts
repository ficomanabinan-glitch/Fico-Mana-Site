import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// REQ-5/6: source copy contracts supplement, but do not replace, rendered browser checks.
test('System distinguishes static descriptions and unavailable configuration evidence from health claims', () => {
  const source = readFileSync('app/admin/system/page.tsx', 'utf8')
  assert.doesNotMatch(source, /value="(?:Connected|Protected)"/)
  assert.match(source, /Check unavailable/)
  assert.match(source, /no readiness has been confirmed/)
  assert.match(source, /delivery has not been confirmed/)
})
test('locked review is reassuring without promising a fresh approval or real sample mutation', () => {
  const source = readFileSync('components/portal-review.tsx', 'utf8')
  assert.doesNotMatch(source, /Duplicate submission is blocked/)
  assert.match(source, /You don’t need to submit again/)
  assert.match(source, /view finished photos when available/)
  assert.match(source, /practice choices were not submitted or saved to a booking/)
})
