import assert from 'node:assert/strict'
import test from 'node:test'
import { enhancedUploadName } from '../lib/enhanced-upload-naming.ts'
import { readFileSync } from 'node:fs'

test('enhanced names use a per-client number and upper-case booking name, preserving the extension', () => {
  const first = enhancedUploadName('Elrish John Rull', 'ENHANCED - DSC_0001.JPG', 'EDITED/ENHANCED - DSC_0001.JPG', [])
  assert.equal(first, 'ENHANCED 1 - ELRISH JOHN RULL.JPG')
  assert.equal(enhancedUploadName('Elrish John Rull', '02.png', 'EDITED/02.png', [{ relative_path: 'EDITED/01.JPG', file_name: first }]), 'ENHANCED 2 - ELRISH JOHN RULL.png')
  assert.equal(enhancedUploadName('Second Client', 'photo.jpeg', 'EDITED/photo.jpeg', []), 'ENHANCED 1 - SECOND CLIENT.jpeg')
})

test('reserved names survive retry, replaced image bytes and a changed folder enumeration order', () => {
  const existing = [
    { relative_path: 'EDITED/second.JPG', file_name: 'ENHANCED 2 - CLIENT.JPG' },
    { relative_path: 'EDITED/first.JPG', file_name: 'ENHANCED 1 - CLIENT.JPG' },
  ]
  assert.equal(enhancedUploadName('Changed display name', 'first.JPG', 'EDITED/first.JPG', existing), 'ENHANCED 1 - CLIENT.JPG')
  assert.equal(enhancedUploadName('Client', 'third.JPG', 'EDITED/third.JPG', existing), 'ENHANCED 3 - CLIENT.JPG')
})

test('safe enhanced names retain Unicode, normalize spacing and reserve room for the image extension', () => {
  assert.equal(enhancedUploadName('  José / Peña  ', 'p.JPEG', 'EDITED/p.JPEG', []), 'ENHANCED 1 - JOSÉ PEÑA.JPEG')
  const long = enhancedUploadName('A'.repeat(250), 'p.JPEG', 'EDITED/p.JPEG', [])
  assert.equal(long.length, 140); assert.ok(long.endsWith('.JPEG'))
  assert.throws(() => enhancedUploadName('  ', 'p.jpg', 'EDITED/p.jpg', []), /client name/)
  assert.throws(() => enhancedUploadName('Client', 'photo', 'EDITED/photo', []), /extension/)
})

test('server reserves names under the existing booking lock before creating the private R2 upload plan', () => {
  const source = readFileSync('lib/editor-workflow.ts', 'utf8')
  const reservation = source.slice(source.indexOf('async function reserveEnhancedUpload'), source.indexOf('export async function createDeliverableUploadSession'))
  assert.match(reservation, /download_lock_expires_at.is.null,download_lock_expires_at.lte/)
  assert.match(reservation, /select\('customer_name'\).eq\('workspace_id', workspaceId\)/)
  assert.match(reservation, /file_name: fileName/)
  assert.match(reservation, /finally[\s\S]*eq\('download_lock_expires_at', lockUntil\)/)
  const session = source.slice(source.indexOf('export async function createDeliverableUploadSession'), source.indexOf('export async function completeDeliverableUpload'))
  assert.match(session, /reserveEnhancedUpload[\s\S]*createStorageKey\([\s\S]*createMultipartUpload\(|reserveEnhancedUpload[\s\S]*createStorageKey\([\s\S]*createUploadUrl\(/)
  assert.match(session, /update\(\{ storage_key: storageKey, storage_provider: 'r2'/)
  assert.match(session, /if \(duplicate\)[\s\S]*duplicate: true/)
})
