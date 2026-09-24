import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('website media contract preserves five defaults and supports ten gallery slots, one video, and the payment QR', async () => {
  const config = await readFile('lib/website-media.ts', 'utf8')
  const defaultGallerySlots = config.match(/slotKey: 'gallery_[1-5]'/g) ?? []
  const allowedGallerySlots = config.match(/^  'gallery_(?:[1-9]|10)',?$/gm) ?? []
  const videoSlots = config.match(/slotKey: 'featured_video'/g) ?? []

  assert.equal(defaultGallerySlots.length, 5)
  assert.equal(allowedGallerySlots.length, 10)
  assert.equal(videoSlots.length, 1)
  assert.match(config, /PAYMENT_QR_SLOT_KEY = 'payment_qr'/)
  assert.match(config, /WEBSITE_MEDIA_GALLERY_SLOT_KEYS/)
  assert.match(config, /createWebsiteMediaGalleryPlaceholder/)
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
  assert.match(gallery, /isWebsiteMediaGallerySlotKey\(slot\.slotKey\)/)
  assert.match(reels, /useWebsiteMedia\(\)/)
  assert.match(reels, /slot\.kind === 'video'/)
  assert.match(reels, /'\/breanna-reel\.mp4'/)
  assert.match(client, /catch\(\(\) => DEFAULT_WEBSITE_MEDIA/)
  assert.match(client, /cache: 'no-store'/)
})

test('admin media uploads are authorized, optimized, dynamic, resumable, and finalized server-side', async () => {
  const [route, page, migration, uploadAuthMigration, expansionMigration, passwordOnlyAuthMigration, optimizer, layout] = await Promise.all([
    readFile('app/api/admin/website-media/route.ts', 'utf8'),
    readFile('app/admin/media/page.tsx', 'utf8'),
    readFile('supabase/migrations/20260907180000_website_media_manager.sql', 'utf8'),
    readFile('supabase/migrations/20260906231248_fix_website_media_resumable_auth.sql', 'utf8'),
    readFile('supabase/migrations/20260907200000_expand_website_media_gallery_and_fix_tus.sql', 'utf8'),
    readFile('supabase/migrations/20260915140209_remove_staff_mfa_requirement.sql', 'utf8'),
    readFile('lib/website-media-image.ts', 'utf8'),
    readFile('app/admin/layout.tsx', 'utf8'),
  ])

  assert.match(route, /requireStaffAuth\(request\)/)
  assert.match(route, /canUseWorkflow\(access, 'admin'\)/)
  assert.match(route, /websiteMediaUpload/)
  assert.match(route, /website_media_upload_grants[\s\S]*insert/)
  assert.match(route, /expectedPrefix/)
  assert.match(route, /website_media_slots[\s\S]*upsert|from\('website_media_slots'\)\.upsert/)
  assert.match(route, /export async function DELETE/)
  assert.match(page, /new tus\.Upload/)
  assert.match(page, /authorization: `Bearer \$\{accessToken\}`/)
  assert.match(page, /apikey: getSupabaseKey\(\)/)
  assert.doesNotMatch(page, /x-signature/)
  assert.match(page, /chunkSize: 6 \* 1024 \* 1024/)
  assert.match(page, /Uploading \$\{percent\}%/)
  assert.match(page, /Add Gallery Photo/)
  assert.match(page, /Maximum 10 Photos/)
  assert.match(page, /optimizeWebsiteGalleryImage/)
  assert.match(optimizer, /MAX_GALLERY_EDGE = 2560/)
  assert.match(optimizer, /TARGET_ASPECT_RATIO = 4 \/ 5/)
  assert.match(optimizer, /cropWidth/)
  assert.match(optimizer, /canvas\.toBlob/)
  assert.match(optimizer, /'image\/webp'/)
  assert.match(page, /Try:/)
  assert.match(layout, /Website Media/)
  assert.match(migration, /alter table public\.website_media_slots enable row level security/)
  assert.match(migration, /revoke all on table public\.website_media_slots from anon, authenticated/)
  assert.match(migration, /'website-media',[\s\S]*true/)
  assert.match(uploadAuthMigration, /website_media_upload_grants/)
  assert.match(uploadAuthMigration, /can_upload_website_media/)
  assert.doesNotMatch(passwordOnlyAuthMigration, /auth\.jwt\(\) ->> 'aal'|aal2/)
  assert.match(passwordOnlyAuthMigration, /grant_row\.user_id = \(select auth\.uid\(\)\)/)
  assert.match(passwordOnlyAuthMigration, /member\.role in \('owner', 'admin'\)/)
  assert.match(uploadAuthMigration, /as restrictive[\s\S]*for insert/)
  assert.match(expansionMigration, /'gallery_10'/)
  assert.match(expansionMigration, /p_object_metadata ->> 'contentLength'/)
  assert.match(expansionMigration, /grant_row\.file_size = case/)
})
