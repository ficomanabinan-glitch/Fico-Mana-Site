import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { canPrefetchPortalPhotos, PortalPreviewCache } from '../lib/portal-preview-cache.ts'

const photo = (id: number) => `/api/editor-workflow/portal/synthetic/file/photo-${id}?kind=gallery`
const image = () => new Response('synthetic image', { headers: { 'content-type': 'image/jpeg' } })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('background and clicked preview share one request and reuse the completed private blob', async t => {
  let calls = 0, finish!: (response: Response) => void
  const cache = new PortalPreviewCache({ fetcher: async (_url, init) => {
    calls++; assert.equal(init?.credentials, 'same-origin'); assert.equal(init?.cache, 'default')
    return new Promise<Response>(resolve => { finish = resolve })
  } })
  t.after(() => cache.clear())
  const background = cache.load(photo(1)), clicked = cache.load(photo(1), true)
  assert.equal(background, clicked); assert.equal(calls, 1)
  finish(image())
  const url = await clicked
  assert.ok(url?.startsWith('blob:')); assert.equal(await cache.load(photo(1), true), url); assert.equal(calls, 1)
})

test('background queue is delayed/paused, limited to two requests and prioritizes requested zooms', async t => {
  const calls: string[] = [], finishes: Array<(response: Response) => void> = []
  const cache = new PortalPreviewCache({ fetcher: async url => { calls.push(String(url)); return new Promise<Response>(resolve => finishes.push(resolve)) } })
  t.after(() => cache.clear())
  cache.setBackgroundEnabled(false)
  const queued = [cache.load(photo(1)), cache.load(photo(2)), cache.load(photo(3))]
  assert.equal(calls.length, 0)
  const clicked = cache.load(photo(3), true)
  assert.deepEqual(calls, [photo(3)])
  cache.setBackgroundEnabled(true)
  assert.equal(calls.length, 2)
  finishes[0](image()); await clicked; await tick()
  assert.deepEqual(calls, [photo(3), photo(1), photo(2)])
  finishes[1](image()); finishes[2](image()); await Promise.all(queued)
})

test('cache enforces memory bounds, clears across portals and never prefetches external/original delivery URLs', async () => {
  let calls = 0
  const cache = new PortalPreviewCache({ maxEntries: 2, fetcher: async () => { calls++; return image() } })
  await cache.load(photo(1)); await cache.load(photo(2)); await cache.load(photo(3))
  assert.equal(cache.peek(photo(1)), null)
  assert.ok(cache.peek(photo(3)))
  assert.equal(await cache.load('https://account.r2.cloudflarestorage.com/private?X-Amz-Signature=synthetic'), null)
  assert.equal(await cache.load(photo(3).replace('gallery', 'deliverable')), null)
  assert.equal(calls, 3)
  cache.clear(); assert.equal(cache.peek(photo(3)), null)
  await cache.load(photo(3)); assert.equal(calls, 4); cache.clear()
})

test('failed or oversized previews are not cached and can be retried', async () => {
  let attempt = 0
  const cache = new PortalPreviewCache({ fetcher: async () => {
    attempt++
    if (attempt === 1) return new Response('denied', { status: 403 })
    if (attempt === 2) return new Response('large', { headers: { 'content-type': 'image/jpeg', 'content-length': String(10 * 1024 * 1024) } })
    return image()
  } })
  assert.equal(await cache.load(photo(1)), null)
  assert.equal(await cache.load(photo(1)), null)
  assert.ok(await cache.load(photo(1))); cache.clear()
})

test('one device tab reuses 150 gallery images and refetches only an explicitly invalidated image', async () => {
  let requests = 0
  const cache = new PortalPreviewCache({ maxEntries: 160, maxBytes: 96 * 1024 * 1024, fetcher: async () => { requests++; return image() } })
  try {
    for (let id = 1; id <= 150; id++) assert.ok(await cache.load(photo(id), true))
    for (let id = 1; id <= 150; id++) assert.ok(await cache.load(photo(id), true))
    assert.equal(requests, 150, 'revisiting the gallery should use device memory instead of the server')
    cache.invalidate(photo(1))
    assert.ok(await cache.load(photo(1), true))
    assert.equal(requests, 151)
  } finally { cache.clear() }
})

test('an open preview survives background eviction but is refreshed after its cache lifetime', async t => {
  const cache = new PortalPreviewCache({ maxEntries: 2, ttl: 30, fetcher: async () => image() })
  t.after(() => cache.clear())
  const first = await cache.load(photo(1))
  const release = cache.retain(photo(1))
  await cache.load(photo(2)); await cache.load(photo(3))
  assert.equal(cache.peek(photo(1)), first)
  assert.equal(cache.peek(photo(2)), null)
  await new Promise(resolve => setTimeout(resolve, 40))
  assert.equal(cache.peek(photo(1)), first, 'The active viewer keeps a valid object URL')
  release()
  assert.equal(cache.peek(photo(1)), null)
  const releaseAgain = cache.retain(photo(1))
  assert.equal(cache.peek(photo(1)), null, 'Reopening must not revive an expired image')
  assert.notEqual(await cache.load(photo(1), true), first)
  releaseAgain()
})

test('data saver and slow connections disable speculation; SSR and skeleton stay ahead of gallery work', () => {
  assert.equal(canPrefetchPortalPhotos({ saveData: true }), false)
  assert.equal(canPrefetchPortalPhotos({ effectiveType: '3g' }), false)
  assert.equal(canPrefetchPortalPhotos({ effectiveType: '4g' }), true)
  const provider = readFileSync('components/portal-preview-cache.tsx', 'utf8')
  assert.match(provider, /document.readyState === 'complete'/)
  assert.match(provider, /document.visibilityState === 'visible'/)
  assert.match(provider, /setTimeout[\s\S]*1200/)
  const page = readFileSync('app/portal/[id]/page.tsx', 'utf8')
  assert.doesNotMatch(page, /'use client'/)
  assert.match(page, /dynamic = 'force-dynamic'/)
  assert.match(page, /enforceApiRateLimit[\s\S]*await getPortalData\(publicId, 0, 48\)/)
  assert.match(page, /<Suspense fallback=\{<PortalPageSkeleton/)
  assert.match(readFileSync('components/client-portal-page.tsx', 'utf8'), /if \(initialData\) \{ queryClient.setQueryData\(queryKey, initialData\); return \}/)
  const privateImage = readFileSync('components/portal-private-image.tsx', 'utf8')
  assert.match(privateImage, /photo\?\.complete/)
  assert.match(privateImage, /photo\?\.complete && photo\.naturalWidth > 0 && imageSource/)
  assert.match(privateImage, /<img ref=\{image\}/)
})

test('a large portal gallery has a separate guarded image budget and a recoverable failed image', () => {
  const policies = readFileSync('lib/security/api-rate-limit.ts', 'utf8')
  const route = readFileSync('app/api/editor-workflow/[...path]/route.ts', 'utf8')
  const provider = readFileSync('components/portal-preview-cache.tsx', 'utf8')
  const privateImage = readFileSync('components/portal-private-image.tsx', 'utf8')
  assert.match(policies, /portalPhotoRead:\s*\{[^}]*limit:\s*500[^}]*windowSeconds:\s*5 \* 60/)
  assert.match(policies, /portal-photo-read[^\n]*portalDeviceId/)
  assert.match(route, /path\[2\] === 'file'\s*\? API_RATE_LIMITS\.portalPhotoRead/)
  assert.doesNotMatch(provider, /sources\.slice\(0,\s*24\)/, 'visible images should not be fetched twice by initial speculative warming')
  assert.match(provider, /usePortalCachedImage/)
  assert.match(privateImage, /usePortalCachedImage/)
  assert.match(privateImage, /Retrying photo/)
})

test('gallery previews can survive a page refresh in the private browser HTTP cache', async () => {
  let originRequests = 0
  const browserCache = new Map<string, Response>()
  const fetcher: typeof fetch = async (input, init) => {
    const key = String(input)
    if (init?.cache !== 'no-store' && browserCache.has(key)) return browserCache.get(key)!.clone()
    originRequests++
    const response = image()
    if (init?.cache !== 'no-store') browserCache.set(key, response.clone())
    return response
  }
  const firstPage = new PortalPreviewCache({ fetcher })
  assert.ok(await firstPage.load(photo(1), true))
  firstPage.clear()
  const refreshedPage = new PortalPreviewCache({ fetcher })
  try {
    assert.ok(await refreshedPage.load(photo(1), true))
    assert.equal(originRequests, 1, 'a refresh must not request the same fresh preview again')
    const route = readFileSync('app/api/editor-workflow/[...path]/route.ts', 'utf8')
    assert.match(route, /private, max-age=300, must-revalidate/)
    assert.match(route, /'cdn-cache-control': 'no-store'/)
    assert.match(route, /'vercel-cdn-cache-control': 'no-store'/)
  } finally { refreshedPage.clear() }
})

test('a 429 pauses queued previews instead of sending every image into the limit', async () => {
  let requests = 0
  const cache = new PortalPreviewCache({ maxConcurrent: 1, fetcher: async () => {
    requests++
    return requests === 1
      ? new Response('rate limited', { status: 429, headers: { 'Retry-After': '1' } })
      : image()
  } })
  try {
    const first = cache.load(photo(1), true)
    const second = cache.load(photo(2), true)
    await tick()
    assert.equal(requests, 1, 'the second image must wait while the first is rate limited')
    assert.ok(await first)
    assert.ok(await second)
    assert.equal(requests, 3)
  } finally { cache.clear() }
})

test('public portal photos do not validate a staff Supabase session on every request', () => {
  const middleware = readFileSync('lib/supabase/middleware.ts', 'utf8')
  const route = readFileSync('app/api/editor-workflow/[...path]/route.ts', 'utf8')
  assert.match(middleware, /const isPublicPortalApi = pathname\.startsWith\('\/api\/editor-workflow\/portal\/'\)/)
  assert.match(middleware, /isPublicPortalApi \|\|/)
  assert.match(route, /if \(path\[0\] === 'portal'\) return await handlePortal\(request, path\)[\s\S]*?requireWorkflowAuth/)
})
