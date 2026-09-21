# Private download and retention Worker

This Worker streams private ZIP downloads directly from Cloudflare R2. It also
contains the scheduled storage-retention job used by FICO MANA.

## Retention safety

- The schedule runs daily at 2:17 AM Asia/Manila (`18:17 UTC`).
- Retention is disabled by default in `storage_retention_settings`.
- The Worker also requires a `RETENTION_SECRET`; a missing secret is a no-op.
- Only RAW/original gallery files for delivered shoots with no active portal
  can be claimed.
- Enhanced, final-delivery, and print files are excluded.
- R2 objects are deleted before their database records are marked deleted.
- Every run is recorded in `storage_retention_runs` and `workflow_audit_logs`.

Before enabling retention, review the File Management storage summary and run a
fresh candidate query. Set the Worker secret and its SHA-256 hash in the database,
then change `enabled` only after the exact deletion scope has been approved.

## Verification

Run the Worker dry-run build before deployment:

```powershell
npx.cmd wrangler deploy --dry-run --config workers/private-downloads/wrangler.jsonc
```
