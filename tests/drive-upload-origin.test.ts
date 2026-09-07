import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { validateDriveUploadOrigin } from '../lib/security/origin.ts'
import { loadTs } from './helpers/load-ts.ts'

test('Drive session origin is exact, allowlisted, and supplied by the authenticated route, not JSON', async t => {
  const before = globalThis.fetch
  const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
  const previous = names.map(name => process.env[name])
  names.forEach(name => { process.env[name] = 'synthetic-cors-test' })
  t.after(() => { globalThis.fetch = before; names.forEach((name, i) => {
    if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]
  }) })
  const seen: string[] = []
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'synthetic', expires_in: 3600 })
    const headers = new Headers(init?.headers)
    seen.push(headers.get('Origin') || '')
    assert.equal(headers.get('Authorization'), 'Bearer synthetic')
    return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic' } })
  }
  const drive = loadTs<typeof import('../lib/google-drive.ts')>('lib/google-drive.ts', {
    '@/lib/supabase/admin': { getSupabaseAdmin: () => null }, '@/lib/google-oauth': {},
    '@/lib/security/outbound-url': {}, '@/lib/package-workflow-server': {},
    '@/lib/security/origin': { validateDriveUploadOrigin },
  })
  const input = { destinationFolderId: 'incoming', bookingId: 'FM-SYNTHETIC', relativePath: 'RAW/test.JPG', fileName: 'test.JPG',
    mimeType: 'image/jpeg', fileSize: 52428800, checksum: 'a'.repeat(64), purpose: 'raw' as const }
  for (const origin of ['https://admin.ficomana.com', 'https://editor.ficomana.com', 'https://newadmin.ficomana.com']) {
    await drive.createDriveResumableUpload({ ...input, browserOrigin: origin })
    assert.equal(seen.at(-1), origin)
  }
  const count = seen.length
  for (const origin of ['', 'null', 'https://attacker.example', 'https://admin.ficomana.com.evil.test',
    'https://admin.ficomana.com/path', 'https://user@admin.ficomana.com', 'https://admin.ficomana.com\r\nX-Evil: yes']) {
    await assert.rejects(drive.createDriveResumableUpload({ ...input, browserOrigin: origin }), /website could not be verified/)
  }
  assert.equal(seen.length, count, 'Invalid origins fail before any external request')
  const route = readFileSync('app/api/editor-workflow/[...path]/route.ts', 'utf8')
  assert.match(route, /startRawUpload\(context, parsed.data, request.headers.get\('origin'\)/)
  assert.match(route, /browserOrigin: request.headers.get\('origin'\)/)
  assert.doesNotMatch(route, /browserOrigin: body\./)
})
