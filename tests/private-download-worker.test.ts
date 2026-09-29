import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../workers/private-downloads/src/index.js'

test('legacy ZIP links cannot create a new archive', async () => {
  const response = await worker.fetch(new Request(`https://downloads.example/download/11111111-1111-4111-8111-111111111111?token=${'a'.repeat(43)}`), {}, {})
  assert.equal(response.status, 410)
  assert.match(await response.text(), /ZIP downloads are no longer available/)
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
