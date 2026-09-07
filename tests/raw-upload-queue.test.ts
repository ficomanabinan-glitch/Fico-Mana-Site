import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './helpers/load-ts.ts'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
test('three upload workers share a global limit, isolate clients, settle failures and retry only failed files', async () => {
  const queue = loadTs<typeof import('../lib/raw-upload-queue.ts')>('lib/raw-upload-queue.ts', { '@/lib/raw-upload-client': {} })
  const files = Array.from({ length: 8 }, (_, i) => new File([new Uint8Array(100)], `photo-${i}.JPG`))
  const calls: Array<{ booking: string; file: File }> = []
  let active = 0, maximum = 0, fail = true
  const transfer = async (booking: string, file: File, progress: (loaded: number, total: number) => void) => {
    active++; maximum = Math.max(maximum, active); calls.push({ booking, file })
    try {
      progress(25, file.size); await delay(5)
      if (file === files[1] && fail) throw new Error('Synthetic blocked response. Try: retry this photo.')
      progress(file.size, file.size); await delay(5)
      return { success: true }
    } finally { active-- }
  }
  const states: import('../lib/raw-upload-queue.ts').RawQueueProgress[] = []
  const [first, second] = await Promise.all([
    queue.uploadRawQueue('CLIENT-A', [...files.slice(0, 5), files[0]], state => states.push(state), transfer),
    queue.uploadRawQueue('CLIENT-B', files.slice(5), () => {}, transfer),
  ])
  assert.equal(maximum, 3, 'Exactly three files run concurrently even across client cards')
  assert.equal(active, 0)
  assert.equal(calls.length, 8, 'Same File object selected twice is not uploaded twice')
  assert.ok(calls.every(call => call.booking === (files.indexOf(call.file) < 5 ? 'CLIENT-A' : 'CLIENT-B')))
  assert.equal(first.status, 'partial'); assert.equal(first.uploaded, 4); assert.deepEqual(first.failed, [files[1]])
  assert.equal(first.bytesProcessed, 425, 'A failed file does not falsely contribute all 100 bytes')
  assert.equal(second.status, 'complete'); assert.equal(second.uploaded, 3)
  assert.ok(states.some(state => state.activeFiles.length === 3))
  assert.ok(states.some(state => state.activeFiles.some(file => file.verifying)))
  assert.ok(states.every(state => state.bytesProcessed <= state.totalBytes && state.activeFiles.length <= 3))
  fail = false
  const retry = await queue.uploadRawQueue('CLIENT-A', first.failed, () => {}, transfer)
  assert.equal(retry.status, 'complete'); assert.equal(calls.length, 9); assert.equal(calls.at(-1)?.file, files[1])
  assert.equal((await queue.uploadRawQueue('EMPTY', [], () => {}, transfer)).status, 'complete')
})
