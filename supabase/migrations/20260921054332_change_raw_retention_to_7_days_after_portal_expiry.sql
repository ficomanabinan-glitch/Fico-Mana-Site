begin;

alter table public.storage_retention_settings
  drop constraint if exists storage_retention_settings_retention_days_check;

alter table public.storage_retention_settings
  alter column retention_days set default 7,
  add constraint storage_retention_settings_retention_days_check
    check (retention_days between 1 and 365);

update public.storage_retention_settings s
set retention_days = 7,
    updated_at = clock_timestamp()
from public.workspaces w
where w.id = s.workspace_id
  and w.slug = 'fico-mana'
  and w.status = 'active';

create or replace function public.private_expired_raw_cleanup_candidates(p_workspace uuid)
returns table (
  id uuid,
  booking_id varchar,
  customer_name text,
  booking_date date,
  portal_expired_at timestamptz,
  file_size bigint,
  storage_key text,
  preview_reference text,
  thumbnail_reference text,
  retention_days integer
)
language sql stable security invoker set search_path = public, pg_temp as $$
  select
    g.id,
    g.booking_id,
    coalesce(b.customer_name, g.booking_id)::text,
    b.booking_date,
    expired_portal.expires_at,
    coalesce(g.file_size, 0)::bigint,
    g.storage_key,
    g.preview_reference,
    g.thumbnail_reference,
    s.retention_days
  from public.gallery_files g
  join public.bookings b
    on b.workspace_id = g.workspace_id and b.id = g.booking_id
  join public.storage_retention_settings s
    on s.workspace_id = g.workspace_id
  join lateral (
    select max(p.expires_at) as expires_at
    from public.client_portals p
    where p.workspace_id = g.workspace_id
      and p.booking_id = g.booking_id
      and p.expires_at is not null
      and p.expires_at <= clock_timestamp() - make_interval(days => s.retention_days)
  ) expired_portal on expired_portal.expires_at is not null
  where g.workspace_id = p_workspace
    and g.storage_status = 'available'
    and g.storage_provider = 'r2'
    and split_part(g.storage_key, '/', 8) in ('raw', 'original')
    and (g.preview_reference is null or g.preview_reference = '' or (
      split_part(g.preview_reference, '/', 8) = 'preview'
      and split_part(g.preview_reference, '/', 7) = g.booking_id
      and split_part(g.preview_reference, '/', 2) = g.workspace_id::text
    ))
    and (g.thumbnail_reference is null or g.thumbnail_reference = '' or (
      split_part(g.thumbnail_reference, '/', 8) = 'thumbnail'
      and split_part(g.thumbnail_reference, '/', 7) = g.booking_id
      and split_part(g.thumbnail_reference, '/', 2) = g.workspace_id::text
    ))
    and exists (
      select 1
      from public.editing_jobs j
      where j.workspace_id = g.workspace_id
        and j.booking_id = g.booking_id
        and j.status = 'DELIVERED'
    )
    and not exists (
      select 1
      from public.client_portals p
      where p.workspace_id = g.workspace_id
        and p.booking_id = g.booking_id
        and p.status = 'active'
        and (p.expires_at is null or p.expires_at > clock_timestamp())
    );
$$;

revoke all on function public.private_expired_raw_cleanup_candidates(uuid) from public,anon,authenticated;
grant execute on function public.private_expired_raw_cleanup_candidates(uuid) to service_role;

commit;
