begin;

-- The value is a SHA-256 verifier for a separate 256-bit Worker secret. The
-- secret itself is kept only in the Cloudflare Worker secret store.
update public.storage_retention_settings s
set enabled = true,
    retention_days = 60,
    worker_secret_hash = '6db9af4f99dda24983bb9361d43cb616b5c34a9c52640dee2d992954725375fb',
    updated_at = clock_timestamp()
from public.workspaces w
where w.id = s.workspace_id
  and w.slug = 'fico-mana'
  and w.status = 'active'
  and s.enabled = false
  and s.retention_days = 60;

commit;
