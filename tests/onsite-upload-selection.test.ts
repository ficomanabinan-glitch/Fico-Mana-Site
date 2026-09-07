import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadTs } from './helpers/load-ts.ts'

const onsite = loadTs<typeof import('../components/onsite-upload.tsx')>('components/onsite-upload.tsx', {
  '@/components/use-cached-page-read': {},
  '@/components/admin-toast-provider': {}, '@/components/editor-page-skeleton': {}, '@/lib/admin-ui': {},
  '@/lib/raw-upload-client': { uploadRawDirect: () => {} },
  '@/lib/raw-upload-queue': {},
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

test('onsite UI uses direct Drive upload and separates failed names from the solution', () => {
  const source = readFileSync('components/onsite-upload.tsx', 'utf8')
  assert.match(source, /uploadRawDirect as uploadRawFile/)
  assert.doesNotMatch(source, /new FormData|form\.append\('file'/)
  assert.match(source, /<p>Failed: .*<\/p>/)
  assert.match(source, /state\.lastError \? <p className="mt-1">/)
  assert.match(source, /Verifying uploaded photo/)
})
