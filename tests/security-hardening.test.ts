import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'
import { isAdminUser } from '../lib/auth/admin.ts'
import {
  detectFileSignature,
  validateEditedPhotoMetadata,
  validateJpegThumbnailContent,
  validatePhotographyFileContent,
  validateReceiptImageContent,
} from '../lib/security/file-validation.ts'
import { isAllowedRequestOrigin } from '../lib/security/origin.ts'
import { safeMetadata } from '../lib/security/audit-metadata.ts'
import {
  bookingMutationSchema,
  editorUploadSessionSchema,
  portalSelectionSchema,
} from '../lib/security/schemas.ts'

test('trusted app_metadata grants admin while editable user_metadata cannot escalate', () => {
  const base = { id: 'user-1', email: 'person@example.com' }
  assert.equal(
    isAdminUser({ ...base, app_metadata: { role: 'staff' }, user_metadata: { role: 'admin' } } as never),
    false,
  )
  assert.equal(
    isAdminUser({ ...base, app_metadata: { role: 'admin' }, user_metadata: {} } as never),
    true,
  )
  assert.equal(
    isAdminUser({ ...base, app_metadata: { roles: ['owner'] }, user_metadata: {} } as never),
    true,
  )
})

test('portal signatures use HMAC and constant-time comparison', async () => {
  const source = await readFile('lib/client-portal.ts', 'utf8')
  assert.match(source, /createHmac\('sha256'/)
  assert.match(source, /timingSafeEqual\(left, right\)/)
  assert.match(source, /process\.env\.NODE_ENV === 'production'/)
  assert.match(source, /secret\.length < 32/)
})

test('production mutation origins are allowlisted', () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const previous = mutableEnv.NODE_ENV
  mutableEnv.NODE_ENV = 'production'
  try {
    assert.equal(
      isAllowedRequestOrigin(new Request('https://admin.ficomana.com/api/test', {
        method: 'POST', headers: { origin: 'https://admin.ficomana.com' },
      })),
      true,
    )
    assert.equal(
      isAllowedRequestOrigin(new Request('https://admin.ficomana.com/api/test', {
        method: 'POST', headers: { origin: 'https://attacker.example' },
      })),
      false,
    )
    assert.equal(
      isAllowedRequestOrigin(new Request('https://admin.ficomana.com/api/test', { method: 'POST' })),
      false,
    )
  } finally {
    if (previous === undefined) delete mutableEnv.NODE_ENV
    else mutableEnv.NODE_ENV = previous
  }
})

test('receipt images require matching MIME, extension, signature, and successful decode', async () => {
  const jpeg = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#ffffff' },
  }).jpeg().toBuffer()
  assert.equal(detectFileSignature(jpeg), 'jpeg')
  assert.equal(await validateReceiptImageContent(jpeg, 'image/jpeg', 'receipt.jpg'), 'jpeg')
  await assert.rejects(
    validateReceiptImageContent(jpeg, 'image/png', 'receipt.png'),
    /does not match/,
  )
  await assert.rejects(
    validateReceiptImageContent(Buffer.from('not an image'), 'image/jpeg', 'receipt.jpg'),
    /does not match|not a valid/,
  )
})

test('photography uploads reject extension and magic-byte mismatches', () => {
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(validatePhotographyFileContent(jpegHeader, 'camera.jpg'), 'jpeg')
  assert.throws(() => validatePhotographyFileContent(jpegHeader, '../camera.png'), /does not match/)
  assert.throws(() => validatePhotographyFileContent(Buffer.from('fake raw photo'), 'camera.cr2'), /does not match/)
})

test('onsite thumbnails require a decodable JPEG', async () => {
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  }).jpeg().toBuffer()
  await assert.doesNotReject(validateJpegThumbnailContent(jpeg))
  await assert.rejects(validateJpegThumbnailContent(Buffer.from('not a jpeg')), /not a JPEG/)
})

test('edited-photo sessions require consistent, bounded upload metadata', () => {
  const valid = {
    uploadJobId: 'fd76e500-48e6-40f0-9792-cac741607ff9',
    bookingId: 'FICO-2026-0001',
    relativePath: 'EDITED/FICO-2026-0001/photo-01.jpg',
    fileName: 'photo-01.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2_000_000,
    checksum: 'a'.repeat(64),
  }
  assert.equal(editorUploadSessionSchema.safeParse(valid).success, true)
  assert.equal(editorUploadSessionSchema.safeParse({ ...valid, role: 'owner' }).success, false)
  assert.equal(editorUploadSessionSchema.safeParse({ ...valid, fileSize: 600 * 1024 * 1024 }).success, false)
  assert.equal(editorUploadSessionSchema.safeParse({ ...valid, checksum: 'not-a-checksum' }).success, false)
  assert.doesNotThrow(() => validateEditedPhotoMetadata('photo-01.jpg', 'image/jpeg'))
  assert.throws(() => validateEditedPhotoMetadata('photo-01.jpg', 'image/png'), /do not match/)
})

test('security schemas reject unknown fields and invalid cross-resource selections', () => {
  assert.equal(portalSelectionSchema.safeParse({ fileIds: ['not-a-uuid'] }).success, false)
  assert.equal(portalSelectionSchema.safeParse({ fileIds: [], bookingId: 'other' }).success, false)
  assert.equal(bookingMutationSchema.safeParse({ price: 1, role: 'admin' }).success, false)
})

test('security audit metadata redacts credentials and control characters', () => {
  assert.deepEqual(
    safeMetadata({
      action: 'drive_connected\r\nforged',
      refreshToken: 'must-not-be-logged',
      nested: { authorization: 'Bearer credential' },
    }),
    {
      action: 'drive_connected  forged',
      refreshToken: '[REDACTED]',
      nested: { authorization: '[REDACTED]' },
    },
  )
})

test('protected routes authorize on the server and receipt URLs are short-lived', async () => {
  const [bookingRoute, receiptRoute, workflowRoute] = await Promise.all([
    readFile('app/api/bookings/[id]/route.ts', 'utf8'),
    readFile('app/api/receipts/[id]/route.ts', 'utf8'),
    readFile('app/api/editor-workflow/[...path]/route.ts', 'utf8'),
  ])
  assert.match(bookingRoute, /requireStaffAuth\(request\)/)
  assert.match(receiptRoute, /requireStaffAuth\(\)/)
  assert.match(receiptRoute, /createSignedUrl\(storagePath, 120/)
  assert.doesNotMatch(receiptRoute, /getPublicUrl/)
  assert.match(workflowRoute, /requireWorkflowAuth\('view', request\)/)
})

test('portal file and selection lookups are constrained to the portal booking', async () => {
  const source = await readFile('lib/editor-workflow.ts', 'utf8')
  assert.match(source, /\.eq\('id', fileId\)\s*\.eq\('booking_id', portal\.booking_id\)/)
  assert.match(source, /\.from\('gallery_files'\)[\s\S]*?\.eq\('booking_id', bookingId\)[\s\S]*?\.in\('id', unique\)/)
  assert.match(source, /One or more selected photos do not belong to this portal/)
})

test('edited Drive uploads are destination, size, and SHA-256 verified server-side', async () => {
  const source = await readFile('lib/editor-workflow.ts', 'utf8')
  assert.match(source, /driveFile\.parents\?\.includes\(hierarchy\.edited\.id\)/)
  assert.match(source, /driveBytes !== expectedBytes/)
  assert.match(source, /hashDriveFileSha256\(driveFile\.id/)
  assert.match(source, /verified\.checksum !== uploadFile\.checksum/)
  assert.match(source, /UPLOAD_CHECKSUM_FAILED/)
})

test('private API cache and CORS policy cannot be weakened accidentally', async () => {
  const proxy = await readFile('proxy.ts', 'utf8')
  assert.match(proxy, /pathname\.startsWith\('\/api\/'\)/)
  assert.match(proxy, /private, no-store/)
  assert.doesNotMatch(proxy, /Access-Control-Allow-Origin/)
})

test('database hardening uses service-only atomic limits and removes public receipt policies', async () => {
  const migration = await readFile(
    'supabase/migrations/20260906151436_production_security_hardening.sql',
    'utf8',
  )
  assert.match(migration, /security definer\s+set search_path = public, pg_temp/i)
  assert.match(migration, /revoke all on function public\.consume_api_rate_limit[\s\S]*from public, anon, authenticated/i)
  assert.match(migration, /drop policy if exists "Public read receipts"/)
  assert.match(migration, /drop policy if exists "Anon upload receipts"/)
})
