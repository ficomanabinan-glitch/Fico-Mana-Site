# Production key migration — 7 September 2026

## Authorization and scope

The owner explicitly approved the production security-key migration, portal-link renewal and Google Drive reconnection if needed. This does not authorize a database reset, history rewrite, account removal, authentication bypass or unrelated schema/storage changes.

The target is Vercel team `ficomana1`, project `fico-mana-site`, serving the existing `ficomana.com` consoles. The production public database URL was checked in Vercel and matches project `hrvyxxamxacosmbnkxwd`. The project's dashboard label includes TEST ENVIRONMENT, but the verified production configuration points to this project. The separate `ficomana.studio` site is out of scope.

## Read-only preflight

Verified in the project's privileged SQL Editor without changing database records:

- 0 bookings, 0 client portals, 0 active portals. There are no current portal links/QR codes to reissue.
- 1 active `fico-mana` workspace; 1 administrator with the required database membership and trusted admin claim; 1 administrator with verified MFA; 1 editor membership.
- 1 stored Drive connection. The live console shows the expected Google account and existing FICOMANA SHOOTS root folder. Preserve that root and every Drive file.
- `consume_api_rate_limit`, `check_admin_login_rate_limit` and `clear_admin_login_rate_limit` exist, are executable by `service_role` but not `anon`/`authenticated`, and have `search_path=public, pg_temp`.
- RLS is enabled and `anon`/`authenticated` SELECT is denied for `workspaces`, `workspace_members`, `google_drive_settings`, `client_portals`, `gallery_files`, `photo_selections`, `editing_jobs`, `deliverable_files`, `api_rate_limits` and `admin_login_rate_limits`.
- The `receipts` and `fico-mana-thumbnails` buckets are private. This inventory is not a full storage-policy or all-table security audit.

No customer records, staff accounts, policies or schemas were changed by these checks.

## Controlled rollout

1. Generate independent portal-signing and Drive-encryption keys using 32 random bytes each. Store them as **Secret**, **Production only**, directly in Vercel. Do not expose their values in logs, screenshots, chat, Git or local environment files. Preserve the existing OAuth-state and rate-limit keys.
2. Run key-rotation regression tests, the full suite, typecheck, source security checks and a synthetic-configuration build. Synthetic build output is never deployed.
3. Merge the compatible security patch with current main, retaining the published full-width/performance and package-icon changes. Push normally; let the existing Git integration build with production settings.
4. Confirm the deployment is Ready/current. Reconnect Drive through the authenticated admin OAuth flow with the same approved account. The callback updates only connection credentials; it does not create or move folders.
5. Verify the existing root folder through the application, then check admin/editor pages and hosted CI. No test email or client booking should be created as part of verification.

## Recovery and limits

The old deployment retains its immutable environment and old encrypted token remains in the database until reconnection succeeds. Do not disconnect first. After reconnection, the token is encrypted under the new key; promoting an old immutable deployment alone will not decrypt it. If code rollback is needed, rebuild the previous compatible code with the current dedicated keys, or repeat the approved OAuth reconnection on the selected deployment. Do not delete the new Vercel secrets during a code rollback.

No secret export, database restore point, provider-token revocation or independent Drive backup has been claimed. Key values are held only in the secret-entry session and Vercel. Broader quarantine, token-storage redesign, CSP nonces and historic-data cleanup remain documented separately, not silently included in this rollout.

## Execution status

Preflight completed; production secret entry and final release verification in progress. Record the confirmed commit, deployment, Drive verification and CI result here after completion.
