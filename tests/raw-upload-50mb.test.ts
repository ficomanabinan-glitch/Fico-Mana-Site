import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { loadTs } from './helpers/load-ts.ts'

test('50 MiB camera RAW: exact-byte upload survives a lost connection and a failed portal confirmation', async t => {
  const byteCount = 50 * 1024 * 1024
  // Synthetic transport fixture with a CR3 signature, not a decodable real camera photograph.
  const original = Buffer.alloc(byteCount, 0x71)
  original.writeUInt32BE(24, 0); original.write('ftypcrx ', 4, 'ascii')
  const originalHash = createHash('sha256').update(original).digest('hex')
  const stored = Buffer.alloc(byteCount)
  const photo = new File([original], 'PRO_CAMERA_50MB.CR3', { type: 'application/octet-stream' })
  const fetchBefore = globalThis.fetch
  const xhrBefore = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  t.after(() => { globalThis.fetch = fetchBefore; if (xhrBefore) Object.defineProperty(globalThis, 'XMLHttpRequest', xhrBefore); else Reflect.deleteProperty(globalThis, 'XMLHttpRequest') })
  const url = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic50'
  let accepted = 0, writes = 0, queries = 0, sessions = 0, confirmations = 0
  let partial = true, disconnect = true
  const errors: unknown[] = []
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
      return Response.json({ uploadUrl: url, grant: 'synthetic50-grant', expiresAt: Date.now() + 3600000, mimeType: 'application/octet-stream' })
    }
    assert.ok(String(input).endsWith('/complete-file'))
    assert.equal(data.driveFileId, 'raw50-verified')
    assert.equal(accepted, byteCount)
    assert.equal(createHash('sha256').update(stored).digest('hex'), originalHash)
    confirmations++
    return confirmations === 1 ? Response.json({ error: 'Try: retry the portal confirmation.' }, { status: 503 }) : Response.json({ success: true })
  }
  class FakeDriveRequest extends EventTarget {
    upload = new EventTarget(); withCredentials = true; timeout = 0; responseText = ''; status = 0
    headers: Record<string, string> = {}
    open(method: string, target: string) { assert.equal(method, 'PUT'); assert.equal(target, url) }
    setRequestHeader(name: string, value: string) { this.headers[name] = value }
    getResponseHeader() { return accepted ? `bytes=0-${accepted - 1}` : null }
    send(blob: Blob | null) {
      void (async () => {
        assert.equal(this.withCredentials, false)
        assert.equal(this.headers.Authorization, undefined)
        assert.equal(this.headers['Content-Type'], 'application/octet-stream')
        const range = this.headers['Content-Range']
        if (range === `bytes */${byteCount}`) {
          queries++; assert.equal(blob, null); this.status = 308; this.dispatchEvent(new Event('load')); return
        }
        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range)!
        assert.ok(match)
        assert.equal(Number(match[1]), accepted, 'Every resumed chunk starts after the last confirmed byte')
        assert.equal(Number(match[3]), byteCount)
        const chunk = new Uint8Array(await blob!.arrayBuffer())
        assert.equal(chunk.length, Number(match[2]) - Number(match[1]) + 1)
        assert.ok(chunk.length <= 4 * 1024 * 1024)
        writes++
        const length = partial ? 256 * 1024 : disconnect ? 2 * 1024 * 1024 : chunk.length
        stored.set(chunk.subarray(0, length), accepted)
        accepted += length
        this.upload.dispatchEvent(Object.assign(new Event('progress'), { loaded: chunk.length }))
        if (partial) partial = false
        else if (disconnect) { disconnect = false; this.dispatchEvent(new Event('error')); return }
        this.status = accepted === byteCount ? 200 : 308
        if (this.status === 200) this.responseText = JSON.stringify({ id: 'raw50-verified' })
        this.dispatchEvent(new Event('load'))
      })().catch(error => { errors.push(error); this.dispatchEvent(new Event('error')) })
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: FakeDriveRequest })
  const shared = loadTs<typeof import('../lib/raw-upload-shared.ts')>('lib/raw-upload-shared.ts', {})
  const client = loadTs<typeof import('../lib/raw-upload-client.ts')>('lib/raw-upload-client.ts', { '@/lib/raw-upload-shared': shared })
  const progress: number[] = []
  await assert.rejects(client.uploadRawDirect('FM-SYNTHETIC-50MB', photo, (loaded, total) => {
    assert.equal(total, byteCount); assert.ok(loaded >= 0 && loaded <= total); progress.push(loaded)
  }), /portal confirmation/)
  const previousWrites = writes
  await client.uploadRawDirect('FM-SYNTHETIC-50MB', photo, () => {})
  assert.equal(writes, previousWrites, 'Retry did not upload the original a second time')
  assert.equal(sessions, 1); assert.equal(queries, 1); assert.equal(confirmations, 2)
  assert.equal(progress.at(-1), byteCount)
  assert.deepEqual(errors, [])
  assert.ok(appRequestSizes.every(size => size < 8000))
  assert.equal(createHash('sha256').update(original).digest('hex'), originalHash, 'Original bytes are unchanged')
  t.diagnostic(`Verified ${byteCount} bytes; ${writes} Drive data requests, ${queries} resume query, maximum app request ${Math.max(...appRequestSizes)} bytes; SHA-256 unchanged.`)
})
