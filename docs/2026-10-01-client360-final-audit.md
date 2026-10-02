# FICO MANA — Client 360 implementation and release evidence

Date: 1 October 2026, Asia/Manila. Status: **local release candidate; not deployed; full-brief release gate is not certified**. This report records actual work and its limits. It must not be interpreted as a 90% certificate or hosted-service verification.

## Latest resumed evidence — expiry repair (supersedes pending expiry/private cases below)

**Latest continuation on the same combined artifact:** original scoped110/110 passes115.133703s and private6/6 passes12.467869s; separate runs,0retries/skips/flaky/unexpected/runnererrors. Nonincremental types/sourceguards/refreshed732-file secret scan pass before final documentation. Main reviewed new Onsite390/Batch768 screenshots. These supersede the pending combined-regression and Editor screenshot items below. The additional read-only requirement audit reclassifies optional hosted/exhaustive assurance and maps existing portal controller/security evidence; see current requirements-audit section. Remaining explicit gates are honest quality verdict, finite named/context/contrast evidence, comparable performance before/after or honest non-comparability, and final synthesis. Neither90%certification nor deployment is claimed.

**Latest combined recovery supersedes the counts below:** optimized artifact `GYoSlVXjXI2VExpUOPZ-S` builds/types successfully; complete unit/integration503/503 pass37.5906164s. Admin Packages/Sales6/6 browser GREEN25.336253s and Editor Onsite/Batches/Upload History/Batch Detail16/16 GREEN40.803779s follow unchanged RED6/16 respectively. Widths390/768/1440 plus four malformed-success Editor cases, no retries/skips/flaky/runnererrors. Both exact JSON reports are under `test-results/*service-recovery-green-report.json`; fixtures prevented hosted/business-transfer writes. Unknown reads no longer become false empty/zero/missing work; last-known metadata and filters survive refresh failure. Full lint0errors24warnings; source guards/731-file secret scan pass before final docs/test-adapter changes. Original110/private6 are still historical `MuVM` browser evidence, pending rerun on the combined artifact. Main reviewed two Admin screenshots; newest Editor visual review pending. Repeated Sales failure toasts remain a bounded polish item. Full-brief90%gate, independent reassessment and production validation remain unmet. Paused at14%primary remaining; see latest usage checkpoint for precise restart instructions. No deployment occurred.

Fresh optimized build `MuVMcspXRR2Js2__pzuEF` passes (compile5.7s/types34.7s,76static pages);497/497 complete unit/integration tests pass in36.0982577s, zero failures/skips. Full lint0errors/24retainedwarnings, scopedlint/types/sourceguards and722-file secret scan pass. The typed expiry repair has eleven behavioral regressions covering actual workflow/API/SSR, exact deadline, expired status, ownership/provider denial, active revision, quota/malformed denial, ten deterministic reads and in-memory revert. Before repair5/11 failed for the reproduced generic500/SSR message; after repair11/11 pass. No private downstream reads follow expired/ownership denial.

Private client-rendered checks now pass6/6 at390/768/1440 in11.682825s on this build,0retries/skips/flaky/unexpected. Expired response is safe410/PORTAL_EXPIRED with one studio-contact instruction, not the old generic500. Forty-two interceptedAPIcalls, zero hosted/content/download calls, guard violations or unexpected console/page errors. Exact report `test-results/private-portal-expiry410-six-report.json`; root inspected phone/desktop expiry screenshots. Full original scoped110 rerun also passes110/110 in92.224877s with0skips/flaky/unexpected and no runnererrors (`test-results/expiry-repair-scoped-110-report.json`). These are separate runs, not one116-case invocation. Earlier scores remain historical; none is raised automatically. See `2026-10-01-portal-expiry-response-repair.md` and current private results for scope and human-review limits.

No production mutation, commit, push or deployment occurred. Full-brief release remains conditional on the outstanding evidence and honest independent assessment.

## Baseline and scope

Source: the owner's 43-section Agentic UX / Client 360 implementation brief, attachment SHA-256 `285BC481D9669A2AEDA5491694BCAB2E2170792DD250542FB7BB6235707D01A6`.

Baseline: 426 unit/integration and 36 browser cases passed. Baseline Nielsen totals were Public 26/40, Admin 21/40, Editor 28/40, Portal 30/40. Technical totals were 13/20, 13/20, 15/20, 15/20. Some authenticated baseline evidence was source-reviewed, not a complete rendered matrix.

Baseline P1 concerns included fragmented client context, unclear operational next steps, click-only receipt upload, custom modal focus/Escape behavior, and misleading completion/health language. Subsequent failure injection established real false-empty operational reads, dropped legacy booking context, and legacy receipt/rejection/photo-dialog defects. No P0 was established in the inspected states.

The requested deployment is conditional on the full brief, all relevant tests, and the quality target. Green tests do not authorize treating incomplete coverage or an earlier below-target score as Excellent. No production mutation was made to obtain local QA evidence.

## Architecture and changed file map

Client 360 is a **read-only aggregation layer**, not a parallel production/payment engine. `clients.id` and `bookings.client_id` establish identity; a namespaced `booking:FM-...` fallback handles historical rows lacking the client FK. No merging by customer name or email occurs.

| Area | Principal files | Behavior |
|---|---|---|
| Aggregation / contracts | `lib/client-workspace.ts`, `lib/client-workspace-types.ts` | Fast core record followed by independently settled payment, storage, selection, prints, add-ons, production, portal, files and activity sections. Workspace/client/booking scoping, bounded fields/queries, no portal secrets or object keys in DTOs. |
| Staff API | `app/api/admin/client-workspace/search/route.ts`, `attention/route.ts`, `[clientId]/route.ts` | Server-derived authenticated scope, capability enforcement, validated references/search, private responses and read budgets. |
| Unified record | `app/admin/clients/[clientId]/page.tsx`, `components/client-workspace.tsx` | Linked-booking selector, sticky identity/FM context, one next action, nine evidence-based lifecycle stages, task-grouped sections and section-local recovery. |
| Context navigation | `lib/client-workspace-navigation.ts`, `components/client-workspace-return.tsx` | Allowlisted return context, supported specialist parameters, no arbitrary external redirect. |
| Shared search / attention | `components/admin-client-search.tsx`, `admin-booking-search.tsx`, `admin-action-center.tsx`, `app/admin/layout.tsx`, dashboard and clients pages | Persistent client search, distinct same-name identities, search-to-workspace navigation, operational tasks ahead of summary KPIs. |
| Next action / lifecycle | `lib/workflow-next-action.ts`, `lib/editor-dashboard-next-task.ts` | Actual independent evidence, raw-only package exemption, role-aware next job, upload failure priority, explicit unknown/not-required. No guessed delivery or inferred completed shoot from date alone. |
| Booking clarity | `components/booking.tsx`, `bpi-qr-display.tsx`, `navbar.tsx`, `lib/booking-form-read.ts` | Sequential guidance, accessible receipt input, catalog/availability read failure recovery, selected date state, readable payment helper and tablet navigation. |
| Legacy resilience | `lib/data-store.ts`, `lib/booking-db.ts`, Bookings/Calendar/Reports/Users/Verification/Provisioning/System, filtering and Files | Strict authoritative reads where empty is operationally meaningful, visible recoverable errors, retained known data, calendar constraint-source safety, valid historical booking identifiers. |
| Dialog accessibility | `components/staff-modal-frame.tsx`, Verification, `admin-raw-photo-queue.tsx`, Bookings | Native modal semantics/inert behavior, stable initial control focus, labelled reasons/notes, Escape cancels only the active layer and restores the opener. Business approvals/rejections/emails unchanged. |
| Storage settings routing | `lib/supabase/middleware.ts`, `tests/storage-settings-routing.test.ts` | Exact editor-host API pass-through; no blanket storage route permission or removal of administrator-only writes. |
| Documentation / isolation | `DESIGN.md`, `.impeccable/design.json`, QA config / fixtures / reports, `.vercelignore` | Incumbent styling documented; isolated `.next-qa` avoids the user's normal build and is excluded from deployment packaging. |

The complete working tree includes existing and generated changes. It remains uncommitted on `codex/download-access-zip-single-file-20260929` at HEAD `ae30724366211d9d4df026e57e385374169d5eda`; no commit/push is claimed.

## Representative Client 360 proof

Synthetic fixture `Synthetic Ana María Cruz` has two bookings under one explicit client UUID; a different same-name client has a distinct UUID/contact/reference. The staff search shows disambiguating context and opens the intended workspace and selected booking, rather than a generic client list.

The record exposes the package, verified payment evidence, remaining balance, Manila shoot schedule/queue information, available original/enhanced counts, submitted choices and preferences, staff approval, print/add-on records where present, editing job/batch and upload history, portal access/expiry/download-request summary, safe file metadata and human-readable activity. Unknown sections remain unknown instead of invented zero or success. The service integration fixture separately verifies populated print/add-on/final-release aggregation; the browser fixture's genuinely empty print/add-on sections are not described as populated.

Switching the linked booking changes the selected reference/package and loads that booking's core/details pair while retaining client identity. Repeated searches across modules are unnecessary for understanding the known record. Actions use specialist routes rather than copied payment, selection, upload or portal mutation logic. The return link preserves the selected client/booking context.

Core identity and an enabled booking selector remain usable while secondary data is intentionally withheld. Injecting a files failure retains payment and selection information; a 44px local retry restores the missing counts. Two common production destinations remain visible; secondary editing destinations use a disclosure.

This proves synthetic local aggregation/navigation and service authorization boundaries. It does **not** prove a real client's PIN journey, actual provider delivery, or a completed live ZIP download.

## Current QA evidence

| Check | Latest established result | Boundary |
|---|---|---|
| Types | Pass after stable-focus repair | Actual source and browser-test types |
| Unit/integration | Fresh 486/486, zero failed/skipped, 30.286 seconds | Synthetic service boundaries / isolated SQL; includes current stable-focus and request-panel source |
| Optimized build | Pass; 76 static pages; compilation 2.9s, TS 4.5s | Current `.next-qa` build `KsMkTqTvmCPEgYWTs_u5D`, not a hosted deployment |
| Lint | 0 errors, 24 warnings; focused modal/test lint clean | Warnings retained, not suppressed |
| Source security | Fresh guards pass; secret scan passes across 716 eligible text files | Not live RLS or penetration testing; subsequent test/docs additions need another final scan |
| Recovery regression | 22/22 desktop/phone cases | Initial read failures, independent calendar sources and legacy Files context |
| Independent download-request recovery | 2/2 | Healthy request panel survives parent outage; panel outage is not false-empty; no grant was clicked |
| Section-local retry / action disclosure | 2/2 | Known payment/selection information survives recovery |
| Legacy + shared nested dialogs | 14/14, 14.2 seconds | Keyboard/naming/labels/Escape/opener restoration, phone initial focus, enlarged root text/reduced motion; no writes |
| Complete optimized browser suite | **110/110 passed**,95.122039seconds, zero retries/skips/flaky/runner errors | Report `test-results/optimized-repair-scoped-110-report.json`; exact original10specs include the contextual request repair and corrected SSR setup. Prepared six private cases are excluded/unexecuted. |
| Scoped accessibility | 12 axe scans, 0 violations, 2 incomplete tablet search-count contrast checks; QR contrast 8.916:1 and height 44px | Not a WCAG conformance certificate |
| Responsive | Recorded 390/768/1440 Client Workspace/search and sample portal captures | Emulated Chromium, not physical iOS/Safari or all routes/states |
| Console / external safety | Strict relevant fixtures reject unexpected page/console errors, hosted calls and mutations | Injected HTTP failures are narrowly classified; no blanket console suppression |

## Performance

See `performance-client-workspace-2026-10-01.md` and `performance-client-workspace-optimized-2026-10-01.md` for complete method, raw observations and inventories.

- Warm development core-interactive median: 527.11 ms; details after synthetic release: 35.33 ms.
- Optimized retained three-context median: **209.40 ms** core focusable and **33.58 ms** details after release. Last observed LCP median 204 ms; measured lab CLS 0.004892.
- Development's additional initial core attempt was aborted; every executed optimized context recorded exactly **one completed core GET plus one details GET**. The linked-booking switch adds one pair.
- Optional CPU 4× sensitivity: core 939.68 ms, details 45.45 ms; five recorded long tasks. This is not field INP or Lighthouse TBT.
- Actual local browser resource bodies: 17 JS resources / 304,841 encoded bytes, five CSS resources / 42,458 bytes, four fonts / 106,712 bytes. Route-entry and incremental bundle inventories use different explicitly documented denominators.
- A separate 100-concurrent in-memory attention test establishes seven bounded metadata queries per read (700 total), not 100 real users or hosted database capacity.

The development/optimized comparison is diagnostic, not a controlled before/after implementation speedup claim. All APIs were intercepted; no real provider traffic or customer records were needed. The added `performance-operational-surfaces-2026-10-01.md` records nine fresh optimized contexts: Admin readiness344.91ms, keyboard search372.13ms including250ms debounce, Editor238.72ms, Files246.56ms and500-row listing187.06ms (medians of three each). All42 API attempts completed, no hosted traffic or content downloads. Real hosted workload/provider latency remains unmeasured; these are current baselines, not score upgrades.

## Ten Nielsen principles: last independent reviewed scores

Method of the prior bounded assessment: independent visual A (`/root/final_ux_critic`) and detector/browser B (`/root/zip_runtime`). These are the **retained prior scores**, not a fresh score after the focus/P2/performance evidence above. They cannot be increased automatically because tests pass.

| Principle, 0–4 | Public booking | Admin workspace/search | Editor dashboard | Portal sample |
|---|---:|---:|---:|---:|
| Visibility of system status | 3 | 3 | 3 | 3 |
| Match with the real world | 3 | 3 | 3 | 3 |
| User control and freedom | 3 | 3 | 3 | 3 |
| Consistency and standards | 3 | 3 | 3 | 3 |
| Error prevention | 3 | 3 | 3 | 3 |
| Recognition rather than recall | 3 | 4 | 3 | 3 |
| Flexibility and efficiency | 2 | 3 | 3 | 3 |
| Aesthetic/minimalist design | 3 | 3 | 3 | 3 |
| Error recognition/recovery | 3 | 3 | 3 | 3 |
| Help/documentation | 3 | 3 | 3 | 3 |
| Total /40 | 29 (72.5%) | 31 (77.5%) | 30 (75%) | 30 (75%) |

Prior technical categories (accessibility/performance/responsiveness/theming/integrity): Public 3/2/3/2/3 = 13/20; other representative scopes 3/2/3/3/3 = 14/20. Performance 2 reflected incomplete evidence then, not a proved runtime failure. The fresh optimized report is additional evidence, not an independent rescore.

Design verdict: the workspace is recognizably a photography-production record—client identity, booking, evidence, next step and sticky FM context reduce wrong-record risk. Prior representative states had no identified remaining P0/P1, but that limited verdict is not a whole-system certificate. Recorded P2 production-action density and remote retry placement are repaired and locally verified. P3 broader public container shape consistency remains. No ignore/suppression was used to game scores.

Questions skipped: the prior scoped critique listed only two Priority Issues, both now addressed; this report is evidence synthesis, not another cosmetic critique round.

## Still required before full-brief promotion

1. Legal SSR, contextual download requests and expiry guidance are resolved locally. Latest original scoped110 and separate private6 runs are green on MuVMcspXRR2Js2__pzuEF. Panel scopes a validated ordinary/legacy booking reference and offers Show all download requests without changing global count or grant APIs. Build/runtime must both use `https://127.0.0.1:54321` to retain synthetic `sb-127` session and satisfy unchanged productionHTTPSvalidator. Failed intermediate launch/auth setup attempts are separate. No fullbrief certificate follows.
2. Expand fresh populated/error/permission-state evidence across the listed Admin/Editor routes at the three requested viewport classes. Do not represent the workspace-only matrix as every route.
3. Verify complete private-portal continuity with safe synthetic identity/data and actual component behavior; preserve PIN/trusted-device, selection, prints/add-ons, locked submission, enhanced files, expiry and weekly download constraints. Sample practice is not this proof.
4. Complete broader named-route performance/request/bundle measurements and realistic cost/query budgets. Provider capacity or hosted integration proof needs a safe staging boundary, not live customer stress.
5. Obtain an honest independent quality reassessment after justified findings, without changing the scoring rubric or declaring 90% from green test counts. The requested score condition remains unmet.
6. When the gate actually passes: verify exact Vercel project/domain/environment, package only runtime inputs, create an unaliased production-configured candidate, wait for READY, use protection-aware checks, inspect representative errors/logs, promote the exact validated artifact, then verify custom domains/authenticated workflows and post-promotion logs. No production deletion/settings change is part of release QA.

The separately reported expiry-setting save repair is local-only until a validated deployment: production GET proved a 307 redirect to the wrong alias; six actual middleware/handler tests prove exact pass-through while retaining auth/origin/rate-limit/admin validation. No production PUT was performed merely to test it.

The additional expiry-reporting P2 is repaired locally: portalRecord now uses the existing client-safe typed error, actual workflow/API/SSR regressions prove410/PORTAL_EXPIRED without relaxing access denial, and the separately updated browser contract proves the exact recovery copy. Its in-memory revert reproduces the original generic500; see the dedicated repair report. This is distinct from the editor storage-settings save redirect. Fresh source review instead identified possible false-empty/permanent-loading states on legacy Sales/Packages/Onsite/Editing Batches/Upload/batch-detail reads; dedicated RED plans and narrow repairs are underway, not yet accepted.
# Current release decision — 2 October 2026

See [the consolidated current release status](2026-10-02-client360-release-status.md) before reading historical audit entries below. Full isolated browser186/186 and unit504/504 passed. Fresh public Nielsen score87.5% is below the owner's90% gate; technical verdict must also meet18/20 per major workflow. **Not deployed; paused at the usage threshold.** Historical scores are not current release approval.
