import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

test('three 50 MiB originals transfer to R2 with bounded concurrency and serialized session creation', async t => {
  const bytes = 50 * 1024 * 1024
  const partSize = 5 * 1024 * 1024
  const original = Buffer.alloc(bytes, 0x73)
  original.writeUInt32BE(24, 0)
  original.write('ftypcrx ', 4, 'ascii')
  const checksum = createHash('sha256').update(original).digest('hex')
  const photos = Array.from({ length: 3 }, (_, index) => new File([original], `CAMERA-${index}.CR3`))
  const priorFetch = globalThis.fetch
  const priorXhr = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  t.after(() => {
    globalThis.fetch = priorFetch
    if (priorXhr) Object.defineProperty(globalThis, 'XMLHttpRequest', priorXhr)
    else Reflect.deleteProperty(globalThis, 'XMLHttpRequest')
  })

  const received = new Map<string, Buffer>()
  let activePuts = 0
  let peakPuts = 0
  let activeSetup = 0
  let peakSetup = 0
  let puts = 0
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  globalThis.fetch = async (url, init) => {
    const requestBody = init?.body
    assert.equal(typeof requestBody, 'string')
    assert.ok(Buffer.byteLength(String(requestBody)) < 8_000)
    const body = JSON.parse(String(requestBody))
    if (String(url).endsWith('/upload-session')) {
      activeSetup++
      peakSetup = Math.max(peakSetup, activeSetup)
      await delay(2)
      activeSetup--
      assert.equal(body.fileSize, bytes)
      assert.equal(body.checksum, checksum)
      received.set(body.fileName, Buffer.alloc(bytes))
      return Response.json({
        grant: body.fileName, expiresAt: Date.now() + 3_600_000, mimeType: 'application/octet-stream',
        storageKey: `workspaces/ws/shoots/2026/09/14/FM-SYNTHETIC/raw/${body.fileName}`,
        upload: {
          mode: 'multipart', uploadId: body.fileName, partSize,
          parts: Array.from({ length: 10 }, (_, index) => ({
            partNumber: index + 1,
            url: `https://account.r2.cloudflarestorage.com/raw?file=${encodeURIComponent(body.fileName)}&part=${index + 1}&X-Amz-Signature=synthetic`,
          })),
        },
      })
    }
    const name = String(body.uploadId)
    const file = received.get(name)
    assert.ok(file)
    assert.equal(createHash('sha256').update(file).digest('hex'), checksum)
    assert.equal(body.parts.length, 10)
    return Response.json({ success: true })
  }

  class FakeR2Request extends EventTarget {
    upload = new EventTarget()
    withCredentials = true
    timeout = 0
    status = 0
    file = ''
    part = 0
    open(method: string, value: string) {
      assert.equal(method, 'PUT')
      const url = new URL(value)
      this.file = url.searchParams.get('file') || ''
      this.part = Number(url.searchParams.get('part'))
    }
    setRequestHeader() {}
    getResponseHeader(name: string) { return name.toLowerCase() === 'etag' ? `"${this.file}-${this.part}"` : null }
    send(blob: Blob) {
      void (async () => {
        activePuts++
        peakPuts = Math.max(peakPuts, activePuts)
        puts++
        try {
          assert.equal(this.withCredentials, false)
          const data = Buffer.from(await blob.arrayBuffer())
          received.get(this.file)?.set(data, (this.part - 1) * partSize)
          await delay(10)
          this.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded: data.length }))
          this.status = 200
        } finally {
          activePuts--
        }
        this.dispatchEvent(new Event('load'))
      })().catch(() => this.dispatchEvent(new Event('error')))
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: FakeR2Request })

  const shared = loadTs<typeof import('../lib/raw-upload-shared.ts')>('lib/raw-upload-shared.ts', {})
  const browserUpload = loadTs<typeof import('../lib/storage/browser-upload.ts')>('lib/storage/browser-upload.ts', { '@/lib/raw-upload-shared': shared })
  const client = loadTs<typeof import('../lib/raw-upload-client.ts')>('lib/raw-upload-client.ts', {
    '@/lib/raw-upload-shared': shared,
    '@/lib/storage/browser-upload': browserUpload,
  })
  const queue = loadTs<typeof import('../lib/raw-upload-queue.ts')>('lib/raw-upload-queue.ts', { '@/lib/raw-upload-client': client })
  const result = await queue.uploadRawQueue('FM-SYNTHETIC', photos, () => {})

  assert.equal(result.status, 'complete')
  assert.equal(result.uploaded, 3)
  assert.equal(result.bytesProcessed, 3 * bytes)
  assert.equal(peakPuts, 3)
  assert.equal(peakSetup, 1)
  assert.equal(puts, 30)
  assert.equal(createHash('sha256').update(original).digest('hex'), checksum)
  t.diagnostic(`3 x ${bytes} bytes verified in R2; peak ${peakPuts} concurrent PUTs; session creation remained serialized.`)
})
