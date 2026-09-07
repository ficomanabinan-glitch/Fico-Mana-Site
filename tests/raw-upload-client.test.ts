import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const shared = loadTs<typeof import('../lib/raw-upload-shared.ts')>('lib/raw-upload-shared.ts', {})
const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic'

test('Drive upload URLs are restricted and resumable positions are validated', () => {
  const client = loadTs<typeof import('../lib/raw-upload-client.ts')>('lib/raw-upload-client.ts', { '@/lib/raw-upload-shared': shared })
  assert.equal(shared.validateRawSessionUrl(url), url)
  for (const value of ['http://www.googleapis.com/upload/drive/v3/files?upload_id=x', 'https://www.googleapis.com.evil.test/upload/drive/v3/files?upload_id=x',
    'https://www.googleapis.com/drive/v3/files?upload_id=x', 'https://www.googleapis.com/upload/drive/v3/files',
    'https://secret@www.googleapis.com/upload/drive/v3/files?upload_id=x']) assert.throws(() => shared.validateRawSessionUrl(value))
  assert.equal(client.rawResumeOffset(null, 100), 0)
  assert.equal(client.rawResumeOffset('bytes=0-42', 100), 43)
  for (const value of ['bytes=1-42', 'bytes=0-101', 'bytes=0-no']) assert.throws(() => client.rawResumeOffset(value, 100))
})

test('large originals use direct Drive chunks, resume acknowledged bytes, and never pass photos through Vercel', async t => {
  const fetchBefore = globalThis.fetch
  const xhrBefore = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  t.after(() => { globalThis.fetch = fetchBefore; if (xhrBefore) Object.defineProperty(globalThis, 'XMLHttpRequest', xhrBefore); else Reflect.deleteProperty(globalThis, 'XMLHttpRequest') })
  let completeFails = false
  let expired = false
  let partialOnce = true
  const appCalls: Array<{ url: string; body: Record<string, unknown> }> = []
  const puts: Array<{ range: string; size: number }> = []
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.credentials, 'include')
    assert.equal(typeof init?.body, 'string')
    assert.ok(String(init.body).length < 8000)
    const body = JSON.parse(String(init.body))
    appCalls.push({ url: String(input), body })
    if (String(input).endsWith('/upload-session')) return Response.json({ grant: 'synthetic-grant', expiresAt: Date.now() + 3600000, mimeType: 'image/jpeg', uploadUrl: url })
    assert.ok(String(input).endsWith('/complete-file'))
    assert.equal(body.driveFileId, 'confirmed-photo')
    return completeFails ? Response.json({ error: 'Try: retry the portal update.' }, { status: 503 }) : Response.json({ success: true })
  }
  class FakeXHR extends EventTarget {
    upload = new EventTarget(); withCredentials = true; timeout = 0; status = 0; responseText = ''; range: string | null = null
    headers: Record<string, string> = {}
    open(method: string, target: string) { assert.equal(method, 'PUT'); assert.equal(target, url) }
    setRequestHeader(name: string, value: string) { this.headers[name] = value }
    getResponseHeader() { return this.range }
    send(blob: Blob | null) {
      assert.equal(this.withCredentials, false)
      assert.equal(this.timeout, 120000)
      assert.equal(this.headers.Authorization, undefined)
      const range = this.headers['Content-Range']
      puts.push({ range, size: blob?.size || 0 })
      if (expired) { this.status = 404 }
      else {
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)!
        assert.ok(match)
        const start = Number(match[1]), end = Number(match[2]), total = Number(match[3])
        assert.equal(blob?.size, end - start + 1)
        this.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded: blob?.size || 0 }))
        if (partialOnce) { partialOnce = false; this.status = 308; this.range = 'bytes=0-262143' }
        else if (end + 1 === total) { this.status = 200; this.responseText = JSON.stringify({ id: 'confirmed-photo' }) }
        else { this.status = 308; this.range = `bytes=0-${end}` }
      }
      queueMicrotask(() => this.dispatchEvent(new Event('load')))
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: FakeXHR })
  const client = loadTs<typeof import('../lib/raw-upload-client.ts')>('lib/raw-upload-client.ts', { '@/lib/raw-upload-shared': shared })
  const photo = new File([new Uint8Array(10 * 1024 * 1024)], 'BNI00371.JPG', { type: 'image/jpeg' })
  const progress: number[] = []
  await client.uploadRawDirect('FM-SYNTHETIC', photo, (loaded, total) => { assert.equal(total, photo.size); progress.push(loaded) })
  assert.equal(appCalls.length, 2)
  assert.match(appCalls[0].url, /raw\/FM-SYNTHETIC\/upload-session$/)
  assert.equal(appCalls[0].body.fileSize, photo.size)
  assert.match(String(appCalls[0].body.checksum), /^[a-f0-9]{64}$/)
  assert.equal(puts[1].range, `bytes 262144-4456447/${photo.size}`, 'Resume from acknowledged bytes, not the attempted chunk size')
  assert.equal(progress.at(-1), photo.size)

  completeFails = true
  const retryPhoto = new File(['synthetic'], 'retry.JPG')
  await assert.rejects(client.uploadRawDirect('FM-SYNTHETIC', retryPhoto, () => {}), /Try:/)
  const priorPutCount = puts.length
  const priorStartCount = appCalls.filter(call => call.url.endsWith('upload-session')).length
  completeFails = false
  await client.uploadRawDirect('FM-SYNTHETIC', retryPhoto, () => {})
  assert.equal(puts.length, priorPutCount, 'Confirmation retry does not upload the photo a second time')
  assert.equal(appCalls.filter(call => call.url.endsWith('upload-session')).length, priorStartCount)

  expired = true
  const expiredPhoto = new File(['synthetic'], 'expired.JPG')
  await assert.rejects(client.uploadRawDirect('FM-SYNTHETIC', expiredPhoto, () => {}), /session expired/)
  expired = false
  await client.uploadRawDirect('FM-SYNTHETIC', expiredPhoto, () => {})
  assert.equal(appCalls.filter(call => call.body.fileName === 'expired.JPG').length, 2)
  await assert.rejects(client.uploadRawDirect('FM-SYNTHETIC', new File([], 'empty.JPG'), () => {}), /100 MB/)
})
