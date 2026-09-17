# FICO MANA R2 migration release risk matrix

Date: 2026-09-14

Scope: the production Client Portal, Admin, Editor, Filtering Dashboard, Cloudflare R2 storage, Supabase metadata/functions, email notifications, and retained booking/selection/print/payment behavior.

## Scored risks

| ID | Risk | Impact | Probability | Score | Zone | Required testing |
| --- | --- | ---: | ---: | ---: | --- | --- |
| R1 | A portal or staff request can sign an object belonging to another booking/workspace | 5 | 4 | 20 | Critical | Full authorization matrix, IDOR negatives, provider-backed isolated smoke |
| R2 | Existing external-only photo records are dropped or falsely marked available before binaries reach R2 | 5 | 4 | 20 | Critical | Forward migration fixtures, preflight counts, reconciliation, backup and recovery rehearsal |
| R3 | Direct/multipart upload publishes an incomplete, wrong-sized, wrong-type, or wrong-checksum object | 5 | 4 | 20 | Critical | Unit, API, multipart retry/abort, confirmation, and controlled load tests |
| R4 | Source-to-selection-to-enhanced-to-print mapping changes or filenames collide | 5 | 4 | 20 | Critical | Relational mapping, duplicate, reservation, print-name, and end-to-end workflow tests |
| R5 | App and database are promoted in the wrong order | 5 | 3 | 15 | Critical | Additive compatibility migration, preview deployment, schema contract, rollback runbook |
| R6 | R2 credentials, signed URLs, or arbitrary object keys reach browser data, logs, or persistent tables | 5 | 3 | 15 | Critical | Secret scan, bundle/env inspection, schema assertions, API abuse and log-redaction tests |
| R7 | 100–150 photo galleries or large day uploads exceed browser memory, R2 CORS, or Vercel limits | 4 | 4 | 16 | Critical | Gallery/network budgets, direct-upload progress, concurrency, multipart, and ZIP tests |
| R8 | Drive-era UI/email/actions remain and send staff or clients into a dead flow | 3 | 4 | 12 | High | Repository regression search, component/email assertions, staff/client exploratory pass |
| R9 | Portal expiry and storage retention are accidentally coupled | 4 | 3 | 12 | High | SQL function tests, expiry boundary tests, retained-object verification |
| R10 | Delete/reset removes shared or wrong-booking objects or leaves published metadata | 5 | 3 | 15 | Critical | Ownership checks, derivative cleanup, partial-failure and idempotency tests |
| R11 | Staff/client accessibility or browser compatibility regresses in changed upload/gallery controls | 3 | 3 | 9 | Medium | Axe, keyboard, screen-reader semantics, Chrome/Edge/Firefox/mobile smoke |
| R12 | R2/Resend/Supabase transient failure leaves a misleading terminal status | 4 | 3 | 12 | High | Fault injection at service boundaries, retry/idempotency, recovery UI tests |

## Failure mode analysis for scores 10 and above

### R1 — Cross-client object access

- **Trigger:** An endpoint accepts an arbitrary booking, asset ID, or storage key without proving the authenticated portal/staff relationship.
- **Blast radius:** Private client photographs across a workspace.
- **Detection:** Negative API tests for every role, signed-URL target inspection, audit-event review.
- **Current mitigation:** Server-side auth helpers, deterministic keys, private bucket, short-lived signed URLs.
- **Gap:** Complete route-by-route authorization coverage and a provider-backed isolated check are not yet proven.

### R2 — Legacy asset loss during cutover

- **Trigger:** Destructive columns/tables are dropped before old binaries are inventoried and copied.
- **Blast radius:** Any current portal/editor job whose object exists only in the retired provider.
- **Detection:** Hosted preflight counts, migration-required reconciliation, client/job sampling.
- **Current mitigation:** New metadata can represent `migration_required` rather than fake availability.
- **Gap:** The draft migration removes provider identifiers before live inventory and binary migration are verified.

### R3 — Incomplete or corrupt uploads

- **Trigger:** Browser callback is trusted without R2 object metadata, checksum/size validation, or correct multipart completion.
- **Blast radius:** One file to an entire graduation batch; lost production time and delayed delivery.
- **Detection:** Object confirmation, checksum mismatch tests, incomplete part and retry tests.
- **Current mitigation:** Server-generated keys, expected checksums, object metadata, multipart session rows.
- **Gap:** Full tests for expiration, abort/cleanup, checksum semantics, and replay remain incomplete.

### R4 — Mapping/filename regression

- **Trigger:** Storage refactor changes source-relative paths, reservation semantics, or selection relationships.
- **Blast radius:** Wrong client edits/prints/deliverables and incorrect extra-photo charges.
- **Detection:** Stable synthetic manifests, duplicate filenames across folders, complete selection-to-delivery test.
- **Current mitigation:** Relational selections and stored source paths/checksums.
- **Gap:** Several remaining tests still model Drive identifiers and cannot prove the R2 path yet.

### R5 — App/schema deployment mismatch

- **Trigger:** Application expects R2 columns before migration, or migration drops old fields while a prior deployment is serving.
- **Blast radius:** All storage-backed staff and portal operations.
- **Detection:** Old-app/new-schema and new-app/old-schema contract checks in an isolated database.
- **Current mitigation:** Vercel immutable deployments and Supabase migration history.
- **Gap:** The current draft is not safely reversible and combines additive and destructive changes.

### R6 — Credential/key exposure

- **Trigger:** R2 secrets receive a public prefix, are imported by a client component, logged, or returned by an API; browser supplies unrestricted keys.
- **Blast radius:** Entire private bucket.
- **Detection:** Secret and bundle scans, route schema fuzzing, log review.
- **Current mitigation:** Central server-only R2 client and storage-key builders.
- **Gap:** Every route and generated response has not yet been tested against this invariant.

### R7 — High-volume performance failure

- **Trigger:** Full originals load in gallery cards, too many URLs are signed at once, uploads traverse Vercel, or ZIPs are buffered in memory.
- **Blast radius:** High-volume graduation sessions and editors working by day/week/month.
- **Detection:** Network request/byte budgets, browser memory/time measurements, upload and ZIP load tests.
- **Current mitigation:** Thumbnail/preview derivatives, pagination, direct uploads, multipart support.
- **Gap:** No committed performance suite or measured release thresholds yet.

### R8 — Dead provider workflow remains visible

- **Trigger:** Legacy component, email action, link field, help text, script, or fixture survives.
- **Blast radius:** Clients cannot submit; staff cannot review or deliver; support burden rises.
- **Detection:** Active-source regression search plus rendered UI/email checks.
- **Current mitigation:** Central R2 workflows are being introduced.
- **Gap:** Active references remain in booking, filtering, email, onsite/editor, and security code.

### R9 — Portal expiry deletes or exposes assets incorrectly

- **Trigger:** Expiry trigger depends on removed booking URL fields/settings or storage retention is treated as access expiry.
- **Blast radius:** Premature access loss or excessive access duration.
- **Detection:** Boundary-time SQL tests and post-expiry object-retention checks.
- **Current mitigation:** Portal expiry is represented in `client_portals`.
- **Gap:** Older functions and fixtures still couple expiry to the former provider schema.

### R10 — Unsafe delete/reset

- **Trigger:** A cleanup request trusts a key, ignores shared references/derivatives, or partially removes R2 while metadata remains available.
- **Blast radius:** Wrong booking files removed or storage/database divergence.
- **Detection:** Cross-booking ownership, idempotency, partial-failure, and orphan-reconciliation tests.
- **Current mitigation:** Deterministic booking prefixes and metadata checks.
- **Gap:** Equivalent R2 tests must replace deleted cleanup coverage.

### R12 — Misleading status after dependency failure

- **Trigger:** R2, Supabase, or Resend fails between object and status transitions.
- **Blast radius:** Stuck jobs, duplicate sends/uploads, or false delivery state.
- **Detection:** Service-boundary fault injection and retry/recovery assertions.
- **Current mitigation:** Uploading/available/failed states and retry-capable workflows.
- **Gap:** Transaction boundaries and recovery behavior need complete automated coverage.

## Coverage alignment and release work

| Priority | Gap | Owner | Target |
| --- | --- | --- | --- |
| P0 | Remove every active Drive-era backend/frontend/email/schema reference and restore equivalent R2 behavior | Developer/Codex | Before preview |
| P0 | Split or otherwise prove safe the destructive migration; inventory/copy all live legacy binaries first | Owner + Developer/Codex | Before production migration |
| P0 | Add complete R2 auth, upload confirmation, multipart, mapping, expiry, and delete tests | Developer/Codex | Before preview |
| P0 | Run isolated Admin to Onsite to Client to Review to Editor to Delivery journey | Owner + Developer/Codex | Before production |
| P1 | Add provider-backed R2 CORS/signed URL/multipart smoke tests using synthetic data | Developer/Codex | Before production |
| P1 | Add gallery/upload performance budgets and execute controlled batch tests | Developer/Codex | Before production |
| P1 | Execute accessibility and cross-browser checks on changed screens | Developer/Codex | Before production |
| P1 | Verify Resend notifications with a synthetic booking and approved recipient | Owner + Developer/Codex | Before production |

## Coverage rule

- **Critical:** automate service boundaries and full happy/error journeys, run controlled load tests where relevant, and manually explore each release.
- **High:** automate the happy path and top error/retry paths, then perform a focused staff/client review.
- **Medium:** automate the happy path where stable and include it in browser/accessibility smoke checks.

## Reassessment

- Re-score within 48 hours of a production incident or serious staging near-miss.
- Re-score whenever R2, Supabase, Vercel, authentication, upload limits, selection rules, or delivery behavior changes.
- Review quarterly even without an incident.
