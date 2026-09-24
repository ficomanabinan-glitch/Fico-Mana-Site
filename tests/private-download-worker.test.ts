import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../workers/private-downloads/src/index.js'

test('private download worker authorizes, streams R2 bytes, and records completion', async () => {
  const manifestId = '11111111-1111-4111-8111-111111111111'
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
    calls.push({ url, body })
    if (url.endsWith('/resolve_private_download_manifest')) {
      return Response.json({
        fileName: 'client-originals.zip',
        entries: [{ name: 'PHOTO-1.JPG', storageKey: 'workspaces/a/PHOTO-1.JPG' }],
      })
    }
    return Response.json(true)
  }) as typeof fetch

  try {
    const backgroundTasks: Promise<unknown>[] = []
    const response = await worker.fetch(
      new Request(`https://downloads.example/download/${manifestId}?token=${'a'.repeat(43)}`),
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
    assert.equal(response.headers.get('content-type'), 'application/zip')
    assert.match(response.headers.get('content-disposition') || '', /client-originals\.zip/)
    assert.equal(response.headers.get('x-ficomana-source-bytes'), '51')
    assert.ok(Number(response.headers.get('content-length')) > 51)
    const archive = new Uint8Array(await response.arrayBuffer())
    assert.equal(archive.byteLength, Number(response.headers.get('content-length')))
    assert.ok(archive.byteLength > 100)
    assert.equal(String.fromCharCode(...archive.slice(0, 2)), 'PK')
    await Promise.all(backgroundTasks)
    assert.equal(calls.length, 2)
    assert.match(calls[0].url, /resolve_private_download_manifest$/)
    assert.match(calls[1].url, /complete_private_download_manifest$/)
    assert.equal(calls[1].body.p_success, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('private download worker includes inline batch manifests without reading R2', async () => {
  const manifestId = '22222222-2222-4222-8222-222222222222'
  const originalFetch = globalThis.fetch
  let r2Reads = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input).endsWith('/resolve_private_download_manifest')) {
      return Response.json({
        fileName: 'editor-batch.zip',
        entries: [{ name: 'manifest.json', inlineBase64: Buffer.from('{"batch":true}').toString('base64') }],
      })
    }
    return Response.json(true)
  }) as typeof fetch
  try {
    const response = await worker.fetch(
      new Request(`https://downloads.example/download/${manifestId}?token=${'b'.repeat(43)}`),
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
    assert.equal(response.headers.get('x-ficomana-source-bytes'), String(Buffer.byteLength('{"batch":true}')))
    const archive = new Uint8Array(await response.arrayBuffer())
    assert.equal(archive.byteLength, Number(response.headers.get('content-length')))
    assert.equal(String.fromCharCode(...archive.slice(0, 2)), 'PK')
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
        fileName: 'client-originals.zip',
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
      new Request(`https://downloads.example/download/${manifestId}?token=${'c'.repeat(43)}`),
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
