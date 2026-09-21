begin;

alter table public.private_download_manifests
  add column if not exists completion_payload jsonb not null default '{}'::jsonb;

alter table public.private_download_manifests
  drop constraint if exists private_download_manifests_kind_check,
  drop constraint if exists private_download_manifests_entries_check,
  drop constraint if exists private_download_manifests_check;

alter table public.private_download_manifests
  add constraint private_download_manifests_kind_check
    check (kind in ('PORTAL_ORIGINALS','PORTAL_DELIVERABLES','EDITOR_BATCH')),
  add constraint private_download_manifests_entries_check
    check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) between 1 and 9000),
  add constraint private_download_manifests_scope_check
    check (
      (kind = 'PORTAL_ORIGINALS' and portal_id is not null and raw_attempt_id is not null)
      or (kind = 'PORTAL_DELIVERABLES' and portal_id is not null and raw_attempt_id is null)
      or (kind = 'EDITOR_BATCH' and portal_id is null and raw_attempt_id is null)
    );

create or replace function public.resolve_private_download_manifest(p_manifest uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  manifest public.private_download_manifests%rowtype;
  portal public.client_portals%rowtype;
begin
  select m.* into manifest
  from public.private_download_manifests m
  join public.workspaces w on w.id=m.workspace_id and w.slug='fico-mana' and w.status='active'
  where m.id=p_manifest and m.token_hash=p_token_hash and m.status='PENDING'
    and m.expires_at > clock_timestamp();
  if not found then raise exception 'Download link is unavailable'; end if;
  if manifest.portal_id is not null then
    select * into portal from public.client_portals where id=manifest.portal_id;
    if not found or portal.status <> 'active' or (portal.expires_at is not null and portal.expires_at <= clock_timestamp()) then
      raise exception 'Portal is unavailable';
    end if;
  end if;
  return jsonb_build_object('id',manifest.id,'fileName',manifest.file_name,'entries',manifest.entries);
end;
$$;

create or replace function public.complete_private_download_manifest(
  p_manifest uuid,
  p_token_hash text,
  p_success boolean
)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  manifest public.private_download_manifests%rowtype;
  portal public.client_portals%rowtype;
  batch_item jsonb;
  job_ids uuid[];
  actor_id uuid;
  v_completed_at timestamptz := clock_timestamp();
begin
  select * into manifest from public.private_download_manifests
  where id=p_manifest and token_hash=p_token_hash for update;
  if not found or manifest.status <> 'PENDING' then return false; end if;

  if manifest.kind = 'EDITOR_BATCH' then
    actor_id := nullif(manifest.completion_payload->>'actorId','')::uuid;
    for batch_item in select value from jsonb_array_elements(coalesce(manifest.completion_payload->'batches','[]'::jsonb)) loop
      select coalesce(array_agg(value::uuid),'{}'::uuid[]) into job_ids
      from jsonb_array_elements_text(coalesce(batch_item->'jobIds','[]'::jsonb));
      if p_success then
        update public.editing_jobs
        set status='DOWNLOADED', downloaded_at=v_completed_at, downloaded_by=actor_id,
            download_locked_by=null, download_lock_expires_at=null, updated_at=v_completed_at
        where workspace_id=manifest.workspace_id and id=any(job_ids) and status='READY_FOR_EDITING';
        insert into public.workflow_audit_logs(
          workspace_id,actor_type,actor_id,action,batch_id,metadata
        ) values (
          manifest.workspace_id,'staff',actor_id::text,'BATCH_DOWNLOADED',
          nullif(batch_item->>'batchId','')::uuid,
          jsonb_build_object(
            'clientCount',jsonb_array_length(coalesce(batch_item->'jobIds','[]'::jsonb)),
            'bookingIds',coalesce(batch_item->'bookingIds','[]'::jsonb),
            'selectedPhotos',coalesce((batch_item->>'selectedPhotos')::integer,0),
            'delivery','cloudflare-worker'
          )
        );
      else
        update public.editing_jobs
        set download_locked_by=null, download_lock_expires_at=null, updated_at=v_completed_at
        where workspace_id=manifest.workspace_id and id=any(job_ids)
          and status='READY_FOR_EDITING' and download_locked_by=actor_id;
      end if;
    end loop;
  end if;

  update public.private_download_manifests
  set status=case when p_success then 'COMPLETED' else 'FAILED' end,
      completed_at=case when p_success then v_completed_at else null end,
      updated_at=v_completed_at
  where id=manifest.id;
  if manifest.raw_attempt_id is not null then
    perform public.finish_portal_raw_download(manifest.raw_attempt_id,p_success);
  elsif p_success and manifest.kind='PORTAL_DELIVERABLES' then
    select * into portal from public.client_portals where id=manifest.portal_id;
    if found then perform public.record_portal_first_download(manifest.workspace_id,portal.public_id); end if;
  end if;
  return true;
end;
$$;

create table if not exists public.storage_retention_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  retention_days integer not null default 60 check (retention_days between 30 and 365),
  worker_secret_hash text check (worker_secret_hash is null or worker_secret_hash ~ '^[0-9a-f]{64}$'),
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_result jsonb,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.storage_retention_settings enable row level security;
revoke all on public.storage_retention_settings from public, anon, authenticated;
grant all on public.storage_retention_settings to service_role;

insert into public.storage_retention_settings(workspace_id)
select id from public.workspaces where slug='fico-mana'
on conflict (workspace_id) do nothing;

create table if not exists public.storage_retention_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null check (status in ('STARTED','COMPLETED','FAILED','DRY_RUN')),
  candidate_files integer not null default 0,
  candidate_bytes bigint not null default 0,
  deleted_objects integer not null default 0,
  error text,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create index if not exists storage_retention_runs_workspace_created_idx
  on public.storage_retention_runs(workspace_id,created_at desc);

alter table public.storage_retention_runs enable row level security;
revoke all on public.storage_retention_runs from public, anon, authenticated;
grant all on public.storage_retention_runs to service_role;

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
    select g.id,g.file_size
    from public.gallery_files g
    join public.storage_retention_settings s on s.workspace_id=g.workspace_id
    where g.workspace_id=p_workspace and g.storage_status='available' and g.storage_provider='r2'
      and split_part(g.storage_key,'/',8) in ('raw','original')
      and g.created_at <= clock_timestamp() - make_interval(days=>s.retention_days)
      and exists (
        select 1 from public.editing_jobs j
        where j.workspace_id=g.workspace_id and j.booking_id=g.booking_id and j.status='DELIVERED'
      )
      and not exists (
        select 1 from public.client_portals p
        where p.workspace_id=g.workspace_id and p.booking_id=g.booking_id and p.status='active'
          and (p.expires_at is null or p.expires_at>clock_timestamp())
      )
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
    select g.id,g.booking_id,g.file_size,g.storage_key,g.preview_reference,g.thumbnail_reference,g.created_at
    from public.gallery_files g
    where g.workspace_id=settings.workspace_id and g.storage_status='available' and g.storage_provider='r2'
      and split_part(g.storage_key,'/',8) in ('raw','original')
      and g.created_at <= clock_timestamp() - make_interval(days=>settings.retention_days)
      and exists (
        select 1 from public.editing_jobs j
        where j.workspace_id=g.workspace_id and j.booking_id=g.booking_id and j.status='DELIVERED'
      )
      and not exists (
        select 1 from public.client_portals p
        where p.workspace_id=g.workspace_id and p.booking_id=g.booking_id and p.status='active'
          and (p.expires_at is null or p.expires_at>clock_timestamp())
      )
    order by g.created_at,g.id
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

create or replace function public.complete_storage_retention_batch(
  p_secret text,p_run_id bigint,p_file_ids uuid[],p_deleted_objects integer,p_success boolean,p_error text default null
)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  settings public.storage_retention_settings%rowtype;
  v_completed_at timestamptz := clock_timestamp();
begin
  select s.* into settings from public.storage_retention_settings s
  join public.storage_retention_runs r on r.workspace_id=s.workspace_id and r.id=p_run_id and r.status='STARTED'
  where s.worker_secret_hash=encode(digest(p_secret,'sha256'),'hex') for update;
  if not found then return false; end if;
  if p_success then
    update public.gallery_files set storage_status='deleted',updated_at=v_completed_at
    where workspace_id=settings.workspace_id and id=any(coalesce(p_file_ids,'{}'::uuid[])) and storage_status='available';
  end if;
  update public.storage_retention_runs
  set status=case when p_success then 'COMPLETED' else 'FAILED' end,
      deleted_objects=case when p_success then greatest(coalesce(p_deleted_objects,0),0) else 0 end,
      error=case when p_success then null else left(coalesce(p_error,'Retention run failed.'),500) end,
      completed_at=v_completed_at
  where id=p_run_id;
  update public.storage_retention_settings
  set last_completed_at=v_completed_at,
      last_result=jsonb_build_object(
        'runId',p_run_id,'success',p_success,'deletedFiles',coalesce(array_length(p_file_ids,1),0),
        'deletedObjects',case when p_success then greatest(coalesce(p_deleted_objects,0),0) else 0 end,
        'error',case when p_success then null else left(coalesce(p_error,'Retention run failed.'),500) end
      ),updated_at=v_completed_at
  where workspace_id=settings.workspace_id;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,metadata)
  values(settings.workspace_id,'system','storage-retention',
    case when p_success then 'R2_RETENTION_COMPLETED' else 'R2_RETENTION_FAILED' end,
    jsonb_build_object('runId',p_run_id,'fileIds',coalesce(to_jsonb(p_file_ids),'[]'::jsonb),'deletedObjects',coalesce(p_deleted_objects,0),'error',p_error));
  return true;
end;
$$;

revoke all on function public.private_storage_summary(uuid) from public,anon,authenticated;
grant execute on function public.private_storage_summary(uuid) to service_role;
revoke all on function public.claim_storage_retention_batch(text,integer) from public,anon,authenticated;
grant execute on function public.claim_storage_retention_batch(text,integer) to anon,service_role;
revoke all on function public.complete_storage_retention_batch(text,bigint,uuid[],integer,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_storage_retention_batch(text,bigint,uuid[],integer,boolean,text) to anon,service_role;

commit;
