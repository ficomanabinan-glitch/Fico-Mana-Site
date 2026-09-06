begin;

-- The admin may publish between one and ten gallery photos. Existing rows and
-- the five bundled fallback slots remain unchanged.
alter table public.website_media_slots
  drop constraint if exists website_media_slots_slot_key_check;

alter table public.website_media_slots
  add constraint website_media_slots_slot_key_check check (
    slot_key in (
      'gallery_1', 'gallery_2', 'gallery_3', 'gallery_4', 'gallery_5',
      'gallery_6', 'gallery_7', 'gallery_8', 'gallery_9', 'gallery_10',
      'featured_video'
    )
  );

alter table public.website_media_upload_grants
  drop constraint if exists website_media_upload_grants_slot_key_check;

alter table public.website_media_upload_grants
  add constraint website_media_upload_grants_slot_key_check check (
    slot_key in (
      'gallery_1', 'gallery_2', 'gallery_3', 'gallery_4', 'gallery_5',
      'gallery_6', 'gallery_7', 'gallery_8', 'gallery_9', 'gallery_10',
      'featured_video'
    )
  );

-- Supabase Storage evaluates TUS INSERT policies before writing the object.
-- At that point it provides {mimetype, contentLength}; after completion it may
-- provide {mimetype, size}. Accept either server-supplied size field while
-- preserving the exact server-issued grant, user, MFA, role and workspace checks.
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
        and lower(grant_row.mime_type) = lower(coalesce(
          p_object_metadata ->> 'mimetype',
          p_object_metadata ->> 'contentType',
          p_object_metadata ->> 'content-type'
        ))
        and grant_row.file_size = case
          when coalesce(
            p_object_metadata ->> 'contentLength',
            p_object_metadata ->> 'size',
            p_object_metadata ->> 'content-length'
          ) ~ '^[0-9]+$'
          then coalesce(
            p_object_metadata ->> 'contentLength',
            p_object_metadata ->> 'size',
            p_object_metadata ->> 'content-length'
          )::bigint
          else null
        end
        and grant_row.finalized_at is null
        and grant_row.expires_at > now()
        and member.role in ('owner', 'admin')
        and workspace.status = 'active'
    );
$$;

revoke all on function private.can_upload_website_media(text, jsonb) from public, anon, authenticated;
grant execute on function private.can_upload_website_media(text, jsonb) to authenticated;

commit;
