-- Receipt storage bucket + policies for deposit uploads (run in Supabase SQL Editor)
-- Prerequisite: migrations 002 and 003 should already be applied.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read (admin verification + customer preview)
drop policy if exists "Public read receipts" on storage.objects;
create policy "Public read receipts"
on storage.objects for select
to public
using (bucket_id = 'receipts');

-- Anonymous upload for new bookings (client-side uploadReceipt)
drop policy if exists "Anon upload receipts" on storage.objects;
create policy "Anon upload receipts"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'receipts');

-- Service role bypasses RLS; resubmit API uses admin client when SUPABASE_SERVICE_ROLE_KEY is set.
