import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const partSize = 5 * 1024 * 1024
const signedPartUrl = (partNumber: number) =>
  `https://account.r2.cloudflarestorage.com/ficomana/raw?partNumber=${partNumber}&X-Amz-Signature=synthetic-${partNumber}`

test('50 MiB camera RAW uploads exact bytes to R2 and retries confirmation without uploading again', async t => {
  const byteCount = 50 * 1024 * 1024
  const original = Buffer.alloc(byteCount, 0x71)
  original.writeUInt32BE(24, 0)
  original.write('ftypcrx ', 4, 'ascii')
  const originalHash = createHash('sha256').update(original).digest('hex')
  const stored = Buffer.alloc(byteCount)
  const photo = new File([original], 'PRO_CAMERA_50MB.CR3', { type: 'application/octet-stream' })
  const fetchBefore = globalThis.fetch
  const xhrBefore = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  t.after(() => {
    globalThis.fetch = fetchBefore
    if (xhrBefore) Object.defineProperty(globalThis, 'XMLHttpRequest', xhrBefore)
    else Reflect.deleteProperty(globalThis, 'XMLHttpRequest')
  })

  let sessions = 0
  let confirmations = 0
  let writes = 0
  let disconnectOnce = true
  const appRequestSizes: number[] = []
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.credentials, 'include')
    assert.equal(typeof init?.body, 'string')
    appRequestSizes.push(Buffer.byteLength(String(init.body)))
    const data = JSON.parse(String(init.body))
    if (String(input).endsWith('/upload-session')) {
      sessions++
      assert.equal(data.fileSize, byteCount)
      assert.equal(data.checksum, originalHash)
      return Response.json({
        grant: 'synthetic-grant', expiresAt: Date.now() + 3_600_000,
        mimeType: 'application/octet-stream', storageKey: 'workspaces/ws/shoots/2026/09/14/FM-SYNTHETIC/raw/photo.cr3',
        upload: {
          mode: 'multipart', uploadId: 'multipart-50', partSize,
          parts: Array.from({ length: 10 }, (_, index) => ({ partNumber: index + 1, url: signedPartUrl(index + 1) })),
        },
      })
    }
    assert.ok(String(input).endsWith('/complete-file'))
    assert.equal(data.grant, 'synthetic-grant')
    assert.equal(data.storageKey, 'workspaces/ws/shoots/2026/09/14/FM-SYNTHETIC/raw/photo.cr3')
    if (confirmations === 0) {
      assert.equal(data.uploadId, 'multipart-50')
      assert.equal(data.parts.length, 10)
    } else {
      assert.equal(data.uploadId, undefined)
      assert.equal(data.parts, undefined)
    }
    assert.equal(createHash('sha256').update(stored).digest('hex'), originalHash)
    confirmations++
    return confirmations === 1
      ? Response.json({ error: 'Try: retry the portal confirmation.' }, { status: 503 })
      : Response.json({ success: true })
  }

  class FakeR2Request extends EventTarget {
    upload = new EventTarget()
    withCredentials = true
    timeout = 0
    status = 0
    partNumber = 0
    open(method: string, target: string) {
      assert.equal(method, 'PUT')
      const url = new URL(target)
      assert.equal(url.hostname, 'account.r2.cloudflarestorage.com')
      assert.ok(url.searchParams.get('X-Amz-Signature'))
      this.partNumber = Number(url.searchParams.get('partNumber'))
    }
    setRequestHeader() {}
    getResponseHeader(name: string) { return name.toLowerCase() === 'etag' ? `"part-${this.partNumber}"` : null }
    send(blob: Blob) {
      void (async () => {
        assert.equal(this.withCredentials, false)
        writes++
        if (this.partNumber === 2 && disconnectOnce) {
          disconnectOnce = false
          this.dispatchEvent(new Event('error'))
          return
        }
        const data = Buffer.from(await blob.arrayBuffer())
        assert.equal(data.length, partSize)
        stored.set(data, (this.partNumber - 1) * partSize)
        this.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded: data.length }))
        this.status = 200
        this.dispatchEvent(new Event('load'))
      })().catch(() => this.dispatchEvent(new Event('error')))
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: FakeR2Request })

  const shared = loadTs<typeof import('../lib/raw-upload-shared.ts')>('lib/raw-upload-shared.ts', {})
  const browserUpload = loadTs<typeof import('../lib/storage/browser-upload.ts')>('lib/storage/browser-upload.ts', {
    '@/lib/raw-upload-shared': shared,
  })
  const client = loadTs<typeof import('../lib/raw-upload-client.ts')>('lib/raw-upload-client.ts', {
    '@/lib/raw-upload-shared': shared,
    '@/lib/storage/browser-upload': browserUpload,
  })
  const progress: number[] = []
  await assert.rejects(client.uploadRawDirect('FM-SYNTHETIC', photo, (loaded, total) => {
    assert.equal(total, byteCount)
    assert.ok(loaded >= 0 && loaded <= total)
    progress.push(loaded)
  }), /portal confirmation/)
  const writesAfterUpload = writes
  await client.uploadRawDirect('FM-SYNTHETIC', photo, () => {})

  assert.equal(writes, writesAfterUpload, 'Confirmation retry does not upload the original a second time')
  assert.equal(writes, 11, 'Ten R2 parts plus one transient transport retry')
  assert.equal(sessions, 1)
  assert.equal(confirmations, 2)
  assert.equal(progress.at(-1), byteCount)
  assert.ok(appRequestSizes.every(size => size < 8_000), 'App routes receive metadata only')
  assert.equal(createHash('sha256').update(original).digest('hex'), originalHash, 'Original bytes remain unchanged')
  t.diagnostic(`Verified ${byteCount} bytes across 10 private R2 parts; confirmation retry transferred zero photo bytes.`)
})
