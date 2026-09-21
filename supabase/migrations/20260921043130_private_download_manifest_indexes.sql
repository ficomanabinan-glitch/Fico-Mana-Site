begin;

create index if not exists private_download_manifests_workspace_idx
  on public.private_download_manifests (workspace_id);

create index if not exists private_download_manifests_portal_idx
  on public.private_download_manifests (portal_id)
  where portal_id is not null;

commit;
