import assert from 'node:assert/strict'
import test from 'node:test'
import { clientPhotoFolderName, downloadPrivateFolder, savePortalFolderStream } from '../lib/portal-folder-transfer.ts'

test('folder names retain the client and FM reference while removing unsafe path characters', () => {
  assert.equal(clientPhotoFolderName('Ruth Mhay / Vertucio', 'FM-639624'), 'Ruth Mhay Vertucio - FM-639624')
})

test('folder transfer saves every file separately and reports exact byte progress', async () => {
  const saved = new Map<string, string>()
  const pieces = new Map<string, Uint8Array[]>()
  const folder = {
    async getFileHandle(name: string) {
      pieces.set(name, [])
      return {
        async createWritable() {
          return {
            async write(bytes: Uint8Array) { pieces.get(name)!.push(new Uint8Array(bytes)) },
            async close() { saved.set(name, new TextDecoder().decode(Buffer.concat(pieces.get(name)!.map(piece => Buffer.from(piece))))) },
            async abort() { pieces.delete(name) },
          }
        },
      }
    },
  } as unknown as FileSystemDirectoryHandle
  const bytes = new TextEncoder().encode(`${JSON.stringify({ files: [{ name: 'ONE.JPG', size: 3 }, { name: 'TWO.JPG', size: 2 }] })}\nabcde`)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 7))
      controller.enqueue(bytes.subarray(7, bytes.length - 1))
      controller.enqueue(bytes.subarray(bytes.length - 1))
      controller.close()
    },
  })
  const progress: Array<{ writtenBytes: number; savedFiles: number }> = []
  const result = await savePortalFolderStream(stream, folder, update => progress.push(update))
  assert.deepEqual(result, { totalBytes: 5, savedFiles: 2 })
  assert.deepEqual([...saved], [['ONE.JPG', 'abc'], ['TWO.JPG', 'de']])
  assert.deepEqual(progress.at(-1), { writtenBytes: 5, totalBytes: 5, savedFiles: 2, totalFiles: 2, fileName: 'TWO.JPG' })
})

test('an interrupted folder stream rejects without closing a partial file as complete', async () => {
  let aborted = false
  const folder = {
    async getFileHandle() {
      return { async createWritable() { return { async write() {}, async close() { throw new Error('must not close') }, async abort() { aborted = true } } } }
    },
  } as unknown as FileSystemDirectoryHandle
  const bytes = new TextEncoder().encode(`${JSON.stringify({ files: [{ name: 'ONE.JPG', size: 5 }] })}\nabc`)
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } })
  await assert.rejects(savePortalFolderStream(stream, folder, () => {}), /connection ended/)
  assert.equal(aborted, true)
})

test('editor batch folder preserves client, SELECTED and empty EDITED directories', async () => {
  const directories = new Set<string>()
  const saved = new Map<string, string>()
  const directory = (path: string): FileSystemDirectoryHandle => ({
    async getDirectoryHandle(name: string) { const child = `${path}/${name}`; directories.add(child); return directory(child) },
    async getFileHandle(name: string) { return { async createWritable() {
      const chunks: Uint8Array[] = []
      return { async write(bytes: Uint8Array) { chunks.push(new Uint8Array(bytes)) }, async close() { saved.set(`${path}/${name}`, Buffer.concat(chunks).toString()) }, async abort() {} }
    } } },
  }) as unknown as FileSystemDirectoryHandle
  const files = [{ name: 'Client A/SELECTED/manifest.json', size: 3 }, { name: 'Client A/SELECTED/PHOTO.JPG', size: 2 }]
  const bytes = new TextEncoder().encode(`${JSON.stringify({ files, directories: ['Client A/SELECTED/EDITED'] })}\nabcde`)
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close() } })
  await savePortalFolderStream(stream, directory('Batch'), () => {})
  assert.equal(saved.get('Batch/Client A/SELECTED/manifest.json'), 'abc')
  assert.equal(saved.get('Batch/Client A/SELECTED/PHOTO.JPG'), 'de')
  assert.ok(directories.has('Batch/Client A/SELECTED/EDITED'))
})

test('folder parser rejects traversal paths before writing any file', async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ files: [{ name: '../private.txt', size: 3 }] })}\nabc`)); controller.close() } })
  const folder = { async getFileHandle() { throw new Error('must not write') } } as unknown as FileSystemDirectoryHandle
  await assert.rejects(savePortalFolderStream(stream, folder, () => {}), /unsafe path/)
})

test('browser folder save chooses a directory before preparing the private transfer', async t => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const oldFetch = globalThis.fetch
  t.after(() => { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); globalThis.fetch = oldFetch })
  const events: string[] = []
  const saved = new Map<string, string>()
  const directory = (path: string): FileSystemDirectoryHandle => ({
    async getDirectoryHandle(name: string) { return directory(`${path}/${name}`) },
    async getFileHandle(name: string) { return { async createWritable() {
      const chunks: Uint8Array[] = []
      return { async write(bytes: Uint8Array) { chunks.push(new Uint8Array(bytes)) }, async close() { saved.set(`${path}/${name}`, Buffer.concat(chunks).toString()) }, async abort() {} }
    } } },
  }) as unknown as FileSystemDirectoryHandle
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { showDirectoryPicker: async () => { events.push('picker'); return directory('chosen') } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    events.push(String(input).startsWith('/api/') ? 'prepare' : 'transfer')
    if (String(input).startsWith('/api/')) {
      assert.equal(init?.method, 'POST')
      assert.equal(init?.credentials, 'include')
      return Response.json({ url: 'https://worker.example/folder/id?token=private' })
    }
    return new Response(new TextEncoder().encode(`${JSON.stringify({ files: [{ name: 'Edited/PHOTO.JPG', size: 3 }] })}\nabc`))
  }) as typeof fetch
  const result = await downloadPrivateFolder('/api/editor-workflow/batches/day/download', 'Client - FM-123', () => {})
  assert.deepEqual(events, ['picker', 'prepare', 'transfer'])
  assert.equal(result?.folderName, 'Client - FM-123')
  assert.equal(saved.get('chosen/Client - FM-123/Edited/PHOTO.JPG'), 'abc')
})

test('choosing a client-named subfolder inside Downloads does not create a duplicate nested folder', async t => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const oldFetch = globalThis.fetch
  t.after(() => { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); globalThis.fetch = oldFetch })
  const createdFolders: string[] = []
  const saved: string[] = []
  const directory = (name: string, path: string): FileSystemDirectoryHandle => ({
    name,
    async getDirectoryHandle(child: string) { createdFolders.push(`${path}/${child}`); return directory(child, `${path}/${child}`) },
    async getFileHandle(file: string) { return { async createWritable() { return { async write() {}, async close() { saved.push(`${path}/${file}`) }, async abort() {} } } } },
  }) as unknown as FileSystemDirectoryHandle
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { showDirectoryPicker: async () => directory('Client - FM-123', 'Downloads/Client - FM-123') } })
  globalThis.fetch = (async (input: string | URL | Request) => String(input).startsWith('/api/')
    ? Response.json({ url: 'https://worker.example/folder/id?token=private' })
    : new Response(new TextEncoder().encode(`${JSON.stringify({ files: [{ name: 'PHOTO.JPG', size: 3 }] })}\nabc`))) as typeof fetch
  await downloadPrivateFolder('/api/editor-workflow/batches/day/download', 'Client - FM-123', () => {})
  assert.deepEqual(createdFolders, [])
  assert.deepEqual(saved, ['Downloads/Client - FM-123/PHOTO.JPG'])
})
