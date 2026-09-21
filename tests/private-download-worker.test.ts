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
    const response = await worker.fetch(
      new Request(`https://downloads.example/download/${manifestId}?token=${'a'.repeat(43)}`),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'public-key',
        PRIVATE_PHOTOS: {
          get: async (key: string) => ({
            body: new Blob([`private:${key}`]).stream(),
            uploaded: new Date('2026-09-21T00:00:00Z'),
          }),
        },
      },
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/zip')
    assert.match(response.headers.get('content-disposition') || '', /client-originals\.zip/)
    const archive = new Uint8Array(await response.arrayBuffer())
    assert.ok(archive.byteLength > 100)
    assert.equal(String.fromCharCode(...archive.slice(0, 2)), 'PK')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(calls.length, 2)
    assert.match(calls[0].url, /resolve_private_download_manifest$/)
    assert.match(calls[1].url, /complete_private_download_manifest$/)
    assert.equal(calls[1].body.p_success, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
