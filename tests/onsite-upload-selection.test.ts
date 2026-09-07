import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const onsite = loadTs<typeof import('../components/onsite-upload.tsx')>('components/onsite-upload.tsx', {
  '@/components/admin-toast-provider': {}, '@/components/editor-page-skeleton': {}, '@/lib/admin-ui': {},
})

test('onsite selection snapshots the live file list before clearing the input', () => {
  const originals = [new File(['synthetic-1'], 'first.jpg', { type: 'image/jpeg' }), new File(['synthetic-2'], 'second.cr3')]
  let live = [...originals]
  const fileList = {
    get length() { return live.length },
    item(index: number) { return live[index] },
    [Symbol.iterator]() { return live[Symbol.iterator]() },
  } as unknown as FileList
  const input = { get value() { return live.length ? 'selected' : '' }, set value(_value: string) { live = [] } }
  const selected = onsite.snapshotOnsiteFiles(fileList, input)
  assert.equal(fileList.length, 0, 'Browser list is cleared by resetting the picker')
  assert.deepEqual(selected, originals, 'Detached files remain available to the upload loop')
  assert.equal(input.value, '')
  live = [...originals]
  assert.deepEqual(onsite.snapshotOnsiteFiles(fileList, input), originals, 'Selecting the same files again works')
  assert.deepEqual(onsite.snapshotOnsiteFiles(null, input), [], 'Cancelling does not start an upload')
})

test('onsite file upload targets the selected booking and reports progress and actionable failures', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest')
  t.after(() => { if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', original); else Reflect.deleteProperty(globalThis, 'XMLHttpRequest') })
  const current = {} as { request: FakeRequest }
  class FakeRequest extends EventTarget {
    upload = new EventTarget()
    withCredentials = false
    timeout = 0
    status = 200
    responseText = '{"ok":true}'
    method = ''
    url = ''
    sent: FormData | null = null
    constructor() { super(); current.request = this }
    open(method: string, url: string) { this.method = method; this.url = url }
    send(body: FormData) { this.sent = body }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, value: FakeRequest })
  const file = new File(['synthetic'], 'photo.jpg', { type: 'image/jpeg' })
  let progress: number[] = []
  const pending = onsite.uploadRawFile('FM-SYNTHETIC', file, (loaded, total) => { progress = [loaded, total] })
  assert.equal(current.request.method, 'POST')
  assert.equal(current.request.url, '/api/editor-workflow/raw/FM-SYNTHETIC')
  assert.equal(current.request.withCredentials, true)
  assert.equal(current.request.timeout, 120_000)
  assert.equal((current.request.sent?.get('file') as File).name, 'photo.jpg')
  const event = Object.assign(new Event('progress'), { lengthComputable: true, loaded: 5, total: 10 })
  current.request.upload.dispatchEvent(event)
  assert.deepEqual(progress, [5, 10])
  current.request.dispatchEvent(new Event('load'))
  assert.deepEqual(await pending, { ok: true })

  for (const [status, message, expected] of [
    [413, 'not-json', /too large.*Try:.*RAW folder.*Sync Drive/],
    [403, '{"error":"Session expired."}', /Session expired.*Try:/],
    [500, '{"error":"Drive unavailable. Try: reconnect Drive."}', /Try: reconnect Drive/],
  ] as const) {
    const result = onsite.uploadRawFile('FM-SYNTHETIC', file, () => {})
    current.request.status = status; current.request.responseText = message
    current.request.dispatchEvent(new Event('load'))
    await assert.rejects(result, expected)
  }
  for (const type of ['error', 'abort', 'timeout']) {
    const result = onsite.uploadRawFile('FM-SYNTHETIC', file, () => {})
    current.request.dispatchEvent(new Event(type))
    await assert.rejects(result, /Try:/)
  }
})
