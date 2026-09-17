import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertStorageKeyOwnership,
  bookingStoragePrefix,
  createDerivativeKey,
  createStorageKey,
  fileExtension,
  parseStorageKey,
} from '../lib/storage/storage-keys.ts'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const bookingId = 'FM-123530'

test('R2 keys isolate every booking under a deterministic private prefix', () => {
  const key = createStorageKey({
    workspaceId,
    bookingId,
    shootDate: '2026-09-11',
    category: 'raw',
    objectId: '22222222-2222-4222-8222-222222222222',
    fileName: 'BNI00371.JPG',
  })
  assert.equal(key, 'workspaces/11111111-1111-4111-8111-111111111111/shoots/2026/09/11/FM-123530/raw/22222222-2222-4222-8222-222222222222.jpg')
  assert.equal(bookingStoragePrefix({ workspaceId, bookingId, shootDate: '2026-09-11' }), 'workspaces/11111111-1111-4111-8111-111111111111/shoots/2026/09/11/FM-123530')
  assert.equal(parseStorageKey(key).category, 'raw')
})

test('storage ownership rejects cross-workspace and cross-booking access', () => {
  const key = createStorageKey({
    workspaceId,
    bookingId,
    shootDate: '2026-09-11',
    category: 'enhanced',
    objectId: '33333333-3333-4333-8333-333333333333',
    fileName: 'ENHANCED 1 - ELRISH JOHN RULL.JPG',
  })
  assert.throws(() => assertStorageKeyOwnership(key, workspaceId, 'FM-999999'))
  assert.throws(() => assertStorageKeyOwnership(key, '44444444-4444-4444-8444-444444444444', bookingId))
  assert.equal(assertStorageKeyOwnership(key, workspaceId, bookingId).category, 'enhanced')
})

test('unsafe filenames and path traversal never enter an R2 key', () => {
  const key = createStorageKey({ workspaceId, bookingId, shootDate: '2026-09-11', category: 'raw', objectId: 'object', fileName: '../secret.jpg' })
  assert.equal(key.endsWith('/raw/object.jpg'), true)
  assert.equal(key.includes('..'), false)
  assert.equal(key.includes('secret'), false)
  assert.throws(() => parseStorageKey('workspaces/../../secret.jpg'))
})

/**
 * Scenario: SC-002 — Private key ownership and boundary validation
 * Requirement: REQ-R2-02
 * Priority: P0
 */
test('R2 key parser rejects malformed namespaces and produces owned derivatives', () => {
  const original = createStorageKey({
    workspaceId,
    bookingId,
    shootDate: '2026-09-11',
    category: 'raw',
    objectId: 'raw-object-01',
    fileName: 'CAMERA-01.JPEG',
  })
  const preview = createDerivativeKey(original, 'preview')
  const thumbnail = createDerivativeKey(original, 'thumbnail')

  assert.equal(fileExtension('CAMERA-01.JPEG'), 'jpg')
  assert.equal(parseStorageKey(preview).category, 'preview')
  assert.equal(parseStorageKey(thumbnail).category, 'thumbnail')
  assert.equal(assertStorageKeyOwnership(preview, workspaceId, bookingId).objectId, 'raw-object-01')

  for (const malformed of [
    '',
    '/workspaces/studio/shoots/2026/09/11/booking/raw/object.jpg',
    'workspaces/studio//shoots/2026/09/11/booking/raw/object.jpg',
    'workspaces/studio/shoots/2026/09/11/booking/unknown/object.jpg',
    'workspaces/studio/shoots/2026/09/11/booking/raw/object.exe.exe',
    `workspaces/${'a'.repeat(1_025)}`,
  ]) assert.throws(() => parseStorageKey(malformed), malformed)

  assert.throws(() => bookingStoragePrefix({ workspaceId, bookingId, shootDate: '09/11/2026' }))
  assert.throws(() => createDerivativeKey(original, 'preview', '../jpg'))
})
