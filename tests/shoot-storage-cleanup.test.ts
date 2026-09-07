import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  cleanupCategoriesSchema, cleanupDateRange, cleanupFingerprint, runCleanupChunk, signCleanupGrant,
  verifyCleanupGrant, validateCleanupFile, type CleanupGrant, type CleanupOutcome,
} from '../lib/shoot-storage-cleanup.ts'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
const grant: CleanupGrant = {
  version: 1, workspaceId, actorId, bookingId: 'FM-TEST-1', rootId: 'root-id', shootDate: '2026-09-07',
  expiresAt: 10000,
  files: ['a', 'b'].map(id => ({ id, name: `${id}.jpg`, category: 'RAW',
    parents: ['raw-id', 'client-id', 'day-id', 'month-id', 'root-id'], fingerprint: 'image/jpeg|10|abc|2026-09-07' })),
}

test('cleanup ranges use inclusive GMT+8 scheduled dates, not browser timezone or upload dates', () => {
  assert.deepEqual(cleanupDateRange('7days', new Date('2026-09-06T16:00:00Z')), { from: '2026-09-01', to: '2026-09-07' })
  assert.deepEqual(cleanupDateRange('month', new Date('2026-09-06T15:59:59Z')), { from: '2026-08-08', to: '2026-09-06' })
  assert.deepEqual(cleanupDateRange('7days', new Date('2027-01-01T00:00:00Z')), { from: '2026-12-26', to: '2027-01-01' })
  assert.deepEqual(cleanupDateRange('month', new Date('2024-03-01T00:00:00Z')), { from: '2024-02-01', to: '2024-03-01' })
  assert.deepEqual(cleanupDateRange('all'), { from: null, to: null })
})

test('cleanup categories reject empty, duplicated, and non-photo scopes', () => {
  for (const input of [[], ['RAW', 'RAW'], ['ROOT'], ['bookings'], ['payments']]) assert.equal(cleanupCategoriesSchema.safeParse(input).success, false)
  assert.equal(cleanupCategoriesSchema.safeParse(['RAW', 'SELECTED', 'EDITED', 'DELIVERABLES']).success, true)
})

test('cleanup reviews bind exact files to actor, workspace, root and expiry, and reject tampering', () => {
  const previous = process.env.SECURITY_HASH_SECRET
  process.env.SECURITY_HASH_SECRET = 'test-only-storage-cleanup-signing-key-12345'
  try {
    const token = signCleanupGrant(grant)
    assert.deepEqual(verifyCleanupGrant(token, workspaceId, actorId, 9000), grant)
    assert.throws(() => verifyCleanupGrant(token, workspaceId, actorId, 10000))
    assert.throws(() => verifyCleanupGrant(token, actorId, actorId, 9000))
    assert.throws(() => verifyCleanupGrant(token, workspaceId, workspaceId, 9000))
    assert.throws(() => verifyCleanupGrant(`${token}x`, workspaceId, actorId, 9000))
    assert.throws(() => verifyCleanupGrant(`${token}.extra`, workspaceId, actorId, 9000))
    const altered = Buffer.from(JSON.stringify({ ...grant, bookingId: 'another-client' })).toString('base64url')
    assert.throws(() => verifyCleanupGrant(`${altered}.${token.split('.')[1]}`, workspaceId, actorId, 9000))
    assert.throws(() => verifyCleanupGrant(signCleanupGrant({ ...grant, files: [grant.files[0], grant.files[0]] }), workspaceId, actorId, 9000))
    assert.throws(() => verifyCleanupGrant(signCleanupGrant({ ...grant, files: [{ ...grant.files[0], id: grant.rootId }] }), workspaceId, actorId, 9000))
    assert.throws(() => verifyCleanupGrant(signCleanupGrant({ ...grant, rootId: 'different-root' }), workspaceId, actorId, 9000))
    process.env.SECURITY_HASH_SECRET = ''
    assert.throws(() => signCleanupGrant(grant))
  } finally {
    if (previous === undefined) delete process.env.SECURITY_HASH_SECRET
    else process.env.SECURITY_HASH_SECRET = previous
  }
})

test('review fingerprints detect replacement contents, timestamps, size and MIME type changes', () => {
  const file = { mimeType: 'image/jpeg', size: '10', md5Checksum: 'abc', modifiedTime: 'today' }
  for (const update of [{ mimeType: 'application/vnd.google-apps.folder' }, { size: '20' }, { md5Checksum: 'def' }, { modifiedTime: 'tomorrow' }]) {
    assert.notEqual(cleanupFingerprint(file), cleanupFingerprint({ ...file, ...update }))
  }
})

test('current-file checks reject moved, changed, renamed, shortcut, folder, and substitute targets', () => {
  const target = grant.files[0]
  const current = { id: 'a', name: 'a.jpg', mimeType: 'image/jpeg', parents: ['raw-id'], size: '10', md5Checksum: 'abc', modifiedTime: '2026-09-07' }
  assert.equal(validateCleanupFile(target, current), 'present')
  assert.equal(validateCleanupFile(target, { ...current, trashed: true }), 'trashed')
  for (const update of [
    { id: 'other' }, { parents: ['another-client'] }, { parents: ['raw-id', 'another-client'] },
    { name: 'renamed.jpg' }, { size: '11' }, { md5Checksum: 'changed' }, { modifiedTime: 'changed' },
    { mimeType: 'application/vnd.google-apps.folder' }, { mimeType: 'application/vnd.google-apps.shortcut' },
  ]) assert.throws(() => validateCleanupFile(target, { ...current, ...update }))
})

function dependencies(events: string[]) {
  return {
    validate: async (file: CleanupGrant['files'][number]): Promise<'present' | 'trashed'> => { events.push(`validate:${file.id}`); return 'present' },
    auditStart: async () => { events.push('audit:start') },
    disablePortal: async () => { events.push('disable:portal') },
    trash: async (file: CleanupGrant['files'][number]) => { events.push(`trash:${file.id}`) },
    auditResult: async (results: CleanupOutcome[]) => { assert.equal(results.length, grant.files.length); events.push('audit:result') },
  }
}

test('cleanup validates all targets, records intent, then disables the portal before moving files', async () => {
  const events: string[] = []
  const results = await runCleanupChunk(grant, dependencies(events))
  assert.deepEqual(events, ['validate:a', 'validate:b', 'audit:start', 'disable:portal', 'trash:a', 'trash:b', 'audit:result'])
  assert.deepEqual(results.map(file => file.status), ['trashed', 'trashed'])
})

test('validation, audit, or portal failures prevent any Drive mutation', async () => {
  for (const failure of ['validate', 'auditStart', 'disablePortal'] as const) {
    const events: string[] = [], deps = dependencies(events)
    deps[failure] = async () => { throw new Error('Synthetic failure') }
    await assert.rejects(runCleanupChunk(grant, deps))
    assert.equal(events.some(event => event.startsWith('trash:')), false)
  }
})

test('cleanup reports partial failures without returning raw upstream secrets', async () => {
  const events: string[] = [], deps = dependencies(events)
  deps.trash = async file => { if (file.id === 'b') throw new Error('sensitive-upstream-message') }
  const results = await runCleanupChunk(grant, deps)
  assert.deepEqual(results.map(file => file.status), ['trashed', 'failed'])
  assert.match(results[1].error!, /Try:/)
  assert.doesNotMatch(JSON.stringify(results), /sensitive-upstream-message/)
  assert.equal(events.at(-1), 'audit:result')
})

test('a replay recognizes already-trashed files without moving them again', async () => {
  const events: string[] = [], deps = dependencies(events)
  deps.validate = async () => 'trashed'
  const results = await runCleanupChunk(grant, deps)
  assert.deepEqual(results.map(file => file.status), ['already_trashed', 'already_trashed'])
  assert.equal(events.some(event => event.startsWith('trash:')), false)
})

test('cleanup source keeps preview read-only, checks membership/MFA/origin, and preserves records', async () => {
  const route = await readFile(new URL('../app/api/admin/shoot-storage/route.ts', import.meta.url), 'utf8')
  const server = await readFile(new URL('../lib/shoot-storage-cleanup-server.ts', import.meta.url), 'utf8')
  const drive = await readFile(new URL('../lib/google-drive.ts', import.meta.url), 'utf8')
  const ui = await readFile(new URL('../components/shoot-storage-cleanup.tsx', import.meta.url), 'utf8')
  assert.match(route, /requireStaffAuth\(request\)/)
  assert.match(route, /canUseWorkflow\(access, 'admin'\)/)
  assert.match(route, /failClosed: true/)
  assert.match(route, /privateNoStoreHeaders/)
  assert.match(route, /verifyCleanupGrant\(parsed.data.token, access.workspaceId, user!.id\)/)
  assert.doesNotMatch(server, /\.delete\(|\.rpc\(|initializeDriveRootFolder|resolveDriveRootFolder/)
  const preview = server.slice(server.indexOf('export async function previewCleanupShoot'), server.indexOf('export async function executeCleanupShoot'))
  assert.doesNotMatch(preview, /\.update\(|\.insert\(|trashDriveFile\(/)
  assert.match(server, /\.eq\('workspace_id', grant.workspaceId\)\.eq\('booking_id', grant.bookingId\)/)
  assert.match(server, /validateCleanupFile\(file, await getDriveCleanupFile\(file.id\)\)/)
  assert.match(server, /\.eq\('status', 'UPLOADING'\)/)
  const trash = drive.slice(drive.indexOf('export async function trashDriveFile'), drive.indexOf('export async function listDriveFiles'))
  assert.match(trash, /method: 'PATCH'/)
  assert.match(trash, /JSON.stringify\(\{ trashed: true \}\)/)
  assert.doesNotMatch(trash, /method: 'DELETE'/)
  assert.match(ui, /confirmation !== confirmationText/)
  assert.match(ui, /!acknowledged/)
  assert.match(ui, /<dialog/)
  assert.match(ui, /stop.current = true/)
})
