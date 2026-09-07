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

Completed on 7 September 2026:

- Security implementation commit `f67ec76`, merged with the previously released UI changes in `fa088c28ccbfd9ddaa159f0fa89a6328a2e5f6c0`; pushed normally to main and the security branch.
- Vercel production deployment `B6p6XmujNWkzVvmZVZSCBctNVXwh` completed successfully with both new secrets.
- OAuth reconnection succeeded for the existing studio account. The console confirmed **Google Drive connected**, followed by **Drive settings saved — FICOMANA SHOOTS root verified**. Existing root folder ID and 30-day expiry setting were retained. No files or client folders were moved, created or removed.
- Existing administrator and editor sessions loaded their live dashboards successfully; the editor dashboard reported active editor access and no scheduled clients/batches. No new sign-in credentials were collected.
- Anonymous HTTP checks: public homepage 200; bookings, Drive settings and editor dashboard APIs 401 with private no-store caching and `nosniff`.
- Hosted GitHub Actions run `34084188906` completed successfully: verification/build, full-history secret scan and CodeQL. Local tests: 117 passed; typecheck/build/security HTTP checks passed; lint 0 errors and 35 existing warnings.
- A live desktop screenshot was reviewed (`artifacts/preservation/security-admin-desktop.png`, actual 2048 x 1111). The connected Chrome viewport override did not alter the captured size during this check, so no new pixel-identical desktop/mobile comparison is claimed for this security-only release. Earlier UI-release comparison files remain available; mobile captures requested at 390 x 844 have an actual captured height of 843 pixels. Security changes do not modify loaded UI markup beyond the already published explicit width/icon changes.

Google displayed its **app not verified / currently being tested** warning during consent. Reconnection is working, but this rollout does not claim that Google's external app verification/publishing requirements have been completed. No email was sent. No database schema, account, permission or policy was changed.

## Subsequent visual verification

After the additive new-admin preview release (`3a5f578`), per-tab browser emulation made exact viewport checks possible. Original admin/editor dashboards were compared against the earlier release screenshots at 1920 × 1080 and 390 × 843 with matching scrollbar conditions. Loaded layouts, styling and navigation remained visually unchanged; live admin booking/balance values had changed. Evidence is in ignored `artifacts/preservation/post-security-newadmin-original-*` files and the detailed record in `docs/NEW-ADMIN-PREVIEW.md`. The zero-booking/zero-portal inventory above is a point-in-time preflight observation, not a statement that production will remain empty. Browser emulation was removed afterward.
