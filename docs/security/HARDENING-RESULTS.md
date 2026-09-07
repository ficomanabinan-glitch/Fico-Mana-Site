# Hardening and performance results

7 September 2026. Branch `codex/security-hardening-20260907`, baseline `056467a`.

**Compatible security changes are deployed; this is not a complete production security sign-off.** After the separate width/performance release `8bd808c` and icon removal `d12a227`, the owner approved the dedicated-key migration. Security commit `f67ec76` was merged with main in `fa088c2` and deployed through the existing Vercel project (`B6p6XmujNWkzVvmZVZSCBctNVXwh`). Two independent production secrets were added and the existing Drive account was reconnected; its unchanged root folder was verified through the app. No database schema, storage policy, DNS or staff account was changed by that security release, and no email or production data reset was performed. See [the migration record](KEY-MIGRATION-20260907.md). The requested isolated `newadmin` frontend was subsequently deployed in separate commit `3a5f578`; its dedicated CNAME was later added and Vercel configuration/HTTPS verified without changing existing DNS records. See [the presentation release record](../NEW-ADMIN-PREVIEW.md) for propagation and sign-in verification limits.

## Current findings disposition

| Finding | Local result | Remaining requirement |
| --- | --- | --- |
| FM-01 | Removed four tracked transactional JSON snapshots; added empty example, ignore rules and blocked snapshot paths in source scanning. | Customer data remains recoverable in Git history/clones; coordinated PII history cleanup and rotation review remain. Credential scanning is not a general PII detector. |
| FM-02 | Production local-file fallback/mirroring blocked; configured database absence remains authoritative; local stores require explicit development/test opt-in. | Verify all valid online workflows in a configured preview, including email history failure behavior. |
| FM-03 | Active canonical workspace membership required; no request-time recreation of revoked membership; email bootstrap opt-in only. Existing staff membership/MFA and authenticated dashboards verified during rollout. | MFA recovery and a full account-lifecycle exercise remain untested. |
| FM-04 | Admin capabilities through the editor workflow API require verified AAL2 too. Existing admin/editor dashboards loaded and core live RLS/grants were checked. | Populated onsite upload/retry workflows were not exercised during this non-mutating production verification. |
| FM-05 | Thumbnail URLs require an exact trusted HTTPS host, no redirects, bounded response size and timeout before using OAuth credentials. | Verify actual Google thumbnail variants with a connected preview; broader token lifecycle review remains. |
| FM-06 | Edited completion verifies job workspace and booking before reading Drive metadata. | Actor/expiry-bound upload runs need separately approved additive database work. |
| FM-07 | Receipt and thumbnail decoding bounded; corrected RAF signature handling; scanner redirects and external error disclosure blocked. | No complete quarantine/clean-only promotion. Missing scanner still reports not_configured. Provider, storage, schema, worker and processing-state UI changes need approval. |
| FM-08 | Production requires independent signing/encryption/security keys; malformed AES-GCM envelopes rejected. Dedicated portal/Drive keys installed and Drive reconnected/root verified after the approved preflight. | Preserve the current secrets during rollback; subsequent rotation still requires portal/token migration planning. |
| FM-09 | Portal workspace/booking relationships verified; gallery, deliverables, selections and jobs carry workspace predicates; negative ownership tests added. | Database compound constraints and transactional selection persistence remain separate scope. |
| FM-10 | Existing token expiry/invalidation preserved. | Raw RSVP material in delivery records and stored email HTML still requires hashing/encrypted-outbox migration. |
| FM-11 | Added shared aggregate public lookup/session quotas and administrator mutation quota; production missing-Origin mutation requests fail closed. | Verify shared limit service health and legitimate bulk/shared-network traffic; forwarded-IP trust and comprehensive actor quota coverage remain review items. |
| FM-12 | Central errors generate request IDs; diagnostic values and audit routes are redacted. | Not every legacy console log is routed through the central helper. Production log redaction, access, retention and alerting require verification. |
| FM-13 | Existing CSP preserved to avoid breaking static rendering. | Inline scripts remain allowed; nonce/hash rollout needs separate rendering/cache assessment. |
| FM-14 | CI actions pinned; checksum-verified full-history Gitleaks added; local reachable-history scan passed after a narrow public-key exception. Hosted verification, CodeQL and history scanning passed. | Repository protections and coordinated PII-history purge remain unverified. |
| FM-15 | Existing schema and policies preserved. Core workflow-table RLS/grants, three rate-limit function search paths/ACLs and two private storage buckets verified read-only in the actual production project. | Complete all-table/policy/ACL coverage and migration inventory remain separate checks before any approved forward hardening. |
| FM-16 | Booking PUT uses shared schema; email dispatch reloads canonical booking/payment; dynamic HTML values escaped. Existing admin transaction saves before dispatch. | Authenticated real workflow and recipient checks remain; no email was sent. |

## Performance and width

- Sidebar keeps the same links and rendered markup; routes prefetch on hover, focus or touch, deduplicated for 30 seconds.
- Sales, packages and editor caches keep their existing freshness rules. Old in-flight request completion cannot clear a newer request, and stale package reads cannot overwrite a confirmed edit.
- Existing loading skeletons, public routes, API contracts, auth flow, database schema, state management and integrations are retained.
- Explicit latest user exception: original admin/editor main content fills the available width beside the sidebar. Only `lib/admin-ui.ts`, `app/admin/layout.tsx` and `components/editor-portal-shell.tsx` change layout. Sidebar size, content padding, colors, typography, controls, dialogs and authentication forms are preserved.
- New width behavior is deployed in the separate release. The public website and client portal width are unchanged.

## Verification

| Check | Result |
| --- | --- |
| Frozen-lockfile dependency install | Passed; lockfile unchanged |
| `pnpm test` | 117 passed, 0 failed, including cache races, full-width constraints, package-icon preservation, authorization/upload boundaries and key-rotation cases |
| `pnpm typecheck` | Passed |
| `pnpm lint` | 0 errors, 35 existing warnings |
| `pnpm build` | Passed after width change; 71 generated static pages, unchanged route inventory |
| `pnpm security:check` | Passed |
| `pnpm security:secrets` | Passed |
| `pnpm security:http` | Passed again against the final local production build using synthetic test configuration |
| Production dependency audit | No known vulnerabilities reported at the time checked |
| Gitleaks 8.30.1 reachable history | 203 commits scanned locally; no remaining credential findings after one exact reviewed publishable-key exception; hosted history scan also passed |
| Real authenticated visual/workflow comparison | Original online admin/editor sessions compared at 1920 x 1080 and 390 x 844 after the width/performance release; empty views, not populated client workflows |
| Live cloud configuration and effective RLS | Production project URL verified; core workflow-table RLS/grants, three service-only rate-limit RPCs, staff/MFA and two private buckets verified read-only; not an all-table/policy audit |
| Measured speed/Core Web Vitals improvement | Not measured; no percentage claim |

Boundary tests execute actual helpers with explicitly isolated dependency fixtures; they do not prove effective production database/storage policies. The build used synthetic CI-only environment values and must not be uploaded as a production artifact.

Baseline screenshots are in ignored `artifacts/preservation/production-dashboard-1920x1080-before-width.png` and `production-dashboard-390x844-before-width.png`. After-state screenshots are `released-admin-1920x1080.png`, `released-admin-390x844.png`, `released-editor-1920x1080.png` and `released-editor-390x844.png` in the same folder. The requested admin desktop width expanded; editor/mobile appearance was preserved. No authentication bypass or cookie extraction was used.

## Release decision

The icon-only follow-up `d12a227` is also on main and deployed (`H1n68j1WqZaQLJWThtsyEsR2Bzjs`). Its release worktree passed 99 tests, typecheck, targeted lint and production build; the full-width release's hosted CI also passed. Live System Settings visually confirms the icon is gone while the heading, explanation and Manage Packages link remain; Drive reports Connected and email Configured. No test message was sent. Screenshot: `artifacts/preservation/system-package-card-after.png`.

The approved key migration and compatible release are complete. Read-only preflight found zero portals, verified existing staff/MFA and core service-only database controls; both dedicated production keys are stored in Vercel, Drive reconnection/root verification succeeded, and hosted CI passed all three jobs. See [the migration record](KEY-MIGRATION-20260907.md) for evidence and limitations. Quarantine, upload-run binding, RSVP storage, CSP and historic data cleanup remain explicit scope decisions because implementing them conflicts with the preservation restriction on schema, storage architecture or user flows.
