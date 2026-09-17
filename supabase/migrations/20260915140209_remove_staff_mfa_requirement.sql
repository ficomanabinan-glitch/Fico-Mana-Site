begin;

-- Website-media uploads remain restricted by a short-lived server grant,
-- authenticated user identity, owner/admin membership, workspace status,
-- exact path, MIME type, and byte size. Only the authenticator-level check is
-- removed so the database matches the password-only staff login flow.
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
