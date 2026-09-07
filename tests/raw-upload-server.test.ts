import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'
import { validatePhotographyFileContent } from '../lib/security/file-validation.ts'

const shared = loadTs<typeof import('../lib/raw-upload-shared.ts')>('lib/raw-upload-shared.ts', {})
const contract = loadTs<typeof import('../lib/raw-upload-contract.ts')>('lib/raw-upload-contract.ts', { zod: { z }, '@/lib/raw-upload-shared': shared })
const grants = loadTs<typeof import('../lib/raw-upload-grant.ts')>('lib/raw-upload-grant.ts', { zod: { z }, '@/lib/raw-upload-contract': contract })
const context = { workspaceId: '00000000-0000-4000-8000-000000000001', actorId: '00000000-0000-4000-8000-000000000002', bookingId: 'FM-SYNTHETIC' }
const originalSecret = process.env.SECURITY_HASH_SECRET
test.before(() => { process.env.SECURITY_HASH_SECRET = 'synthetic-only-raw-upload-grant-test-'.repeat(2) })
test.after(() => { if (originalSecret === undefined) delete process.env.SECURITY_HASH_SECRET; else process.env.SECURITY_HASH_SECRET = originalSecret })

function fixture(options: { invalidContent?: boolean; scanRejected?: boolean; scannerDown?: boolean; auditError?: boolean; forbiddenBooking?: boolean; bytes?: Buffer; fileName?: string } = {}) {
  const bytes = options.bytes || (options.invalidContent ? Buffer.from('not a photo') : Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(28)]))
  const metadata = { fileName: options.fileName || 'BNI00371.JPG', fileSize: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') }
  let file: import('../lib/google-drive.ts').DriveFile | null = null
  const calls: string[] = []
  const gallery = new Map<string, Record<string, unknown>>()
  const previews: Buffer[] = []
  const admin = { storage: { from(bucket: string) { assert.equal(bucket, 'fico-mana-thumbnails'); return {
    async upload(_path: string, preview: Buffer) { previews.push(preview); return { error: null } },
  } } }, from(table: string) { return {
    async insert() { calls.push(`insert:${table}`); return { error: options.auditError ? new Error('synthetic') : null } },
    upsert(row: Record<string, unknown>) { return { select() { return { async single() {
      calls.push(`upsert:${table}`); gallery.set(String(row.drive_file_id), row); return { data: row, error: null }
    } } } } },
  } } }
  const server = loadTs<typeof import('../lib/raw-upload-server.ts')>('lib/raw-upload-server.ts', {
    sharp,
    '@/lib/supabase/admin': { getSupabaseAdmin: () => admin },
    '@/lib/editor-workflow': { ensureBookingFolders: async (_admin: unknown, workspace: string, booking: string) => {
      calls.push('authorize-booking')
      assert.equal(workspace, context.workspaceId); assert.equal(booking, context.bookingId)
      if (options.forbiddenBooking) throw new Error('Forbidden booking')
      return { hierarchy: { raw: { id: 'raw' } }, batch: { id: 'batch' }, booking: { client_id: 'client' } }
    } },
    '@/lib/raw-upload-contract': contract, '@/lib/raw-upload-grant': grants,
    '@/lib/security/file-validation': { validatePhotographyFileContent },
    '@/lib/security/upload-scanner': { scanUpload: async () => {
      calls.push('scan'); if (options.scannerDown) throw new Error('Scanner unavailable')
      return { status: options.scanRejected ? 'rejected' : 'clean' }
    } },
    '@/lib/security/outbound-url': { readBoundedResponse: async (response: Response, max: number) => {
      assert.equal(max, shared.MAX_RAW_UPLOAD_BYTES); return Buffer.from(await response.arrayBuffer())
    } },
    '@/lib/google-drive': {
      normalizeDriveFolderName: (value: string) => value,
      findOrCreateFolder: async (parent: string, name: string) => { calls.push('folder'); assert.equal(parent, 'raw'); assert.equal(name, '_UPLOADS'); return { id: 'incoming' } },
      listDriveFiles: async (parent: string) => { calls.push('list'); return file?.parents?.includes(parent) ? [file] : [] },
      createDriveResumableUpload: async (input: Record<string, unknown>) => {
        calls.push('session'); assert.equal(input.existingDriveFileId, undefined, 'Never overwrite an existing original')
        assert.equal(input.destinationFolderId, 'incoming'); assert.equal(input.purpose, 'raw')
        assert.equal(input.browserOrigin, 'https://admin.ficomana.com')
        file = { id: 'new-photo', name: String(input.fileName), mimeType: String(input.mimeType), size: String(input.fileSize), parents: ['incoming'],
          appProperties: { bookingId: String(input.bookingId), relativePath: String(input.relativePath), checksum: String(input.checksum),
            purpose: 'raw', rawUploadKey: String(input.uploadKey), rawVerification: 'pending' } }
        return 'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic'
      },
      getDriveFolder: async () => { calls.push('check-folder'); return { id: 'incoming', parents: ['raw'] } },
      getDriveFile: async () => { calls.push('check-file'); return file },
      openDriveFile: async () => { calls.push('read-bytes'); return new Response(bytes) },
      promoteRawUpload: async () => { calls.push('promote'); file!.parents = ['raw']; file!.appProperties!.rawVerification = 'verified'; return file },
    },
  })
  return { server, calls, gallery, metadata, previews, get file() { return file! } }
}

test('signed raw upload permissions bind staff, workspace, booking, metadata and expiry', () => {
  const grant = { ...context, version: 1 as const, fileName: 'BNI00371.JPG', fileSize: 8, checksum: 'a'.repeat(64),
    uploadKey: 'b'.repeat(64), rawFolderId: 'raw', incomingFolderId: 'incoming', expiresAt: Date.now() + 60000 }
  const token = grants.signRawUploadGrant(grant)
  assert.equal(grants.verifyRawUploadGrant(token, context.workspaceId, context.actorId, context.bookingId).fileName, grant.fileName)
  for (const [workspace, actor, booking] of [['wrong', context.actorId, context.bookingId], [context.workspaceId, 'wrong', context.bookingId], [context.workspaceId, context.actorId, 'wrong']]) {
    assert.throws(() => grants.verifyRawUploadGrant(token, workspace, actor, booking), /another session/)
  }
  assert.throws(() => grants.verifyRawUploadGrant(`${token.slice(0, -4)}nope`, context.workspaceId, context.actorId, context.bookingId))
  assert.throws(() => grants.verifyRawUploadGrant(token, context.workspaceId, context.actorId, context.bookingId, grant.expiresAt))
  assert.equal(contract.rawUploadMetadataSchema.safeParse({ fileName: '../bad.JPG', fileSize: 8, checksum: grant.checksum }).success, false)
  assert.equal(contract.rawUploadMetadataSchema.safeParse({ fileName: 'file.exe', fileSize: 8, checksum: grant.checksum }).success, false)
  assert.equal(contract.rawUploadMetadataSchema.safeParse({ fileName: 'photo.JPG', fileSize: shared.MAX_RAW_UPLOAD_BYTES + 1, checksum: grant.checksum }).success, false)
})

test('direct original is checked, scanned and promoted before indexing; retry reuses its existing Drive file', async () => {
  const f = fixture()
  const session = await f.server.startRawUpload(context, f.metadata, 'https://admin.ficomana.com')
  assert.equal(f.gallery.size, 0)
  assert.ok('uploadUrl' in session)
  const result = await f.server.completeRawUpload(context, session.grant, f.file.id)
  assert.equal(result.success, true)
  assert.ok(f.calls.indexOf('read-bytes') < f.calls.indexOf('scan'))
  assert.ok(f.calls.indexOf('scan') < f.calls.indexOf('promote'))
  assert.ok(f.calls.indexOf('promote') < f.calls.indexOf('upsert:gallery_files'))
  const retry = await f.server.startRawUpload(context, f.metadata, 'https://admin.ficomana.com')
  assert.equal('driveFileId' in retry && retry.driveFileId, f.file.id)
  assert.equal(f.calls.filter(call => call === 'session').length, 1)
  await f.server.completeRawUpload(context, retry.grant, f.file.id)
  assert.equal(f.gallery.size, 1)
})

test('forged permissions and foreign files are refused before file content access', async () => {
  const f = fixture()
  const session = await f.server.startRawUpload(context, f.metadata, 'https://admin.ficomana.com')
  const count = f.calls.length
  await assert.rejects(f.server.completeRawUpload(context, `${session.grant}tampered`, f.file.id))
  assert.equal(f.calls.length, count)
  f.file.appProperties!.bookingId = 'OTHER-CLIENT'
  await assert.rejects(f.server.completeRawUpload(context, session.grant, f.file.id), /does not match/)
  assert.equal(f.calls.includes('read-bytes'), false)
  assert.equal(f.gallery.size, 0)
  const unauthorized = fixture({ forbiddenBooking: true })
  await assert.rejects(unauthorized.server.startRawUpload(context, unauthorized.metadata, 'https://admin.ficomana.com'))
  assert.deepEqual(unauthorized.calls, ['authorize-booking'])
})

test('portal previews are small separate derivatives and never replace original Drive bytes', async () => {
  const bytes = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#555555' } }).jpeg().toBuffer()
  const before = Buffer.from(bytes)
  const f = fixture({ bytes })
  const session = await f.server.startRawUpload(context, f.metadata, 'https://admin.ficomana.com')
  await f.server.completeRawUpload(context, session.grant, f.file.id)
  assert.deepEqual(bytes, before)
  assert.equal(f.previews.length, 1)
  const dimensions = await sharp(f.previews[0]).metadata()
  assert.equal(dimensions.width, 1600); assert.equal(dimensions.height, 800)
  assert.ok(f.previews[0].length < 4 * 1024 * 1024)
  assert.equal(f.gallery.get(f.file.id)?.thumbnail_reference, `${context.workspaceId}/${context.bookingId}/${f.file.id}.jpg`)
})

test('server verifies and indexes a full 50 MiB synthetic CR3 original without conversion', async () => {
  const bytes = Buffer.alloc(50 * 1024 * 1024, 0x71)
  bytes.writeUInt32BE(24, 0); bytes.write('ftypcrx ', 4, 'ascii')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const f = fixture({ bytes, fileName: 'PRO_CAMERA_50MB.CR3' })
  const session = await f.server.startRawUpload(context, f.metadata, 'https://admin.ficomana.com')
  assert.equal(session.mimeType, 'application/octet-stream')
  await f.server.completeRawUpload(context, session.grant, f.file.id)
  const row = f.gallery.get(f.file.id)!
  assert.equal(row.file_size, 52428800)
  assert.equal(row.file_name, 'PRO_CAMERA_50MB.CR3')
  assert.equal(row.checksum, hash)
  assert.equal(f.previews.length, 0, 'Camera RAW originals are not decoded or converted for the upload')
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash)
  assert.ok(f.calls.indexOf('scan') < f.calls.indexOf('promote'))
})

test('bad contents, size, checksum, scanner or audit failures cannot promote or index an upload', async () => {
  for (const options of [{ invalidContent: true }, { scanRejected: true }, { scannerDown: true }, { auditError: true }]) {
    const f = fixture(options)
    const session = await f.server.startRawUpload(context, f.metadata, 'https://admin.ficomana.com')
    await assert.rejects(f.server.completeRawUpload(context, session.grant, f.file.id))
    assert.equal(f.calls.includes('promote'), false)
    assert.equal(f.gallery.size, 0)
  }
  for (const tamper of [(file: import('../lib/google-drive.ts').DriveFile) => { file.size = '999' },
    (file: import('../lib/google-drive.ts').DriveFile) => { file.appProperties!.checksum = 'f'.repeat(64) },
    (file: import('../lib/google-drive.ts').DriveFile) => { file.parents = ['other-client'] }]) {
    const f = fixture(); const session = await f.server.startRawUpload(context, f.metadata, 'https://admin.ficomana.com'); tamper(f.file)
    await assert.rejects(f.server.completeRawUpload(context, session.grant, f.file.id))
    assert.equal(f.calls.includes('read-bytes'), false)
  }
})

test('upload routes retain authorization, rate limits, tiny JSON, no-store and pending-file isolation', () => {
  const route = readFileSync('app/api/editor-workflow/[...path]/route.ts', 'utf8')
  const raw = route.slice(route.indexOf("if (path[0] === 'raw' && path[1]"))
  assert.ok(raw.indexOf("requireCapability('onsite')") < raw.indexOf('startRawUpload'))
  assert.match(route, /requireWorkflowAuth\('view', request\)/)
  assert.match(route, /API_RATE_LIMITS.editorUpload/)
  assert.match(raw, /Buffer.byteLength\(body, 'utf8'\) > 8000/)
  assert.match(route, /'cache-control': 'no-store'/)
  assert.match(readFileSync('lib/editor-workflow.ts', 'utf8'), /rawVerification !== 'pending'/)
  const config = readFileSync('next.config.mjs', 'utf8')
  assert.match(config, /https:\/\/www.googleapis.com\/upload\/drive\/v3\//)
  assert.doesNotMatch(config, /https:\/\/\*\.googleapis.com/)
})
