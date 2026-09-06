# Fico Mana production security report

Date: 2026-09-07
Branch: `codex/editor-production`
Repository status: implemented and locally verified; production activation is still required.

## 1. Vulnerabilities found

### P0 - vulnerable application dependencies

- Affected: `package.json`, `pnpm-lock.yaml`.
- Risk: the prior Next.js `16.2.6` release was below the required patched floor,
  and the initial production audit reported 45 advisories, including 24 high
  severity advisories.
- Fix: upgraded Next.js and its ESLint configuration to `16.3.4`, updated
  Supabase libraries, added current `sharp` and `zod`, moved the shadcn CLI to
  development dependencies, and pinned the safe transitive browser database.
- Current verification: the production dependency audit reports no known
  vulnerabilities.

### P0 - middleware/proxy was too important to authorization

- Affected: protected admin, booking, financial, provisioning, notification,
  Google Drive, receipt, and editor workflow APIs.
- Risk: a direct crafted request could bypass navigation-level protection if a
  route did not repeat authentication and authorization.
- Fix: protected APIs now validate the Supabase user server-side, require
  owner/admin AAL2 by default, or resolve an authorized workspace membership and
  capability before using service-role operations. Proxy protection remains an
  additional layer, not the trust boundary.

### P0 - payment receipts used durable public references

- Affected: receipt upload/view flow and the `receipts` Storage bucket.
- Risk: payment proof may expose personal and financial information through a
  permanent public object URL.
- Fix: new uploads use opaque UUID references, private server-controlled object
  paths, strict content validation, and an admin-only endpoint that creates a
  120-second signed URL. The migration converts known legacy references without
  deleting existing objects. A supported Storage API script makes and verifies
  the bucket private.

### P0 - temporary/shared credential risk

- Affected: old test accounts and local/deployment environment configuration.
- Risk: known or shared passwords permit account takeover and make audit trails
  unreliable.
- Fix: no temporary or replacement account passwords remain in tracked
  source. The secret scanner and production startup validator reject exposed
  browser-side credential variables. Account deletion, password rotation, and
  session revocation must still be completed in the hosted Supabase project.

### P0 - service-role blast radius

- Affected: all server operations using Supabase administrative credentials.
- Risk: the service role bypasses RLS, so any unauthenticated or cross-tenant
  route reaching it could read or mutate private records.
- Fix: the key remains in a server-only module; routes authenticate, authorize,
  validate object scope, and validate origin before privileged operations. The
  tracked secret scan checks that credentials are not committed or browser
  exposed.

### P1 - admin accounts lacked enforced MFA progression

- Affected: admin login and privileged APIs.
- Risk: a stolen password could expose receipts, finances, bookings, staff data,
  and Drive access.
- Fix: owner/admin APIs require `aal2` by default. Valid AAL1 users are directed
  to a TOTP enrollment/challenge page rather than being treated as permanently
  unauthorized. Enrollment, success, and challenge failure are audited.

### P1 - public API abuse and expensive-operation abuse

- Affected: booking creation/lookup, receipt upload/access, RAW lookup/submission,
  portal verification/selection/download, editor uploads, and Drive operations.
- Risk: brute force, scraping, storage abuse, ZIP generation, and Drive quota
  exhaustion.
- Fix: endpoint-specific limits use a salted hash of IP and applicable user,
  workspace, booking, portal, or action dimensions. Upstash is the first tier;
  an atomic, service-role-only PostgreSQL RPC is the fallback. Critical writes
  fail closed in production, and rejected requests return `429` plus
  `Retry-After`.

### P1 - client/booking IDOR and BOLA paths

- Affected: booking detail APIs, public RAW submission, portal files,
  selections, downloads, and editor upload completion.
- Risk: modifying an identifier could expose or mutate another client's data.
- Fix: protected booking reads require staff authentication; public RAW
  submission requires matching booking identity details; portal files and
  selections are joined back to the portal booking; editor files are constrained
  to the workspace, batch, upload job, booking, expected Drive metadata, and
  authorized Drive destination.

### P1 - client-controlled business and upload data

- Affected: booking creation and receipt/RAW/thumbnail/edited-photo uploads.
- Risk: package price manipulation, unknown-field injection, spoofed MIME types,
  path traversal, malformed files, or registering a different Drive object.
- Fix: the server retrieves package name, price, selection limit, and slot type
  from the package table. Public deposits use the server's required value. Zod
  schemas reject unknown fields. Receipts and thumbnails must decode; photo/RAW
  signatures must match their extension; paths are Unicode-normalized and
  traversal-resistant. Edited uploads verify destination, name, size, and a
  streamed SHA-256 hash after Drive accepts the upload.

### P1 - CSRF, CORS, cache, and error leakage

- Affected: cookie-authenticated mutations and private responses.
- Risk: cross-site mutations, reflected CORS, CDN persistence of private data,
  and disclosure of database or integration diagnostics.
- Fix: state-changing routes validate exact trusted origins; arbitrary Origin
  reflection was removed; private/API responses are `private, no-store`; portal
  pages use `Referrer-Policy: no-referrer`; request IDs are present; production
  error responses are generic while detailed errors stay server-side.

### P2/P3 - operational hardening

- Fixes include redacted append-only audit events, upload file/byte quotas,
  production environment validation, dependency/secret/source checks, runtime
  HTTP checks, Dependabot, CodeQL, and documented Vercel Firewall rollout.
- The external malware scanner, stricter nonce-based CSP, optional portal email
  OTP, and richer anomaly alerting remain follow-up work or infrastructure
  dependencies.

## 2. Files changed

Major security changes are grouped below.

- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`: patched dependencies
  and repeatable security commands.
- `lib/auth-api.ts`, `lib/auth/admin.ts`, `lib/auth/workflow.ts`,
  `lib/supabase/server.ts`, `lib/supabase/middleware.ts`: server-validated
  sessions, AAL2, trusted app metadata, membership/capability enforcement, and
  proxy defense in depth.
- `app/admin/mfa/page.tsx`, `app/api/security/mfa-event/route.ts`: TOTP setup,
  challenge, redirect, and audit workflow.
- `app/api/receipts/upload/route.ts`, `app/api/receipts/[id]/route.ts`,
  `components/receipt-preview.tsx`, `lib/security/receipt-reference.ts`: opaque
  private receipt references and short-lived authorized access.
- `lib/security/api-rate-limit.ts`: reusable endpoint-specific distributed and
  database-backed rate limiting.
- `lib/security/schemas.ts`, `lib/security/file-validation.ts`,
  `lib/security/upload-scanner.ts`: strict schemas, image/RAW signatures,
  decoder checks, edited-upload metadata, and optional malware-scanner adapter.
- `lib/editor-workflow.ts`, `lib/google-drive.ts`,
  `app/api/editor-workflow/[...path]/route.ts`: workspace/booking scoping,
  path safety, quotas, portal isolation, Drive destination verification, and
  post-upload SHA-256 verification.
- `lib/client-portal.ts`, `app/api/portal/session/route.ts`,
  `app/portal/[id]/page.tsx`: HMAC validation, remembered-device HttpOnly cookie,
  signed-token removal from the browser URL, no-referrer behavior, and booking
  scoping.
- `lib/google-oauth.ts` and Drive API routes: independent encryption/state
  secrets, AES-256-GCM refresh-token protection, short state lifetime, account
  pinning, AAL2, rate limits, audits, and generic production errors.
- Booking, payment, sales, package, provisioning, notification, and schedule
  routes: server authorization, origin checks, authoritative package data,
  sanitized errors, and private caching.
- `proxy.ts`, `next.config.mjs`, `instrumentation.ts`,
  `lib/security/environment.ts`, `lib/security/request-security.ts`,
  `lib/security/error-response.ts`: response hardening, startup validation,
  security headers, request IDs, origin enforcement, and error handling.
- `lib/security/security-audit.ts`, `lib/security/audit-metadata.ts`: redacted
  audit events with bounded metadata.
- `.github/workflows/security.yml`, `.github/dependabot.yml`: CI build/test,
  dependency audit, secret check, CodeQL, and scheduled dependency updates.
- `scripts/security-check.mjs`, `scripts/secret-scan.mjs`,
  `scripts/security-http-check.mjs`, `scripts/harden-receipt-storage.mjs`:
  repeatable source, secret, runtime HTTP, and private Storage checks.
- `tests/security-hardening.test.ts`: security regression coverage.
- `.env.example`, `supabase/config.toml`, `docs/security/DEPLOYMENT.md`, and
  `docs/security/VERCEL_FIREWALL.md`: deployment configuration and runbooks.

## 3. Database changes

Migration: `supabase/migrations/20260906151436_production_security_hardening.sql`.

- Adds the explicit `onsite` workspace role.
- Adds `receipt_fingerprints.storage_path`, backfills recognizable public receipt
  paths, and converts related booking references to opaque API URLs.
- Adds `batch_upload_files.file_size` and a non-negative constraint.
- Adds `api_rate_limits` plus the atomic `consume_api_rate_limit` function.
- Adds indexed, append-only `security_audit_events`.
- Enables RLS and removes direct `anon`/`authenticated` grants from private
  application, workflow, finance, settings, and audit tables.
- Drops historical anonymous receipt read/upload policies.
- Recreates the secure pending-receipt trigger after the legacy-reference
  transition.
- Hardens reviewed `SECURITY DEFINER` functions with safe `search_path` settings
  and service-role-only execution.
- Adds read-only proof queries in `supabase/security-verification.sql`.

Storage bucket privacy is intentionally changed through
`scripts/harden-receipt-storage.mjs`, which uses the supported Supabase Storage
API, preserves objects, sets `public: false`, enforces a 5 MB maximum, and
applies the receipt MIME allowlist.

## 4. Environment variables

Required in production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (legacy fallback: `SUPABASE_SERVICE_ROLE_KEY`)
- `NEXT_PUBLIC_SITE_URL`
- `PORTAL_SIGNING_SECRET` (independent, at least 32 characters)
- `SECURITY_HASH_SECRET` (independent, at least 32 characters)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` (independent, at least 32 characters)
- `GOOGLE_OAUTH_STATE_SECRET` (independent, at least 32 characters)
- `GOOGLE_DRIVE_ALLOWED_EMAIL`
- `RESEND_API_KEY`

Recommended/conditional:

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `LOGIN_RATE_LIMIT_SECRET`, `LOGIN_AUDIT_HASH_SECRET`
- `SECURITY_ALLOWED_ORIGINS`
- `ADMIN_HOSTNAME`, `EDITOR_HOSTNAME`
- `ADMIN_ENFORCE_SUBDOMAIN`, `EDITOR_ENFORCE_SUBDOMAIN`
- `ADMIN_EMAILS` only as a temporary server-side bootstrap allowlist
- `RESEND_FROM_EMAIL`, `ADMIN_SECURITY_EMAIL`
- `MALWARE_SCANNER_URL`, `MALWARE_SCANNER_TOKEN`

No password, service key, OAuth secret, encryption key, or signing secret may be
placed in a `NEXT_PUBLIC_*` variable.

## 5. Manual configuration

### Supabase

1. Take a database backup.
2. Apply the migration in order.
3. Run `pnpm security:receipts` with the intended production project selected.
4. Run `supabase/security-verification.sql` in SQL Editor and retain the output.
5. Confirm public signup is disabled, password minimum is 12 with upper/lowercase,
   number and symbol requirements, secure password change is enabled, TOTP is
   enabled, and session timebox/inactivity settings match `supabase/config.toml`.
6. Set trusted `app_metadata.role` for owner/admin accounts and explicit
   workspace memberships for editor/onsite/staff.
7. Delete unused test accounts, assign unique passwords, and revoke old sessions.

### Vercel and Upstash

1. Remove any deployment variables such as
   `NEXT_PUBLIC_STAGING_ADMIN_PASSWORD` and other public credential variables.
2. Add the required environment variables to Production and appropriate Preview
   scopes without copying production secrets to untrusted previews.
3. Deploy a preview and test the complete booking-to-delivery workflow.
4. Stage the Firewall rules from `docs/security/VERCEL_FIREWALL.md` in log-only
   mode, observe normal traffic, tune thresholds, then publish deliberately.
5. Configure Upstash for the preferred distributed limiter; the database RPC is
   the fallback.

### Google Cloud

- Keep the web-client redirect URI exactly
  `https://admin.ficomana.com/api/integrations/google-drive/callback`.
- Keep OAuth credentials server-only and pin the allowed studio Google account.
- Retain `drive.file`; `drive.readonly` remains necessary because staff may put
  files into managed folders manually and the application then indexes them.
- Reconnect Drive after changing its token-encryption key.

### GitHub

- Allow the security workflow to run on pull requests and `main`.
- Enable code scanning/default security alerts and Dependabot alerts/updates.
- Enable GitHub secret scanning and push protection if the repository plan
  supports them.

### Resend

- Verify the sending domain and set `RESEND_FROM_EMAIL`.
- Set `ADMIN_SECURITY_EMAIL` to the private recipient for high-value login
  security alerts.

## 6. Security tests

Current local results:

- Security/unit/integration tests: 28 passed, 0 failed.
- TypeScript: passed.
- ESLint: 0 errors; 38 existing warnings remain.
- Production dependency audit: no known vulnerabilities.
- Tracked-file secret scan: passed across 264 text files.
- Security source checks: passed.
- Optimized Next.js `16.3.4` production build: passed.
- Production-server HTTP checks: passed for CSP/security headers, request IDs,
  private/no-store APIs, no reflected CORS, and hostile-origin rejection.
- Git whitespace validation: passed; Windows line-ending notices are informational.

Limitations: these tests did not apply changes to the hosted Supabase project,
inspect the live receipt bucket, publish Vercel WAF rules, delete accounts, revoke
sessions, or run a full third-party penetration test.

## 7. Remaining risks

- The code does not make the current hosted environment secure until the
  production migration and Storage script are successfully applied and verified.
- Any values currently stored under legacy public staging password variable
  names in local/Vercel configuration must be removed and the corresponding
  accounts/sessions rotated.
- The external malware scanner is optional and not configured by this repository;
  signature/decode checks are active, but they are not a malware verdict.
- Edited-photo resumable uploads go directly to Google Drive and are verified
  before being registered, but abandoned/failed Drive objects need an operational
  cleanup policy or quarantine-folder promotion workflow.
- Production CSP still requires `'unsafe-inline'` for framework/application
  compatibility. Moving to request nonces needs a separate rendering/cache test.
- Optional per-booking client email OTP is not yet implemented.
- Geographic anomaly detection and comprehensive alert aggregation require an
  observability/SIEM provider; current alerts focus on login activity.
- No application can be declared 100% secure. Dependencies, access lists, OAuth
  grants, logs, storage policies, and staff offboarding require ongoing review.

## 8. Deployment checklist

- [ ] Back up Supabase and record the current Vercel deployment ID.
- [ ] Remove public/test credential variables and rotate test/shared accounts.
- [ ] Add independent production secrets from `.env.example`.
- [ ] Apply the Supabase security migration.
- [ ] Run `pnpm security:receipts`.
- [ ] Run and save `supabase/security-verification.sql` results.
- [ ] Confirm hosted Auth/TOTP/session settings and staff role metadata.
- [ ] Run all commands in `docs/security/DEPLOYMENT.md`.
- [ ] Test booking, receipt review, provisioning, RAW upload, portal selection,
      editor download/upload, delivery, and Drive reconnection on Preview.
- [ ] Stage and review Vercel WAF rules in log-only mode.
- [ ] Deploy production, repeat HTTP checks, and monitor security/runtime logs.
