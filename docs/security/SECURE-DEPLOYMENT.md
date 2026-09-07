# Release gate — security/performance pass

The user authorized deployment on 7 September 2026 and then explicitly approved the dedicated-key migration and any necessary portal-link renewal/Drive reconnection. The key gate has been addressed: read-only preflight found no existing portals, verified staff/MFA and core service-only access, and both missing production secrets have been added directly in Vercel. See [the migration record](KEY-MIGRATION-20260907.md) for execution status and recovery limitations. The compatible security patch can proceed through the existing production Git deployment; the separate architectural items below remain out of scope. Do not publish locally generated synthetic-credential test builds.

Initial Vercel inventory found dedicated `PORTAL_SIGNING_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY` entries absent. After explicit migration approval, independent 32-random-byte values were stored as Production secrets without revealing existing credentials. These values must be preserved during future code deployments and rollbacks.

## Required preflight

- Verify current staff have existing `workspace_members` entries in the active `fico-mana` workspace. Administrative accounts need trusted admin/owner claims plus database admin/owner membership. No request automatically creates membership now. Complete MFA enrollment before rollout; retain a separately controlled recovery administrator.
- Set `ALLOW_ADMIN_EMAIL_BOOTSTRAP=false` after initial claim provisioning. The email allowlist alone no longer grants normal access. `ALLOW_LOCAL_FILE_STORE` must be false in deployed environments; production ignores a true value.
- Verify the server-only `SUPABASE_SECRET_KEY` (or supported legacy service-role credential), public URL and publishable key are configured. Local sign-in currently lacks the server credential and rate-limit hash secret; do not bypass the login guard. Use a dedicated development project and ignored `.env.local`, not chat, screenshots or source files.
- Require separate `PORTAL_SIGNING_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_STATE_SECRET`, and `SECURITY_HASH_SECRET`. Generate each independently with at least 32 random bytes; the current length check is a minimum-length check, not an entropy proof. Startup rejects missing or identical keys. Keep the service key independent too.
- **Do not casually rotate signing/encryption keys.** A portal key change invalidates existing links/QR codes; an encryption key change makes existing encrypted Drive tokens unreadable. If the old deployment uses fallback/reused keys, stop rollout: plan client link reissue and controlled Drive reconnection or offline re-encryption, preserve an encrypted recovery copy under restricted access, and obtain approval. This pass retains the current version-1 AES-GCM format and valid signatures when the same dedicated keys are already used.
- Verify `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DRIVE_ALLOWED_EMAIL`, `RESEND_API_KEY`, the verified sending domain and existing OAuth callback URI. Do not send a test email without approval of the recipient/content.
- Verify shared `consume_api_rate_limit` and login-limit RPCs or configured Upstash are healthy. New aggregate lookup/session quotas and admin-mutation quotas use the existing RPC; no schema change is needed. Exercise legitimate shared-network and bulk-upload traffic before rollout.
- Verify effective RLS, table grants, function ACL/search paths and private Storage policies in the actual project. Historical migrations in Git are not proof they were installed. No migration was created or applied in this preservation pass.
- Run the negative tests and authenticated desktop/mobile comparison. Source-identical markup is not a replacement for rendered authenticated screenshots.

## Items requiring a separate approved scope

1. Private upload quarantine, clean-only promotion, retry/scan jobs and corresponding UI processing state. Requires schema/storage/provider/workflow changes. Existing optional scanner is **not** full quarantine; missing scanner still reports `not_configured`.
2. Actor/expiry-bound upload runs and transactional photo-selection persistence/compound relationship constraints. Requires additive database changes; current conditional selection lock and manifest checks are preserved.
3. Hashed RSVP lookup tokens and encrypted outbox material. Requires migration and compatibility/backfill plan; existing expiry and schedule invalidation remain.
4. Nonce/hash CSP migration with static rendering/cache verification. Existing CSP still allows inline scripts.
5. Coordinated historic customer-data purge. Snapshot files are removed from the working tree but Git history/clones retain them. Never force-push without an approved cleanup window, backup policy and clone/branch coordination.

## Deployment and recovery sequence

Use the approved sequence in the migration record for this rollout. The user requested online-session verification instead of copying production credentials into localhost. The UI/performance release was compared at matching 1920 x 1080 and 390 x 844 desktop/mobile viewports; the remaining security changes preserve loaded UI markup. Monitor authentication errors, 428/429/503 rates, portal/file access and reminder delivery. On regression, stop traffic-changing jobs and rebuild known compatible code with the current dedicated keys, or perform the approved reconnection on the selected deployment. Never drop tables, reset customer data or restore obsolete JSON snapshots. A code rollback cannot recover a lost encryption key. Backup coverage and broader security sign-off remain unverified, not implied by this compatible release.

Local commands: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit --prod --audit-level high`, `pnpm security:check`, `pnpm security:secrets`, `pnpm security:http`. Gitleaks 8.30.1: `gitleaks git --redact=100 --no-banner --log-opts="--all" .`. CI verifies the scanner archive checksum and scans full reachable history.
