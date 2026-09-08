import assert from 'node:assert/strict'
import test from 'node:test'
import { clearPortalDraft, portalDraftKey, readPortalDraft, writePortalDraft, PORTAL_DRAFT_TTL_MS, type PortalDraftChoices } from '../lib/portal-selection-draft.ts'

function storage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
const key = portalDraftKey('portal-a', 'selection-a', null, 5)
const choices: PortalDraftChoices = { included: ['photo-1', 'photo-2'], extras: ['photo-extra'], editingPreference: 'less', printSelections: { TOGA_PICTURE_4R: 'photo-1' }, walletSelections: ['photo-1', 'photo-2'], addonQuantities: { print: 2 }, acknowledged: true, step: 'prints' }

test('draft keeps all chosen options for exactly 15 minutes; reading/reloading never extends expiry', () => {
  const browser = storage(), now = 1_000_000
  assert.equal(writePortalDraft(key, choices, browser, now), now + 15 * 60 * 1000)
  assert.deepEqual(readPortalDraft(key, browser, now + PORTAL_DRAFT_TTL_MS - 1)?.choices, choices)
  assert.equal(readPortalDraft(key, browser, now + 10_000)?.expiresAt, now + PORTAL_DRAFT_TTL_MS)
  assert.equal(readPortalDraft(key, browser, now + PORTAL_DRAFT_TTL_MS), null)
  assert.equal(browser.values.size, 0)
})

test('drafts are scoped to browser session, portal, selection, reopening and package allowance', () => {
  const browser = storage(), otherBrowser = storage()
  writePortalDraft(key, choices, browser)
  assert.equal(readPortalDraft(key, otherBrowser), null)
  for (const other of [portalDraftKey('portal-b', 'selection-a', null, 5), portalDraftKey('portal-a', 'selection-b', null, 5), portalDraftKey('portal-a', 'selection-a', '2026-09-08', 5), portalDraftKey('portal-a', 'selection-a', null, 3)]) {
    assert.equal(readPortalDraft(other, browser), null)
  }
  assert.deepEqual(readPortalDraft(key, browser)?.choices, choices)
  clearPortalDraft(key, browser)
  assert.equal(readPortalDraft(key, browser), null)
})

test('storage contains choices only, never authentication, photo URLs, image bytes or cached prices', () => {
  const browser = storage()
  writePortalDraft(key, { ...choices, price: 1, previewUrl: 'https://private.invalid', token: 'not-a-real-token', imageBytes: 'example' } as PortalDraftChoices, browser)
  const value = browser.getItem(key)!
  for (const field of ['price', 'previewUrl', 'token', 'imageBytes']) assert.ok(!value.includes(field))
})

test('corrupt, oversized, expired, future and invalid selection drafts are removed without breaking the portal', () => {
  const browser = storage(), now = 1_000_000
  for (const invalid of ['{broken', 'x'.repeat(32_001), JSON.stringify(null), JSON.stringify({ savedAt: now + 1, expiresAt: now + 1 + PORTAL_DRAFT_TTL_MS, choices }),
    JSON.stringify({ savedAt: now, expiresAt: now + PORTAL_DRAFT_TTL_MS + 1, choices }),
    ...[{ included: ['photo-1', 'photo-1'] }, { editingPreference: 'unknown' }, { extras: ['photo-1'] }, { walletSelections: ['foreign-photo'] }, { walletSelections: ['photo-1', 'photo-1'] }, { addonQuantities: { print: -1 } }, { step: 'unknown' }]
      .map(patch => JSON.stringify({ savedAt: now, expiresAt: now + PORTAL_DRAFT_TTL_MS, choices: { ...choices, ...patch } })),
  ]) {
    browser.setItem(key, invalid)
    assert.equal(readPortalDraft(key, browser, now), null)
    assert.equal(browser.getItem(key), null)
  }
  const blocked = { getItem() { throw new Error('Storage disabled') }, setItem() { throw new Error('Quota') }, removeItem() { throw new Error('Denied') } }
  assert.equal(readPortalDraft(key, blocked), null)
  assert.equal(writePortalDraft(key, choices, blocked), null)
  assert.doesNotThrow(() => clearPortalDraft(key, blocked))
})
