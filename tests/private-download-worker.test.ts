import assert from 'node:assert/strict'
import test from 'node:test'
import { BlobReader, Uint8ArrayWriter, ZipReader, configure } from '@zip.js/zip.js'
import worker from '../workers/private-downloads/src/index.js'

test('one stalled ZIP cannot hold the first bytes of another client download', async () => {
  const originalFetch = globalThis.fetch
  const tasks: Promise<unknown>[] = []
  const completions: boolean[] = []
  let stalledController: ReadableStreamDefaultController<Uint8Array> | undefined
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = []
  configure({ maxWorkers: 1 })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) {
      const body = JSON.parse(String(init?.body)) as { p_manifest: string }
      const stalled = body.p_manifest.startsWith('aaaa')
      return Response.json({ kind: 'PORTAL_ORIGINALS', fileName: 'client', entries: [{ name: 'Photo.JPG', storageKey: stalled ? 'stalled' : 'healthy', byteSize: 3 }] })
    }
    completions.push(Boolean(JSON.parse(String(init?.body)).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
      PRIVATE_PHOTOS: {
        head: async () => ({ size: 3 }),
        get: async (key: string) => ({ body: key === 'stalled'
          ? new ReadableStream<Uint8Array>({ start(controller) { stalledController = controller } })
          : new Blob(['abc']).stream() }),
      },
    }
    const context = { waitUntil: (task: Promise<unknown>) => tasks.push(task) }
    const stalled = await worker.fetch(new Request(`https://downloads.example/download/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?token=${'a'.repeat(43)}`), env, context)
    const stalledReader = stalled.body!.getReader()
    readers.push(stalledReader)
    assert.equal((await stalledReader.read()).done, false)
    const healthy = await worker.fetch(new Request(`https://downloads.example/download/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?token=${'b'.repeat(43)}`), env, context)
    const healthyReader = healthy.body!.getReader()
    readers.push(healthyReader)
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      const first = await Promise.race([
        healthyReader.read(),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('A healthy download waited on another client\'s stalled ZIP.')), 1000) }),
      ])
      assert.equal(first.done, false)
      const chunks = [first.value!]
      for (;;) {
        const result = await healthyReader.read()
        if (result.done) break
        chunks.push(result.value)
      }
      assert.equal(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0), Number(healthy.headers.get('content-length')))
    } finally { if (deadline) clearTimeout(deadline) }
  } finally {
    await Promise.allSettled(readers.map(reader => reader.cancel(new Error('Test cleanup'))))
    try { stalledController?.error(new Error('Test cleanup')) } catch { /* already canceled */ }
    await Promise.allSettled(tasks)
    globalThis.fetch = originalFetch
    configure({ maxWorkers: 2 })
  }
})

test('download links require a live private manifest', async () => {
  const response = await worker.fetch(new Request(`https://downloads.example/download/11111111-1111-4111-8111-111111111111?token=${'a'.repeat(43)}`), {}, {})
  assert.equal(response.status, 410)
  assert.match(await response.text(), /link is unavailable/)
})

test('ZIP download streams originals with a verified total and records success', async () => {
  const manifestId = '55555555-5555-4555-8555-555555555555'
  const originalFetch = globalThis.fetch
  const completions: boolean[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) return Response.json({
      kind: 'PORTAL_ORIGINALS', fileName: 'Client - FM-123456 - Originals', entries: [
        { name: 'First.JPG', storageKey: 'one', byteSize: 3 },
        { name: 'Second.JPG', storageKey: 'two', byteSize: 2 },
      ],
    })
    completions.push(Boolean(JSON.parse(String(init?.body || '{}')).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const tasks: Promise<unknown>[] = []
    const response = await worker.fetch(new Request(`https://downloads.example/download/${manifestId}?token=${'a'.repeat(43)}`), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
      PRIVATE_PHOTOS: {
        head: async (key: string) => ({ size: key === 'one' ? 3 : 2 }),
        get: async (key: string) => ({ body: new Blob([key === 'one' ? 'abc' : 'de']).stream() }),
      },
    }, { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/zip')
    assert.match(response.headers.get('content-disposition') || '', /Client - FM-123456 - Originals\.zip/)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await Promise.all(tasks)
    assert.equal(bytes.byteLength, Number(response.headers.get('content-length')))
    const reader = new ZipReader(new BlobReader(new Blob([bytes])), { checkCrc32: true })
    const entries = await reader.getEntries()
    assert.deepEqual(entries.map(entry => entry.filename), ['First.JPG', 'Second.JPG'])
    assert.ok('getData' in entries[0] && 'getData' in entries[1])
    const first = await entries[0].getData(new Uint8ArrayWriter())
    const second = await entries[1].getData(new Uint8ArrayWriter())
    assert.equal(new TextDecoder().decode(first), 'abc')
    assert.equal(new TextDecoder().decode(second), 'de')
    await reader.close()
    assert.deepEqual(completions, [true])
  } finally { globalThis.fetch = originalFetch }
})

test('single-photo download is a normal attachment and does not use a weekly slot', async () => {
  const manifestId = '66666666-6666-4666-8666-666666666666'
  const originalFetch = globalThis.fetch
  const completions: boolean[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) return Response.json({
      kind: 'PORTAL_ORIGINAL_SINGLE', fileName: 'Portrait.JPG', entries: [{ name: 'Portrait.JPG', storageKey: 'one', byteSize: 3 }],
    })
    completions.push(Boolean(JSON.parse(String(init?.body || '{}')).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const tasks: Promise<unknown>[] = []
    const response = await worker.fetch(new Request(`https://downloads.example/file/${manifestId}?token=${'a'.repeat(43)}`), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
      PRIVATE_PHOTOS: {
        head: async () => ({ size: 3 }),
        get: async () => ({ body: new Blob(['abc']).stream() }),
      },
    }, { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-length'), '3')
    assert.match(response.headers.get('content-disposition') || '', /Portrait\.JPG/)
    assert.equal(await response.text(), 'abc')
    await Promise.all(tasks)
    assert.deepEqual(completions, [true])
  } finally { globalThis.fetch = originalFetch }
})

test('editor ZIP preserves nested folders and empty EDITED directory', async () => {
  const manifestId = '77777777-7777-4777-8777-777777777777'
  const originalFetch = globalThis.fetch
  const completions: boolean[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) return Response.json({
      kind: 'EDITOR_BATCH', fileName: 'FICO-MANA-DAY', entries: [
        { name: 'manifest.json', inlineBase64: Buffer.from('{"batch":true}').toString('base64') },
        { name: 'CLIENT/SELECTED/EDITED/', inlineBase64: '' },
      ],
    })
    completions.push(Boolean(JSON.parse(String(init?.body || '{}')).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const tasks: Promise<unknown>[] = []
    const response = await worker.fetch(new Request(`https://downloads.example/download/${manifestId}?token=${'a'.repeat(43)}`), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
      PRIVATE_PHOTOS: { head: async () => { throw new Error('no R2 needed') }, get: async () => { throw new Error('no R2 needed') } },
    }, { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    assert.equal(response.status, 200)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await Promise.all(tasks)
    assert.equal(bytes.byteLength, Number(response.headers.get('content-length')))
    const reader = new ZipReader(new BlobReader(new Blob([bytes])), { checkCrc32: true })
    const entries = await reader.getEntries()
    assert.deepEqual(entries.map(entry => entry.filename), ['CLIENT/SELECTED/EDITED/', 'manifest.json'])
    assert.equal(entries[0].directory, true)
    await reader.close()
    assert.deepEqual(completions, [true])
  } finally { globalThis.fetch = originalFetch }
})

test('ZIP64 streams a gigabyte without buffering photos or opening multiple R2 bodies', async () => {
  const originalFetch = globalThis.fetch
  const fileSize = 5 * 1024 * 1024
  const count = 205
  const chunk = new Uint8Array(64 * 1024).fill(123)
  const tasks: Promise<unknown>[] = []
  const completions: boolean[] = []
  let openBodies = 0
  let peakBodies = 0
  let filesRead = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) return Response.json({
      kind: 'PORTAL_ORIGINALS', fileName: 'large-client',
      entries: Array.from({ length: count }, (_, index) => ({ name: `Photo-${index}.JPG`, storageKey: `photo-${index}`, byteSize: fileSize })),
    })
    completions.push(Boolean(JSON.parse(String(init?.body)).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const response = await worker.fetch(new Request(`https://downloads.example/download/cccccccc-cccc-4ccc-8ccc-cccccccccccc?token=${'c'.repeat(43)}`), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
      PRIVATE_PHOTOS: {
        head: async () => ({ size: fileSize }),
        get: async () => {
          let remaining = fileSize
          openBodies++; filesRead++; peakBodies = Math.max(peakBodies, openBodies)
          return { body: new ReadableStream<Uint8Array>({ pull(controller) {
            if (remaining === 0) { controller.close(); openBodies--; return }
            controller.enqueue(chunk); remaining -= chunk.byteLength
          } }) }
        },
      },
    }, { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    const reader = response.body!.getReader()
    let received = 0
    let footer: Uint8Array | undefined
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      footer = value
    }
    await Promise.all(tasks)
    assert.equal(received, Number(response.headers.get('content-length')))
    assert.ok(received > 1024 ** 3)
    assert.equal(filesRead, count)
    assert.equal(peakBodies, 1)
    assert.equal(openBodies, 0)
    assert.equal(footer?.byteLength, 98)
    assert.equal(new DataView(footer!.buffer, footer!.byteOffset).getBigUint64(24, true), BigInt(count))
    assert.deepEqual(completions, [true])
  } finally { globalThis.fetch = originalFetch }
})

test('canceling a ZIP cancels its waiting R2 reader and releases the download slot', async () => {
  const originalFetch = globalThis.fetch
  const tasks: Promise<unknown>[] = []
  const completions: boolean[] = []
  let sourceCanceled = false
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) return Response.json({
      kind: 'PORTAL_ORIGINALS', fileName: 'client', entries: [{ name: 'Photo.JPG', storageKey: 'waiting', byteSize: 3 }],
    })
    completions.push(Boolean(JSON.parse(String(init?.body)).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const response = await worker.fetch(new Request(`https://downloads.example/download/dddddddd-dddd-4ddd-8ddd-dddddddddddd?token=${'d'.repeat(43)}`), {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
      PRIVATE_PHOTOS: { head: async () => ({ size: 3 }), get: async () => ({ body: new ReadableStream<Uint8Array>({ cancel() { sourceCanceled = true } }) }) },
    }, { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    const reader = response.body!.getReader()
    assert.equal((await reader.read()).done, false)
    await reader.cancel('Client canceled')
    await Promise.all(tasks)
    assert.equal(sourceCanceled, true)
    assert.deepEqual(completions, [false])
  } finally { globalThis.fetch = originalFetch }
})

test('ZIP checksums preserve UTF-8 filenames and detect truncated private photos', async () => {
  const originalFetch = globalThis.fetch
  const completions: boolean[] = []
  let truncate = false
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) return Response.json({
      kind: 'PORTAL_ORIGINALS', fileName: 'client', entries: [{ name: 'Photos/Portrait ni José.JPG', storageKey: 'portrait', byteSize: 9 }],
    })
    completions.push(Boolean(JSON.parse(String(init?.body)).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key',
      PRIVATE_PHOTOS: { head: async () => ({ size: 9 }), get: async () => ({ body: new Blob([truncate ? '12345' : '123456789']).stream() }) },
    }
    const request = () => new Request(`https://downloads.example/download/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee?token=${'e'.repeat(43)}`)
    const tasks: Promise<unknown>[] = []
    const response = await worker.fetch(request(), env, { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    const bytes = await response.arrayBuffer()
    await Promise.all(tasks)
    const reader = new ZipReader(new BlobReader(new Blob([bytes])), { checkCrc32: true })
    const entries = await reader.getEntries()
    assert.equal(entries[0].filename, 'Photos/Portrait ni José.JPG')
    assert.equal(entries[0].crc32, 0xcbf43926)
    assert.ok('getData' in entries[0])
    assert.equal(new TextDecoder().decode(await entries[0].getData(new Uint8ArrayWriter())), '123456789')
    await reader.close()
    truncate = true
    const broken = await worker.fetch(request(), env, { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    await assert.rejects(broken.arrayBuffer(), /did not match its verified size/)
    await Promise.all(tasks)
    assert.deepEqual(completions, [true, false])
  } finally { globalThis.fetch = originalFetch }
})

test('private download worker authorizes, streams R2 bytes, and records completion', async () => {
  const manifestId = '11111111-1111-4111-8111-111111111111'
  const originalFetch = globalThis.fetch
  const runtime = globalThis as typeof globalThis & { FixedLengthStream?: typeof TransformStream }
  const originalFixedLengthStream = runtime.FixedLengthStream
  let fixedLengthRequested = BigInt(0)
  class TestFixedLengthStream extends TransformStream<Uint8Array, Uint8Array> {
    constructor(length: bigint) {
      super()
      fixedLengthRequested = length
    }
  }
  runtime.FixedLengthStream = TestFixedLengthStream as typeof TransformStream
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    calls.push({ url, body })
    if (url.endsWith('/resolve_private_download_manifest')) {
      return Response.json({
        fileName: 'client-originals',
        entries: [{ name: 'PHOTO-1.JPG', storageKey: 'workspaces/a/PHOTO-1.JPG' }],
      })
    }
    return Response.json(true)
  }) as typeof fetch

  try {
    const backgroundTasks: Promise<unknown>[] = []
    const response = await worker.fetch(
      new Request(`https://downloads.example/folder/${manifestId}?token=${'a'.repeat(43)}`),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'public-key',
        PRIVATE_PHOTOS: {
          head: async () => ({ size: 51 }),
          get: async () => ({
            body: new Blob([new Uint8Array(51)]).stream(),
            size: 51,
            uploaded: new Date('2026-09-21T00:00:00Z'),
          }),
        },
      },
      { waitUntil: (task: Promise<unknown>) => backgroundTasks.push(task) },
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/x-ficomana-photo-folder')
    assert.equal(response.headers.get('content-disposition'), null)
    assert.ok(Number(response.headers.get('content-length')) > 51)
    const stream = new Uint8Array(await response.arrayBuffer())
    assert.equal(stream.byteLength, Number(response.headers.get('content-length')))
    assert.equal(fixedLengthRequested, BigInt(stream.byteLength))
    const split = stream.indexOf(10)
    assert.deepEqual(JSON.parse(new TextDecoder().decode(stream.subarray(0, split))).files, [{ name: 'PHOTO-1.JPG', size: 51 }])
    assert.equal(stream.byteLength - split - 1, 51)
    await Promise.all(backgroundTasks)
    assert.equal(calls.length, 2)
    assert.match(calls[0].url, /resolve_private_download_manifest$/)
    assert.match(calls[1].url, /complete_private_download_manifest$/)
    assert.equal(calls[1].body.p_success, true)
  } finally {
    globalThis.fetch = originalFetch
    if (originalFixedLengthStream) runtime.FixedLengthStream = originalFixedLengthStream
    else delete runtime.FixedLengthStream
  }
})

test('private folder worker includes nested inline batch manifests and empty editor folders without reading R2', async () => {
  const manifestId = '22222222-2222-4222-8222-222222222222'
  const originalFetch = globalThis.fetch
  let r2Reads = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) {
      return Response.json({
        fileName: 'editor-batch',
        entries: [
          { name: 'manifest.json', inlineBase64: Buffer.from('{"batch":true}').toString('base64') },
          { name: 'CLIENT/SELECTED/EDITED/', inlineBase64: '' },
        ],
      })
    }
    return Response.json(true)
  }) as typeof fetch
  try {
    const response = await worker.fetch(
      new Request(`https://downloads.example/folder/${manifestId}?token=${'b'.repeat(43)}`, { headers: { origin: 'https://editor.ficomana.com' } }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'public-key',
        PRIVATE_PHOTOS: {
          head: async () => { r2Reads++; return null },
          get: async () => { r2Reads++; return null },
        },
      },
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://editor.ficomana.com')
    const stream = new Uint8Array(await response.arrayBuffer())
    assert.equal(stream.byteLength, Number(response.headers.get('content-length')))
    const split = stream.indexOf(10)
    assert.deepEqual(JSON.parse(new TextDecoder().decode(stream.subarray(0, split))), {
      files: [{ name: 'manifest.json', size: Buffer.byteLength('{"batch":true}') }],
      directories: ['CLIENT/SELECTED/EDITED'],
    })
    assert.equal(new TextDecoder().decode(stream.subarray(split + 1)), '{"batch":true}')
    assert.equal(r2Reads, 0)
    await new Promise((resolve) => setTimeout(resolve, 20))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('private download worker refuses an attachment before streaming when any R2 object is unavailable', async () => {
  const manifestId = '33333333-3333-4333-8333-333333333333'
  const originalFetch = globalThis.fetch
  const completions: boolean[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) {
      return Response.json({
        fileName: 'client-originals',
        entries: [
          { name: 'PHOTO-1.JPG', storageKey: 'workspaces/a/PHOTO-1.JPG', byteSize: 12 },
          { name: 'PHOTO-2.JPG', storageKey: 'workspaces/a/PHOTO-2.JPG', byteSize: 24 },
        ],
      })
    }
    const body = JSON.parse(String(init?.body || '{}')) as { p_success?: boolean }
    completions.push(Boolean(body.p_success))
    return Response.json(true)
  }) as typeof fetch

  try {
    const response = await worker.fetch(
      new Request(`https://downloads.example/folder/${manifestId}?token=${'c'.repeat(43)}`),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'public-key',
        PRIVATE_PHOTOS: {
          head: async (key: string) => key.endsWith('PHOTO-1.JPG') ? { size: 12 } : null,
          get: async () => { throw new Error('streaming must not begin') },
        },
      },
    )
    assert.equal(response.status, 409)
    assert.match(response.headers.get('content-type') || '', /application\/json/)
    assert.equal(response.headers.get('content-disposition'), null)
    assert.deepEqual(completions, [false])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('private folder transport streams separate photo bytes with names and a verified total', async () => {
  const manifestId = '44444444-4444-4444-8444-444444444444'
  const originalFetch = globalThis.fetch
  const completions: boolean[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) {
      return Response.json({
        fileName: `${manifestId}-FICO-MANA-ORIGINALS`,
        entries: [
          { name: 'FIRST.JPG', storageKey: 'one', byteSize: 3 },
          { name: 'SECOND.JPG', storageKey: 'two', byteSize: 2 },
        ],
      })
    }
    completions.push(Boolean(JSON.parse(String(init?.body || '{}')).p_success))
    return Response.json(true)
  }) as typeof fetch
  try {
    const backgroundTasks: Promise<unknown>[] = []
    const response = await worker.fetch(
      new Request(`https://downloads.example/folder/${manifestId}?token=${'d'.repeat(43)}`, {
        headers: { origin: 'https://ficomana.com' },
      }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'public-key',
        PRIVATE_PHOTOS: {
          head: async (key: string) => ({ size: key === 'one' ? 3 : 2 }),
          get: async (key: string) => ({ body: new Blob([key === 'one' ? 'abc' : 'de']).stream() }),
        },
      },
      { waitUntil: (task: Promise<unknown>) => backgroundTasks.push(task) },
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://ficomana.com')
    const body = new Uint8Array(await response.arrayBuffer())
    assert.equal(body.byteLength, Number(response.headers.get('content-length')))
    const split = body.indexOf(10)
    assert.deepEqual(JSON.parse(new TextDecoder().decode(body.subarray(0, split))), {
      files: [{ name: 'FIRST.JPG', size: 3 }, { name: 'SECOND.JPG', size: 2 }],
      directories: [],
    })
    assert.equal(new TextDecoder().decode(body.subarray(split + 1)), 'abcde')
    await Promise.all(backgroundTasks)
    assert.deepEqual(completions, [true])
  } finally {
    globalThis.fetch = originalFetch
  }
})
