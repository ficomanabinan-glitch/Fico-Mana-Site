import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { loadTs } from './helpers/load-ts.ts'

test('three 50 MiB originals transfer concurrently with serialized client setup and exact-byte verification', async t => {
  const bytes = 50 * 1024 * 1024
  const original = Buffer.alloc(bytes, 0x73)
  original.writeUInt32BE(24, 0); original.write('ftypcrx ', 4, 'ascii')
  const checksum = createHash('sha256').update(original).digest('hex')
  const photos = Array.from({ length: 3 }, (_, i) => new File([original], `CAMERA-${i}.CR3`))
  const priorFetch = globalThis.fetch
  const priorXhr = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  t.after(() => {
    globalThis.fetch = priorFetch
    if (priorXhr) Object.defineProperty(globalThis, 'XMLHttpRequest', priorXhr); else Reflect.deleteProperty(globalThis, 'XMLHttpRequest')
  })
  const received = new Map<string, { offset: number; hash: ReturnType<typeof createHash> }>()
  let activePuts = 0, peakPuts = 0, activeSetup = 0, peakSetup = 0, puts = 0
  const errors: unknown[] = []
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  globalThis.fetch = async (url, init) => {
    assert.equal(typeof init?.body, 'string'); assert.ok(Buffer.byteLength(String(init?.body)) < 8000)
    const body = JSON.parse(String(init?.body))
    if (String(url).endsWith('/upload-session')) {
      activeSetup++; peakSetup = Math.max(peakSetup, activeSetup)
      await delay(2); activeSetup--
      assert.equal(body.fileSize, bytes); assert.equal(body.checksum, checksum)
      received.set(body.fileName, { offset: 0, hash: createHash('sha256') })
      return Response.json({ grant: body.fileName, expiresAt: Date.now() + 3600000, mimeType: 'application/octet-stream',
        uploadUrl: `https://www.googleapis.com/upload/drive/v3/files?upload_id=${body.fileName}` })
    }
    assert.equal(body.grant, body.driveFileId)
    const file = received.get(body.driveFileId)!
    assert.equal(file.offset, bytes); assert.equal(file.hash.digest('hex'), checksum)
    return Response.json({ success: true })
  }
  class FakeDrive extends EventTarget {
    upload = new EventTarget(); withCredentials = true; timeout = 0; status = 0; responseText = ''; key = ''; range = ''
    headers: Record<string, string> = {}
    open(method: string, url: string) { assert.equal(method, 'PUT'); this.key = new URL(url).searchParams.get('upload_id')! }
    setRequestHeader(key: string, value: string) { this.headers[key] = value }
    getResponseHeader(name: string) { return name === 'Range' ? this.range : null }
    send(blob: Blob) {
      void (async () => {
        activePuts++; peakPuts = Math.max(peakPuts, activePuts); puts++
        try {
          assert.equal(this.withCredentials, false); assert.equal(this.headers.Authorization, undefined)
          const file = received.get(this.key)!
          const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(this.headers['Content-Range'])!
          assert.ok(range); assert.equal(Number(range[1]), file.offset); assert.equal(Number(range[3]), bytes)
          const data = Buffer.from(await blob.arrayBuffer())
          assert.equal(data.length, Number(range[2]) - Number(range[1]) + 1)
          file.hash.update(data); file.offset += data.length; await delay(10)
          this.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded: data.length }))
          this.status = file.offset === bytes ? 200 : 308; this.range = `bytes=0-${file.offset - 1}`
          if (this.status === 200) this.responseText = JSON.stringify({ id: this.key })
        } finally { activePuts-- }
        this.dispatchEvent(new Event('load'))
      })().catch(error => { errors.push(error); this.dispatchEvent(new Event('error')) })
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: FakeDrive })
  const shared = loadTs<typeof import('../lib/raw-upload-shared.ts')>('lib/raw-upload-shared.ts', {})
  const client = loadTs<typeof import('../lib/raw-upload-client.ts')>('lib/raw-upload-client.ts', { '@/lib/raw-upload-shared': shared })
  const queue = loadTs<typeof import('../lib/raw-upload-queue.ts')>('lib/raw-upload-queue.ts', { '@/lib/raw-upload-client': client })
  const result = await queue.uploadRawQueue('FM-SYNTHETIC', photos, () => {})
  assert.deepEqual(errors, []); assert.equal(result.status, 'complete'); assert.equal(result.uploaded, 3)
  assert.equal(result.bytesProcessed, 3 * bytes); assert.equal(peakPuts, 3); assert.equal(peakSetup, 1)
  assert.equal(puts, 39); assert.equal(createHash('sha256').update(original).digest('hex'), checksum)
  t.diagnostic(`3 x ${bytes} bytes verified; peak ${peakPuts} concurrent PUTs; ${puts} chunks; setup concurrency ${peakSetup}; no photo bytes sent to app routes.`)
})
