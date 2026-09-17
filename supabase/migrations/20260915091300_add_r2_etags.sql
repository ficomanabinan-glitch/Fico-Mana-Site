-- Persist the verified R2 entity tag used by RAW-gallery and final-delivery
-- registration. Existing legacy rows remain valid with a null ETag.
alter table public.gallery_files
  add column if not exists etag text;

alter table public.deliverable_files
  add column if not exists etag text;

comment on column public.gallery_files.etag is
  'Cloudflare R2 object ETag captured after upload verification.';

comment on column public.deliverable_files.etag is
  'Cloudflare R2 object ETag captured after upload verification.';

notify pgrst, 'reload schema';
