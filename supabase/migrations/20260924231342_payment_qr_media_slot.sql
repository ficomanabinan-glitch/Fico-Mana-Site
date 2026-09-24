begin;

-- Reuse the secured website-media upload pipeline for the public booking
-- payment QR. The bundled /bpi_qr.jpg remains the application fallback until
-- an administrator publishes a replacement.
alter table public.website_media_slots
  drop constraint if exists website_media_slots_slot_key_check;

alter table public.website_media_slots
  add constraint website_media_slots_slot_key_check check (
    slot_key in (
      'gallery_1', 'gallery_2', 'gallery_3', 'gallery_4', 'gallery_5',
      'gallery_6', 'gallery_7', 'gallery_8', 'gallery_9', 'gallery_10',
      'featured_video', 'payment_qr'
    )
  );

alter table public.website_media_slots
  drop constraint if exists website_media_slots_media_type_check;

alter table public.website_media_slots
  add constraint website_media_slots_media_type_check check (
    (slot_key like 'gallery_%' and media_type = 'image') or
    (slot_key = 'payment_qr' and media_type = 'image') or
    (slot_key = 'featured_video' and media_type = 'video')
  );

alter table public.website_media_upload_grants
  drop constraint if exists website_media_upload_grants_slot_key_check;

alter table public.website_media_upload_grants
  add constraint website_media_upload_grants_slot_key_check check (
    slot_key in (
      'gallery_1', 'gallery_2', 'gallery_3', 'gallery_4', 'gallery_5',
      'gallery_6', 'gallery_7', 'gallery_8', 'gallery_9', 'gallery_10',
      'featured_video', 'payment_qr'
    )
  );

commit;
