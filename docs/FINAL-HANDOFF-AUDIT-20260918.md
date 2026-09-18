# FICO MANA — final site handoff and verified audit

Date: 18 September 2026 (Asia/Manila)

This document supersedes the 17 September handoff where the current source or production state differs. It incorporates the supplied security/performance audit, validates its findings against the current repository, and separates production evidence from local-only work.

## 1. Executive status

FICO MANA is live and its current production artifact is `READY`. The deployed `main` branch contains the R2/Supabase cutover, Client Portals inside the Editor workspace, staff account management, booking-rate-limit migration, receipt/payment performance changes, and the hardened Admin/Editor workflows.

The release has a strong baseline: server-side Supabase authentication, workspace and capability authorization, trusted-origin checks, private R2 storage, signed access, object ownership validation, upload grants and checksums, private caching rules, audit events, security headers, Gitleaks, CodeQL, dependency checks, and a broad automated regression suite.

It is not yet the final security baseline. The highest remaining risks are aggregate abuse/resource quotas, an unsafe authentication callback redirect, the intentionally disabled production login limiter, high-memory large-file verification, private booking data persisted in browser storage, and unbounded staff/public booking reads.

The working tree also contains local changes that are not committed or deployed: the compact rounded storage-policy layout, a development-only Client Portals preview, and multi-device-safe staff sign-out.

## 2. Repository and deployment truth

- Workspace: `E:\zzzzFICO LOCAL\Fico-Mana-Staging`
- GitHub: <https://github.com/ficomanabinan-glitch/Fico-Mana-Site>
- Main branch: <https://github.com/ficomanabinan-glitch/Fico-Mana-Site/tree/main>
- Local branch: `codex/ui-consistency-portal-polish-20260908`
- Local `HEAD`, `origin/main`, and `origin/HEAD`: `921be822e6842ed52bf6164b6936bba58d261cc2`
- Commit: `release: move client portals to editor and harden operations`
- Vercel team/project: `ficomana1/fico-mana-site`
- Vercel project ID: `prj_IpgWwUPcd63YPnuhkQ8je5XXduKI`
- Current production artifact: `dpl_5Gvj1TiHgN8EUVtqiVDjo6J1PQGK`
- Artifact URL: <https://fico-mana-site-1day3q7e1-ficomana1.vercel.app>
- Current artifact status: `READY`
- Current function region shown in the build inventory: `bom1`
- Immediate prior production artifact: `dpl_3eQcCMQ498biMuCKK5kR8tzU8y5L`
- Prior artifact URL: <https://fico-mana-site-hz0z19hj0-ficomana1.vercel.app>

Current aliases attached to the production artifact:

- <https://www.ficomana.com>
- <https://ficomana.com>
- <https://admin.ficomana.com>
- <https://editor.ficomana.com>
- <https://newadmin.ficomana.com>
- <https://fico-mana-site.vercel.app>

Fresh HTTP checks returned `200` for the public site and the Admin/Editor entry points after their expected redirects. The canonical-domain concern from the supplied audit is therefore cleared for this artifact.

Required database target: Supabase project `psosdbnemnsspmsligpp`. The release record says this project was verified before the cutover. The current Vercel values are encrypted and were not decoded in this pass, so the project reference must be reverified before the next deployment rather than inferred from a local `.env.local` file.

Private file storage: Cloudflare R2. The production bucket remains private and the application uses temporary signed access. Retired Google Drive environment variables were removed during the cutover.

## 3. Product and ownership boundaries

### Public site — `ficomana.com`

- Packages, marketing content, booking calendar and reservation submission.
- Receipt upload and booking retry/recovery.
- Public sample Client Portal.

### Admin — `admin.ficomana.com`

- Bookings, clients, verification, payments, schedules, packages, sales, expenses, email and system settings.
- Staff/User Access management.
- Booking-related work stays in Admin.

### Editor — `editor.ficomana.com`

- Editing batches and client selection review.
- Client Portals and private storage policy.
- Onsite RAW upload, enhanced upload and delivery workflow.
- Files Management, including lazy metadata browsing, preview, upload and protected delete.

### Client Portal

- Private booking-specific gallery, included and extra selections, free-print assignments, add-ons, review, submission, production status and delivery.
- A portal is created by the onsite photo workflow, not immediately after booking.

## 4. Local work not committed or deployed

### 4.1 Compact rounded storage policy

Files:

- `app/admin/provisioning/page.tsx`
- `tests/client-portal-list.test.ts`

Changes:

- Private storage status and portal-expiry policy share one compact desktop row.
- The expiry input and Save Policy action align vertically.
- Save Policy no longer stretches across the card.
- Narrow layouts stack without overflow.
- Client Portal actions use the durable `rounded-control` token; browser-computed Save Policy radius is `10px`.

### 4.2 Development-only Client Portals preview

Files:

- `app/local-preview/client-portals/page.tsx`
- `app/local-preview/client-portals/local-preview-provider.tsx`

Local URL: <http://127.0.0.1:3100/local-preview/client-portals>

The preview renders the real Client Portals list component with safe empty sample data and no login screen. It calls `notFound()` outside development and does not weaken the real Admin or Editor authentication. Decide before release whether to keep it as an internal QA route or remove it from the feature commit.

### 4.3 Multi-device master/admin sessions

Files:

- `app/admin/actions.ts`
- `app/editor/actions.ts`
- `app/admin/layout.tsx`
- `components/editor-portal-shell.tsx`
- `components/new-admin/shell.tsx`
- `tests/multi-device-auth.test.ts`

Requirement: `master@ficomana.com` must be able to remain signed in on multiple authorized devices.

The local fix changes every staff sign-out call to Supabase `scope: 'local'`. Signing out or clearing a failed session on one browser therefore does not revoke valid sessions on other devices. The application contains no custom single-device session lock.

Still required before claiming live completion:

1. Verify Supabase Auth's **Single session per user** setting is disabled for project `psosdbnemnsspmsligpp`.
2. Deploy the local change through the normal candidate process.
3. Sign in with the master account on two controlled devices or browser profiles.
4. Confirm both can use authorized Admin/Editor routes concurrently.
5. Sign out on device A and confirm device B remains authenticated.

Do not record the master password in source, tests, screenshots or this handoff.

### 4.4 Generated file

`tsconfig.tsbuildinfo` is modified by local TypeScript runs. Do not include it in a feature commit.

## 5. Verification completed on the current working tree

- Full Node regression suite: **335 passed, 0 failed**.
- New multi-device sign-out regression: passed.
- Client Portals layout regressions: passed.
- TypeScript: passed.
- Focused ESLint over all changed application/test files: passed with no output.
- `git diff --check`: passed; only Windows LF-to-CRLF notices were reported.
- Production dependency audit: **no known vulnerabilities found**.
- Effective runtime dependency tree: Next.js `16.3.4`, React `19.2.4`, React DOM `19.2.4`.
- Repository security source checks: passed.
- Tracked-file secret scan: passed across 575 text files.
- Impeccable detector for the Client Portals layout: no findings.

Not run after the latest local-only changes:

- Production build.
- Playwright desktop/mobile suite.
- A live two-device master-session test.
- A new Vercel candidate, production log scan or promotion.
- Production load/stress tests.

## 6. Supplied audit — corrected finding status

### P0/P1 confirmed

#### A. Authentication callback accepts an unsafe `next` value

Status: **confirmed**.

`app/auth/callback/route.ts` concatenates the supplied `next` query value into the redirect without validating that it is an allowed same-origin application path. Add a strict local-path allow-list and regression tests for absolute URLs, scheme-relative URLs, encoded separators and unexpected destinations.

#### B. Production login throttling is disabled unless explicitly enabled

Status: **confirmed, with an owner-requested temporary exception**.

The limiter remains implemented behind `ADMIN_LOGIN_RATE_LIMIT_ENABLED`. That variable is absent from the current Production Vercel environment list, so the limiter is currently disabled. Earlier direction was to remove the 15-minute limit for now while retaining it in code. Do not silently re-enable it; obtain owner approval, then configure the flag and verify the database/Redis fallback before release.

#### C. Booking identity rotation can bypass the tight device/resource quotas

Status: **confirmed with nuance**.

The browser device cookie is signed and the database RPC atomically enforces 10 attempts per hour for a stable device. The booking API also hashes the client IP, but the `bookingCreate` key includes rotating booking/package dimensions and has no independent aggregate bucket. The separate pure-IP helper is not called. Clearing the device identity and rotating identifiers can therefore avoid the tight limits.

Required: keep the per-device rule, add an independent hashed-IP aggregate bucket, preserve fail-closed behavior, and test shared-network fairness, proxy header trust and concurrent bursts.

#### D. Receipt uploads lack an independent aggregate quota

Status: **confirmed**.

Receipts are capped at 5 MB, content-validated and rate-limited by IP plus booking ID. `receiptUpload` has no aggregate limit, byte budget or concurrency budget. Rotating booking references can avoid the tight resource-specific counter.

#### E. Editor/RAW uploads lack aggregate byte and concurrency quotas

Status: **confirmed**.

Per-file size, metadata, namespace, checksum and ownership checks exist. The current `editorUpload` policy permits up to 1,000 operations per hour and does not enforce per-user/workspace byte budgets or an upload-session concurrency ceiling before signed R2 grants are issued.

#### F. Large RAW verification can consume excessive memory

Status: **confirmed**.

`lib/raw-upload-server.ts` can read and hash up to 100 MB in server memory, and a legacy multipart application route also materializes uploaded bytes. Replace full-buffer verification with trusted R2 checksum metadata or bounded streaming where the security contract allows it.

#### G. Private booking data is persisted in browser `localStorage`

Status: **confirmed**.

The staff cache saves complete booking rows and notifications under `ficomana_bookings` and related keys. Sign-out clears them, but persistent storage increases exposure on shared or compromised devices. Move private reads to bounded memory/session caches, or persist only a minimal non-sensitive index with a documented retention policy.

#### H. Availability and dashboard reads do not scale with record count

Status: **confirmed**.

The public availability endpoint loads all matching booking rows with only a reduced column set. The Admin dashboard calls the complete booking list and aggregates in the browser. Introduce date-windowed availability queries, server-side aggregates and paginated staff reads.

#### I. CSP includes `unsafe-inline` for scripts

Status: **confirmed**.

Production removes `unsafe-eval` but keeps `script-src 'unsafe-inline'`. Move toward nonce/hash-based policy in a staged change because Next.js, analytics and inline bootstrapping must be tested together.

#### J. Malware scanning is optional

Status: **confirmed**.

The scanner accurately reports when no external service is configured, while signature/decode/content checks still run. Treat external scanning as a release decision for public receipts and staff photo uploads; do not label files malware-scanned when the service is absent.

#### K. Multipart cleanup is not automated end to end

Status: **confirmed operational gap**.

Explicit abort support exists, but no scheduled stale multipart-upload cleanup and monitoring job was found. Add bounded cleanup with age, workspace and prefix safeguards plus an audit trail.

### Partially confirmed or lower priority

- Aggregate portal protection is mixed: portal-session and lookup policies have broader aggregate buckets, while other read/download policies are resource-specific. Extend only after mapping legitimate gallery and download traffic.
- Next Router Cache uses five-minute dynamic/static stale times, but protected APIs remain authenticated/no-store and successful page snapshots are scoped to staff sessions. Review privacy and stale-action behavior rather than treating the setting alone as a data leak.
- Optional UI animation JavaScript and public media caching should be optimized from measured bundle/Lighthouse evidence, not by deleting motion indiscriminately.

### Cleared or corrected supplied findings

- **React/RSC dependency concern:** cleared for the current lockfile. The effective tree resolves React/React DOM `19.2.4`; `pnpm audit --prod --audit-level high` found no known vulnerabilities. Keep CI scanning because this can change.
- **Legacy Google Drive portal-expiry dependency:** no active runtime dependency was found. Old migrations contain historical references, but terminal migration `20260914142027_remove_retired_storage_contract.sql` removes the retired table and runtime scans are covered by regression tests.
- **Canonical `www.ficomana.com`:** verified attached to the current READY artifact and responding.
- **CodeQL/Gitleaks claims:** confirmed. `.github/workflows/security.yml` runs full-history Gitleaks, CodeQL security-extended, source/secret checks, dependency audit, lint, typecheck, tests, build and HTTP security checks.

### CI/security coverage still missing

The current workflow does not include dedicated OSV-Scanner, Semgrep OWASP rules, ZAP staging DAST, SBOM/provenance artifacts, or Lighthouse performance budgets. Add these incrementally; do not equate their absence with failure of the controls already tested.

## 7. Performance assessment

Positive current patterns:

- Next image optimization with AVIF/WebP and responsive sizes.
- Reserved image space and image-shaped skeletons.
- Lazy/deferred public media and bounded Client Portal background preview loading.
- Private portal images use short-lived signed URLs and a bounded in-memory blob cache.
- Staff page read caches deduplicate in-flight reads and remain scoped to the authenticated shell.
- Metadata folder browsing is lazy and does not download R2 originals merely to list files.
- Receipt retries reuse stored receipt references and avoid reuploading bytes.
- Vercel functions are currently built in `bom1`, close to the documented Mumbai database region.

Unresolved performance risks:

- Full booking-list transfer and client-side dashboard aggregation.
- All-record public availability reads.
- Full-buffer hashing/decoding for large uploads.
- Missing byte/concurrency budgets for presigned uploads.
- No measured production Core Web Vitals baseline or RUM INP data.
- No coordinated production capacity result; the earlier local development read-stress failure is not a production pass or fail.

Recommended performance order:

1. Record page/API baselines first: LCP, CLS and TBT in lab; field INP through RUM/CrUX; API p50/p95/p99, throughput and error rate.
2. Replace dashboard full reads with server aggregates and pagination.
3. Date-bound availability reads and add supporting indexes verified with `EXPLAIN`.
4. Add upload byte/concurrency accounting before issuing grants.
5. Stream or metadata-verify large-file checks.
6. Add Lighthouse and k6 budgets to CI against staging/dedicated test infrastructure.

Never load-test production without explicit operational coordination.

## 8. Remaining functional workflow evidence

The synthetic workflow record `FM-988057 — QA WORKFLOW TEST 20260917` previously reached the Editor Pending Review queue after booking, receipt, payment approval, onsite upload, portal email, client selection, print assignment and final submission.

Still not fully certified in that workflow:

- Editor approval/reopen after submission.
- Editing-batch archive download and source/print mapping inspection.
- Enhanced upload and retry-safe `ENHANCED <number> - <CLIENT NAME>` names.
- Confirmation that print filenames remain unchanged.
- Client final-delivery preview and downloads.
- Duplicate filename rejection and Files Management delete on disposable data.

Use only the clearly labeled synthetic record. Any cleanup of its booking, payment, portal or R2 objects requires a separate exact-target confirmation.

## 9. Recommended remediation and release sequence

Follow this order:

1. Fix and test the authentication callback redirect allow-list.
2. Decide whether the development-only preview should be retained; keep it production-inaccessible or remove it before commit.
3. Keep the local-scope multi-device sign-out change. Verify the Supabase single-session setting and perform the two-device test.
4. With owner approval, re-enable production login throttling and verify the fallback; otherwise record the temporary accepted risk and monitoring plan.
5. Add independent IP aggregate limits for booking and receipt endpoints, with byte/concurrency budgets for uploads.
6. Replace persistent private booking cache and bound availability/dashboard reads.
7. Replace large-buffer RAW verification and automate stale multipart cleanup.
8. Complete the synthetic review-to-delivery workflow and inspect production logs/storage/database state at each stage.
9. Run the full release gate: tests, typecheck, lint, build, secret scan, dependency scan, protected API checks, desktop/mobile browser smoke and focused accessibility checks.
10. Commit only scoped source/tests/docs; exclude `tsconfig.tsbuildinfo`.
11. Push, create an isolated production-target Vercel candidate without assigning domains, wait for `READY`, and test the exact artifact.
12. Scan representative authenticated, error and 5xx logs. Promote only the verified artifact, then recheck every custom domain and the two-device master session.

Suggested QA order:

`database-testing` → `api-testing` → `security-testing` → `agentic-browser-testing` → `accessibility-testing` → `performance-testing` → `release-readiness`.

## 10. Rollback criteria

Rollback if any of the following appears after promotion:

- Staff authentication or multi-device sessions fail unexpectedly.
- Signing out one device revokes unrelated valid devices.
- Booking/receipt retries regress or duplicate uploads reappear.
- Admin/Editor data is missing or crosses workspace boundaries.
- Client Portal selection, delivery or private images fail.
- R2 uploads cannot be indexed or verified.
- Sustained new 5xx responses, data-integrity errors or security regressions appear.

Deployment rollback must not delete Supabase records or R2 objects. Reassign the known-good artifact and verify all domains; handle data cleanup as a separate, exact-target operation.

## 11. Safety and ownership notes

- Do not expose service keys, passwords, portal signing secrets or client PINs.
- Do not use local `.env.local` as proof of the production Supabase target.
- Do not modify real client roles, payments, files or selections for testing.
- Do not perform destructive R2/Supabase cleanup as part of deployment rollback.
- Do not claim release completion from a successful build or a single HTTP `200`.
- Do not deploy the current working tree until its local-only changes are reviewed, committed and tested as an isolated candidate.

