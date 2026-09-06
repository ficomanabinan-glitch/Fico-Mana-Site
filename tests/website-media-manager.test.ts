import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('website media contract contains exactly five photos and one video', async () => {
  const config = await readFile('lib/website-media.ts', 'utf8')
  const gallerySlots = config.match(/slotKey: 'gallery_[1-5]'/g) ?? []
  const videoSlots = config.match(/slotKey: 'featured_video'/g) ?? []

  assert.equal(gallerySlots.length, 5)
  assert.equal(videoSlots.length, 1)
  assert.match(config, /DEFAULT_WEBSITE_MEDIA/)
  assert.match(config, /isCustom: false/)
})

test('public gallery and reel load managed media while keeping bundled fallbacks', async () => {
  const [gallery, reels, client] = await Promise.all([
    readFile('components/gallery.tsx', 'utf8'),
    readFile('components/reels.tsx', 'utf8'),
    readFile('lib/website-media-client.ts', 'utf8'),
  ])

  assert.match(gallery, /useWebsiteMedia\(\)/)
  assert.match(gallery, /slot\.kind === 'image'/)
  assert.match(reels, /useWebsiteMedia\(\)/)
  assert.match(reels, /slot\.kind === 'video'/)
  assert.match(reels, /'\/breanna-reel\.mp4'/)
  assert.match(client, /catch\(\(\) => DEFAULT_WEBSITE_MEDIA/)
  assert.match(client, /cache: 'no-store'/)
})

test('admin media uploads are authorized, rate limited, resumable, and finalized server-side', async () => {
  const [route, page, migration, layout] = await Promise.all([
    readFile('app/api/admin/website-media/route.ts', 'utf8'),
    readFile('app/admin/media/page.tsx', 'utf8'),
    readFile('supabase/migrations/20260907180000_website_media_manager.sql', 'utf8'),
    readFile('app/admin/layout.tsx', 'utf8'),
  ])

  assert.match(route, /requireStaffAuth\(request\)/)
  assert.match(route, /canUseWorkflow\(access, 'admin'\)/)
  assert.match(route, /websiteMediaUpload/)
  assert.match(route, /createSignedUploadUrl\(path\)/)
  assert.match(route, /expectedPrefix/)
  assert.match(route, /website_media_slots[\s\S]*upsert|from\('website_media_slots'\)\.upsert/)
  assert.match(page, /new tus\.Upload/)
  assert.match(page, /chunkSize: 6 \* 1024 \* 1024/)
  assert.match(page, /Uploading \$\{percent\}%/)
  assert.match(page, /Try:/)
  assert.match(layout, /Website Media/)
  assert.match(migration, /alter table public\.website_media_slots enable row level security/)
  assert.match(migration, /revoke all on table public\.website_media_slots from anon, authenticated/)
  assert.match(migration, /'website-media',[\s\S]*true/)
})
