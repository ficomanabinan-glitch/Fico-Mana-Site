import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

test('enhanced print copies are individually keyed, repeat-safe, and replace only their own generated output', async t => {
  const priorFetch = globalThis.fetch
  const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']
  const previousEnv = names.map(name => process.env[name])
  names.forEach(name => { process.env[name] = 'synthetic-print-test' })
  t.after(() => {
    globalThis.fetch = priorFetch
    names.forEach((name, index) => { if (previousEnv[index] === undefined) delete process.env[name]; else process.env[name] = previousEnv[index] })
  })
  type File = import('../lib/google-drive.ts').DriveFile
  const source: File = { id: 'enhanced', name: '0920.JPG', mimeType: 'image/jpeg', size: '123', md5Checksum: 'verified-md5', parents: ['edited'] }
  const files: File[] = [{ id: 'manual', name: 'TOGA PICTURE - 0920.JPG', mimeType: 'image/jpeg' }]
  const trashed: string[] = []
  let created = 0
  globalThis.fetch = async (url, init) => {
    const value = String(url)
    if (value === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'synthetic-token', expires_in: 3600 })
    if (value.startsWith('https://www.googleapis.com/drive/v3/files?')) return Response.json({ files: files.filter(file => !trashed.includes(file.id)) })
    const body = JSON.parse(String(init?.body || '{}'))
    if (value.includes('/enhanced/copy?')) {
      created++
      const file = { ...source, id: `copy-${created}`, name: body.name, parents: body.parents, appProperties: body.appProperties }
      files.push(file)
      return Response.json(file)
    }
    if (init?.method === 'PATCH' && body.trashed === true) {
      const id = new URL(value).pathname.split('/').at(-1)!
      assert.notEqual(id, source.id)
      assert.notEqual(id, 'manual')
      trashed.push(id)
      return Response.json({ id, trashed: true })
    }
    throw new Error(`Unexpected external request: ${value}`)
  }
  const drive = loadTs<typeof import('../lib/google-drive.ts')>('lib/google-drive.ts', {
    '@/lib/supabase/admin': { getSupabaseAdmin: () => null }, '@/lib/google-oauth': {},
    '@/lib/security/outbound-url': {}, '@/lib/package-workflow-server': {},
  })
  const options = { source, bookingId: 'booking', selectionId: 'selection', destinationFolderId: 'prints', printKey: 'TOGA_PICTURE_4R:1',
    checksum: 'a'.repeat(64), fileName: 'TOGA PICTURE - 0920.JPG' }
  const first = await drive.copyEnhancedPrint(options)
  assert.equal((await drive.copyEnhancedPrint(options)).id, first.id)
  assert.equal(created, 1)
  assert.deepEqual(trashed, [])
  for (let copy = 1; copy <= 4; copy++) {
    await drive.copyEnhancedPrint({ ...options, printKey: `WALLET_SIZE:${copy}`, fileName: `WALLET SIZE ${copy} - 0920.JPG` })
  }
  assert.equal(created, 5, 'The same enhanced image can supply distinct print slots')
  source.md5Checksum = 'revised-md5'
  const revised = await drive.copyEnhancedPrint({ ...options, checksum: 'b'.repeat(64) })
  assert.notEqual(revised.id, first.id)
  assert.deepEqual(trashed, [first.id], 'Only the previous system-generated version is moved to Trash')
  assert.equal(created, 6)
  await assert.rejects(drive.copyEnhancedPrint({ ...options, checksum: 'c'.repeat(64), source: { ...source, md5Checksum: 'unexpected-change' } }), /could not be verified/)
  assert.deepEqual(trashed, [first.id], 'A mismatched new copy never removes the prior verified version')
})
