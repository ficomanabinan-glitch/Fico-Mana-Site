import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import sharp from 'sharp'
import { loadTs } from './helpers/load-ts.ts'
import * as siteUrls from '../lib/site-url.ts'

const metadata = loadTs<typeof import('../lib/site-metadata.ts')>('lib/site-metadata.ts', {
  '@/lib/site-url': siteUrls,
})

test('social metadata uses one public HTTPS identity and a fully described static image', () => {
  assert.equal(metadata.siteUrl, 'https://www.ficomana.com')
  assert.equal(metadata.homepageUrl, 'https://www.ficomana.com/')
  assert.equal(metadata.homepageMetadata.alternates?.canonical, metadata.homepageUrl)
  assert.equal(metadata.rootMetadata.openGraph?.url, metadata.homepageUrl)
  assert.equal(metadata.rootMetadata.openGraph?.siteName, 'FICO MANA')
  assert.deepEqual(metadata.defaultOgImage, {
    url: 'https://www.ficomana.com/social/ficomana-homepage-v4.jpg',
    secureUrl: metadata.socialPreviewUrl,
    width: 1200, height: 630, type: 'image/jpeg',
    alt: 'FICO MANA homepage with the studio logo, graduation portrait, and The Portrait of Success headline',
  })
  assert.deepEqual(metadata.rootMetadata.openGraph?.images, [metadata.defaultOgImage])
  assert.deepEqual(metadata.rootMetadata.twitter?.images, [{
    url: metadata.socialPreviewUrl, alt: metadata.defaultOgImage.alt,
  }])
  assert.equal((metadata.rootMetadata.twitter as { card: string }).card, 'summary_large_image')
  assert.equal(metadata.rootMetadata.facebook, undefined, 'No fake Facebook application ID')
  assert.equal(metadata.rootMetadata.alternates, undefined, 'Homepage canonical stays page-scoped')
  const gallery = metadata.createPageMetadata({ title: 'Gallery', path: '/gallery' })
  assert.equal(gallery.alternates?.canonical, '/gallery')
  assert.equal(gallery.openGraph?.url, '/gallery')
})

test('committed preview is a compact, opaque sRGB 1200 x 630 JPEG', async () => {
  const bytes = await readFile('public/social/ficomana-homepage-v4.jpg')
  const image = await sharp(bytes).metadata()
  assert.equal(image.format, 'jpeg')
  assert.equal(image.width, 1200)
  assert.equal(image.height, 630)
  assert.equal(image.space, 'srgb')
  assert.equal(image.hasAlpha, false)
  assert.ok(bytes.length < 250_000)
})

test('homepage metadata is static and the old preview routes are preserved', async () => {
  const [page, layout, config, robots, proxy] = await Promise.all([
    readFile('app/page.tsx', 'utf8'), readFile('app/layout.tsx', 'utf8'),
    readFile('next.config.mjs', 'utf8'), readFile('app/robots.ts', 'utf8'),
    readFile('lib/supabase/middleware.ts', 'utf8'),
  ])
  assert.match(page, /export const metadata = homepageMetadata/)
  assert.match(layout, /export const metadata = rootMetadata/)
  assert.doesNotMatch(page + layout, /generateMetadata/)
  assert.match(config, /source: '\/social\/:file\*'/)
  assert.match(config, /public, max-age=31536000, immutable/)
  assert.match(robots, /userAgent: '\*',[\s\S]*allow: '\/'/)
  assert.match(proxy, /!isAuthCallback\) \{\s*return NextResponse.next\(\)/)
  assert.ok((await readFile('public/preview.png')).length > 0)
  assert.ok((await readFile('app/social-preview-v3.png/route.tsx')).length > 0)
})
