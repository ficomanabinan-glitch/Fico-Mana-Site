begin;

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
      and p.expires_at <= clock_timestamp()
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
    and g.created_at <= clock_timestamp() - make_interval(days => s.retention_days)
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

create or replace function public.private_storage_summary(p_workspace uuid)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  result jsonb;
begin
  with indexed as (
    select split_part(storage_key,'/',8) as category,coalesce(file_size,0)::bigint as bytes
    from public.gallery_files
    where workspace_id=p_workspace and storage_status='available' and storage_provider='r2'
    union all
    select split_part(storage_key,'/',8),coalesce(file_size,0)::bigint
    from public.deliverable_files
    where workspace_id=p_workspace and storage_status='available' and storage_provider='r2'
  ), categories as (
    select category,count(*)::integer as files,coalesce(sum(bytes),0)::bigint as bytes
    from indexed group by category
  ), candidates as (
    select id,file_size from public.private_expired_raw_cleanup_candidates(p_workspace)
  )
  select jsonb_build_object(
    'fileCount',(select count(*) from indexed),
    'indexedBytes',coalesce((select sum(bytes) from indexed),0),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('category',category,'files',files,'bytes',bytes) order by bytes desc) from categories),'[]'::jsonb),
    'candidateFiles',(select count(*) from candidates),
    'candidateBytes',coalesce((select sum(file_size) from candidates),0),
    'retention',coalesce((
      select jsonb_build_object(
        'enabled',enabled,'days',retention_days,'lastStartedAt',last_started_at,
        'lastCompletedAt',last_completed_at,'lastResult',last_result
      ) from public.storage_retention_settings where workspace_id=p_workspace
    ),jsonb_build_object('enabled',false,'days',60))
  ) into result;
  return result;
end;
$$;

create or replace function public.claim_storage_retention_batch(p_secret text,p_limit integer default 1000)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  settings public.storage_retention_settings%rowtype;
  run_id bigint;
  candidates jsonb;
  candidate_count integer;
  candidate_bytes bigint;
begin
  select s.* into settings from public.storage_retention_settings s
  join public.workspaces w on w.id=s.workspace_id and w.slug='fico-mana' and w.status='active'
  where s.enabled=true and s.worker_secret_hash=encode(digest(p_secret,'sha256'),'hex')
  for update;
  if not found then return jsonb_build_object('enabled',false,'items','[]'::jsonb); end if;
  update public.storage_retention_settings set last_started_at=clock_timestamp(),updated_at=clock_timestamp()
  where workspace_id=settings.workspace_id;

  with eligible as (
    select c.id,c.booking_id,c.file_size,c.storage_key,c.preview_reference,c.thumbnail_reference
    from public.private_expired_raw_cleanup_candidates(settings.workspace_id) c
    order by c.portal_expired_at,c.id
    limit greatest(1,least(coalesce(p_limit,1000),1000))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'fileId',id,'bookingId',booking_id,'bytes',coalesce(file_size,0),
    'keys',to_jsonb(array_remove(array[storage_key,preview_reference,thumbnail_reference],null))
  )),'[]'::jsonb),count(*)::integer,coalesce(sum(file_size),0)::bigint
  into candidates,candidate_count,candidate_bytes from eligible;

  insert into public.storage_retention_runs(workspace_id,status,candidate_files,candidate_bytes)
  values(settings.workspace_id,'STARTED',candidate_count,candidate_bytes) returning id into run_id;
  return jsonb_build_object('enabled',true,'runId',run_id,'items',candidates);
end;
$$;

revoke all on function public.private_expired_raw_cleanup_candidates(uuid) from public,anon,authenticated;
grant execute on function public.private_expired_raw_cleanup_candidates(uuid) to service_role;
revoke all on function public.private_storage_summary(uuid) from public,anon,authenticated;
grant execute on function public.private_storage_summary(uuid) to service_role;
revoke all on function public.claim_storage_retention_batch(text,integer) from public,anon,authenticated;
grant execute on function public.claim_storage_retention_batch(text,integer) to anon,service_role;

commit;
