begin;

-- Short-lived, server-issued grants let the browser use Supabase's supported
-- authenticated TUS flow without granting general write access to this bucket.
create table if not exists public.website_media_upload_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_key text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  expires_at timestamptz not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  constraint website_media_upload_grants_slot_key_check check (
    slot_key in ('gallery_1', 'gallery_2', 'gallery_3', 'gallery_4', 'gallery_5', 'featured_video')
  ),
  constraint website_media_upload_grants_mime_type_check check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm')
  ),
  constraint website_media_upload_grants_file_size_check check (
    file_size > 0 and file_size <= 262144000
  ),
  constraint website_media_upload_grants_path_check check (
    split_part(storage_path, '/', 1) = workspace_id::text
    and split_part(storage_path, '/', 2) = slot_key
    and storage_path !~ '(^|/)\.\.(/|$)'
  ),
  constraint website_media_upload_grants_expiry_check check (expires_at > created_at),
  constraint website_media_upload_grants_finalized_check check (
    finalized_at is null or finalized_at >= created_at
  )
);

create index if not exists website_media_upload_grants_user_active_idx
  on public.website_media_upload_grants(user_id, expires_at)
  where finalized_at is null;

alter table public.website_media_upload_grants enable row level security;
revoke all on table public.website_media_upload_grants from public, anon, authenticated;
grant all on table public.website_media_upload_grants to service_role;

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.can_upload_website_media(
  p_storage_path text,
  p_object_metadata jsonb
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (select auth.jwt() ->> 'aal') = 'aal2'
    and exists (
      select 1
      from public.website_media_upload_grants as grant_row
      join public.workspace_members as member
        on member.workspace_id = grant_row.workspace_id
       and member.user_id = grant_row.user_id
      join public.workspaces as workspace
        on workspace.id = grant_row.workspace_id
      where grant_row.storage_path = p_storage_path
        and grant_row.user_id = (select auth.uid())
        and grant_row.mime_type = coalesce(
          p_object_metadata ->> 'mimetype',
          p_object_metadata ->> 'contentType',
          p_object_metadata ->> 'content-type'
        )
        and grant_row.file_size = nullif(p_object_metadata ->> 'size', '')::bigint
        and grant_row.finalized_at is null
        and grant_row.expires_at > now()
        and member.role in ('owner', 'admin')
        and workspace.status = 'active'
    );
$$;

revoke all on function private.can_upload_website_media(text, jsonb) from public, anon, authenticated;
grant execute on function private.can_upload_website_media(text, jsonb) to authenticated;

-- The permissive policies grant only the requested operation. The restrictive
-- guards ensure a future broader Storage policy cannot bypass these checks for
-- website-media while leaving unrelated buckets unchanged.
drop policy if exists "website_media_granted_insert" on storage.objects;
create policy "website_media_granted_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'website-media'
  and (select private.can_upload_website_media(name, metadata))
);

drop policy if exists "website_media_insert_guard" on storage.objects;
create policy "website_media_insert_guard"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'website-media'
  or (select private.can_upload_website_media(name, metadata))
);

-- Storage currently returns the inserted object metadata. This matching SELECT
-- policy permits that response only while the exact upload grant is active.
drop policy if exists "website_media_granted_select" on storage.objects;
create policy "website_media_granted_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'website-media'
  and (select private.can_upload_website_media(name, metadata))
);

drop policy if exists "website_media_select_guard" on storage.objects;
create policy "website_media_select_guard"
on storage.objects
as restrictive
for select
to authenticated
using (
  bucket_id <> 'website-media'
  or (select private.can_upload_website_media(name, metadata))
);

commit;
