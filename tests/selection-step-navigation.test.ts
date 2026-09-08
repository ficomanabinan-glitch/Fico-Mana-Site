import assert from 'node:assert/strict'
import test from 'node:test'
import { availableSelectionStep, canVisitSelectionStep } from '../lib/selection-step-navigation.ts'

test('mandatory photos and prints block every forward shortcut', () => {
  for (const target of ['prints', 'addons', 'review'] as const) {
    assert.equal(canVisitSelectionStep('photos', target, false, false, true), false)
  }
  assert.equal(canVisitSelectionStep('prints', 'review', true, false, true), false)
  assert.equal(canVisitSelectionStep('prints', 'addons', true, false, true), false)
})
test('optional add-ons can be skipped and back navigation always works', () => {
  assert.equal(canVisitSelectionStep('prints', 'review', true, true, true), true)
  for (const target of ['photos', 'prints', 'addons'] as const) {
    assert.equal(canVisitSelectionStep('review', target, false, false, false), true)
  }
  assert.equal(canVisitSelectionStep('addons', 'review', true, true, false), false)
})
test('incomplete restored drafts return to earliest required step; locked selections remain inspectable', () => {
  assert.equal(availableSelectionStep('review', false, true, true), 'photos')
  assert.equal(availableSelectionStep('review', true, false, true), 'prints')
  assert.equal(availableSelectionStep('review', true, true, false), 'addons')
  assert.equal(canVisitSelectionStep('photos', 'review', false, false, false, true), true)
})
