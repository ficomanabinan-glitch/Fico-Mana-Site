import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import {
  DEFAULT_WEBSITE_MEDIA,
  PAYMENT_QR_SLOT_KEY,
  isWebsiteMediaGallerySlotKey,
  mergeWebsiteMedia,
} from '../lib/website-media.ts'

test('payment QR has a bundled fallback and never becomes a graduation gallery item', () => {
  const fallback = DEFAULT_WEBSITE_MEDIA.find((slot) => slot.slotKey === PAYMENT_QR_SLOT_KEY)
  assert.equal(fallback?.url, '/bpi_qr.jpg')
  assert.equal(isWebsiteMediaGallerySlotKey(PAYMENT_QR_SLOT_KEY), false)

  const merged = mergeWebsiteMedia([{
    slotKey: PAYMENT_QR_SLOT_KEY,
    url: 'https://example.supabase.co/storage/v1/object/public/website-media/payment-qr.webp',
    altText: 'Updated payment QR',
    fileName: 'payment-qr.webp',
    mimeType: 'image/webp',
    fileSize: 1024,
    updatedAt: '2026-09-24T23:00:00.000Z',
    isCustom: true,
  }])
  const paymentQr = merged.find((slot) => slot.slotKey === PAYMENT_QR_SLOT_KEY)
  assert.equal(paymentQr?.url, 'https://example.supabase.co/storage/v1/object/public/website-media/payment-qr.webp')
  assert.equal(paymentQr?.isCustom, true)
  assert.equal(merged.filter((slot) => isWebsiteMediaGallerySlotKey(slot.slotKey)).length, 5)
})

test('Package Manager securely publishes a replacement and the booking QR resolves it with a fallback', async () => {
  const [packagePage, manager, bookingQr, route, migration] = await Promise.all([
    readFile('app/admin/packages/page.tsx', 'utf8'),
    readFile('components/payment-qr-manager.tsx', 'utf8'),
    readFile('components/bpi-qr-display.tsx', 'utf8'),
    readFile('app/api/admin/website-media/route.ts', 'utf8'),
    readFile('supabase/migrations/20260924231342_payment_qr_media_slot.sql', 'utf8'),
  ])

  assert.match(packagePage, /<PaymentQrManager \/>/)
  assert.match(manager, /slotKey: PAYMENT_QR_SLOT_KEY/)
  assert.match(manager, /new tus\.Upload/)
  assert.match(manager, /authorization: `Bearer \$\{accessToken\}`/)
  assert.match(manager, /Publish new QR/)
  assert.match(manager, /Active on booking page/)
  assert.match(bookingQr, /useWebsiteMedia\(\)/)
  assert.match(bookingQr, /PAYMENT_QR_SLOT_KEY/)
  assert.match(bookingQr, /paymentQr\?\.url \|\| '\/bpi_qr\.jpg'/)
  assert.match(route, /canUseWorkflow\(access, 'admin'\)/)
  assert.match(route, /website_media_upload_grants/)
  assert.match(migration, /'featured_video', 'payment_qr'/)
  assert.match(migration, /slot_key = 'payment_qr' and media_type = 'image'/)
})

test('payment QR migration permits only an image slot and its matching upload grant', async () => {
  const db = new PGlite()
  await db.exec(`
    create table public.website_media_slots (
      slot_key text not null,
      media_type text not null,
      constraint website_media_slots_slot_key_check check (slot_key in ('gallery_1', 'featured_video')),
      constraint website_media_slots_media_type_check check (
        (slot_key like 'gallery_%' and media_type = 'image') or
        (slot_key = 'featured_video' and media_type = 'video')
      )
    );
    create table public.website_media_upload_grants (
      slot_key text not null,
      constraint website_media_upload_grants_slot_key_check check (slot_key in ('gallery_1', 'featured_video'))
    );
  `)
  await db.exec(await readFile('supabase/migrations/20260924231342_payment_qr_media_slot.sql', 'utf8'))
  await db.exec("insert into public.website_media_slots(slot_key,media_type) values ('payment_qr','image')")
  await db.exec("insert into public.website_media_upload_grants(slot_key) values ('payment_qr')")
  await assert.rejects(
    db.exec("insert into public.website_media_slots(slot_key,media_type) values ('payment_qr','video')"),
    /website_media_slots_media_type_check/,
  )
})
