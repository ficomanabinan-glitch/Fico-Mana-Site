begin;

-- A single original is independent of the two weekly bulk-transfer slots.
-- The API authorizes the exact portal/file before creating this manifest;
-- the private Worker still requires its one-use token and active portal.
alter table public.private_download_manifests
  drop constraint if exists private_download_manifests_kind_check,
  drop constraint if exists private_download_manifests_scope_check;

alter table public.private_download_manifests
  add constraint private_download_manifests_kind_check
    check (kind in ('PORTAL_ORIGINALS','PORTAL_ORIGINAL_SINGLE','PORTAL_DELIVERABLES','EDITOR_BATCH')),
  add constraint private_download_manifests_scope_check
    check (
      (kind = 'PORTAL_ORIGINALS' and portal_id is not null and raw_attempt_id is not null)
      or (kind in ('PORTAL_ORIGINAL_SINGLE','PORTAL_DELIVERABLES') and portal_id is not null and raw_attempt_id is null)
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
  return jsonb_build_object('id',manifest.id,'kind',manifest.kind,'fileName',manifest.file_name,'entries',manifest.entries);
end;
$$;

revoke all on function public.resolve_private_download_manifest(uuid,text) from public, anon, authenticated;
grant execute on function public.resolve_private_download_manifest(uuid,text) to anon, service_role;

commit;
