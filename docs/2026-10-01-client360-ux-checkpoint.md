# FICO MANA — Client 360 and UX checkpoint

Saved: 1 October 2026, 12:38 PM Asia/Manila.

## Status and boundaries

**PAUSED at the user's explicit request. This is a checkpoint, not a release certificate or final audit.**

- Workspace: `E:\zzzzFICO LOCAL\Fico-Mana-Staging`.
- Branch: `codex/download-access-zip-single-file-20260929`.
- Existing HEAD: `ae30724366211d9d4df026e57e385374169d5eda`.
- Changes remain saved locally and uncommitted. No commit, push, deployment, production database mutation, email, or cloud-data deletion was performed for this task.
- The active brief explicitly prohibits deployment and production-data mutation. Older deployment authorizations in conversation history do not override this brief.
- Preserve unrelated/pre-existing changes, including generated `tsconfig.tsbuildinfo` and `next-env.d.ts`. Do not use destructive Git resets.
- The owned isolated QA server on `127.0.0.1:3200` was stopped and its listening port checked. The user's separate local preview on port 3100 was not stopped.

## Current request

Implement the attachment titled **FICO MANA — AGENTIC UX, WORKFLOW, CLIENT 360, IMPECCABLE AUDIT & IMPLEMENTATION**, using Impeccable and all ten Nielsen usability heuristics:

`C:\Users\ROG\.codex\attachments\05115bd1-8b11-493f-bc2a-871023e5c090\Pasted text.txt`

Inspect → baseline → implement → test → browser QA → re-audit → refine. Prioritize operational clarity, secure unified Client Workspace, contextual next actions, public booking onboarding, role-aware Editor workflow, mobile usability, and regression safety. The requested quality target is at least 90%, with no P0/P1 in verified scope. **That target has not yet been certified. Do not invent a final score.**

## Completed implementation

### Authoritative Client 360 data

- Confirmed distinct `clients.id` UUID identity and nullable `bookings.client_id`. Multiple bookings are associated by that actual foreign key, never by matching name/email.
- Explicit legacy namespace `booking:FM-xxxxxx` is used only when no client foreign key exists.
- Added private Admin search, core/details, and attention APIs under `app/api/admin/client-workspace/`.
- The service aggregates existing booking, payment, selection, print, add-on, production/batch, upload, storage, portal, file, and activity records. It does not introduce a second workflow engine or schema migration.
- Access checks require authenticated Admin capability and active workspace; reads are workspace/client/booking-scoped and rate-limited. Responses are private/no-store.
- DTOs exclude PINs, tokens, signed URLs, storage keys, and credentials. Receipt and portal actions use existing authenticated internal routes.
- Reads avoid services that mutate state while reading. No R2 photo downloads or live R2 metadata requests were needed.
- Exact metadata counts are separate from capped recent-file lists, so counts do not silently become a 1,000-row sample.
- Independent section states distinguish ready, empty, partial, and unavailable; failed reads do not become zero.

Primary files: `lib/client-workspace.ts`, `lib/client-workspace-types.ts`, API route files, `lib/booking-db.ts`, `lib/data-store.ts`.

### Admin search and Client Workspace

- Persistent accessible header search plus dashboard entry point; results show booking/date/package and masked contact context.
- Search is debounced, bounded, abortable, and guarded against stale responses. Similar names remain separate.
- Added `/admin/clients/[clientId]` with fast core identity/booking first, then secondary details.
- Linked-booking selector preserves the actual customer; header, one prioritized next action, lifecycle disclosure, and grouped detail sections avoid one enormous information dump.
- Payments, historical booking total/discount, schedule/queue, choices, prints/add-ons, editing batch/uploads, portal/delivery, recent filenames, and human-readable activity are available in one context.
- Specialist workflow links retain the booking and a validated return-to-workspace route; Files Management consumes the supported booking/date context.
- Added compact sticky client name/FM context, tablet-safe next-action layout, and touch-target refinements. These latest visual repairs still require the final browser rerun.
- Nine-stage lifecycle derives each stage independently from direct evidence. Missing evidence is unknown; available enhanced files do not prove delivery/download. Raw-only packages exempt selection/review/editing/enhanced upload without inventing final release.
- Admin action center emphasizes known blockers/current work before KPIs; first-run and failed reads are separated. Completed sessions no longer imply delivered photographs.

Primary files: `components/admin-client-search.tsx`, `components/admin-action-center.tsx`, `components/client-workspace.tsx`, `components/client-workspace-return.tsx`, `app/admin/clients/`, `app/admin/dashboard/page.tsx`, `app/admin/layout.tsx`, `app/editor/files/page.tsx`, `lib/client-workspace-navigation.ts`.

### Shared workflow and other UX

- Pure `deriveWorkflowNextAction` and `deriveWorkflowLifecycle` helpers reuse authoritative statuses, with tests for real editing-job enums and partial/unknown states.
- Editor dashboard has a role-aware next task; the onsite-only editing-queue visibility/fetch correction was being finalized by the UI agent. Verify its final state before claiming full completion.
- Public booking progress now uses sequential visible ordinals rather than sparse internal step IDs.
- Required receipt selection is keyboard-operable. Initial package/availability failures have an explicit retry instead of a misleading successful empty state.
- System descriptions no longer claim static “connected/protected” health without evidence.
- Portal submission reassurance describes the locked saved choices rather than a backend duplicate-submission message.
- Booking drawer and nested confirmation/delete dialogs use native modal focus/inert/Escape behavior. The last test found nested focus restoration failed; an explicit opener-restoration repair is saved but **not yet retested**.
- `DESIGN.md` and `.impeccable/design.json` document incumbent FICO MANA tokens/patterns. The sidecar is now explicitly allowed by `.gitignore` rather than silently ignored.

Primary files: `components/booking.tsx`, `lib/booking-form-read.ts`, `components/editor-dashboard.tsx`, `lib/editor-dashboard-next-task.ts`, `app/admin/system/page.tsx`, `components/portal-review.tsx`, `components/staff-modal-frame.tsx`, `app/admin/bookings/page.tsx`, `lib/workflow-next-action.ts`.

## Verified results at pause

| Check | Last completed evidence | Qualification |
|---|---|---|
| Baseline unit/integration | 426 passed | Before this implementation |
| Latest complete unit/integration suite | **476 passed, 0 failed/skipped** | Completed while pause was being recorded |
| Latest TypeScript check | **Failed** | `components/booking.tsx:689`: `aria-pressed` receives `boolean \| null`; valid type excludes null. Earlier checks passed before the latest calendar-accessibility addition. Do not claim current typecheck is green. |
| Optimized production build | Passed on the earlier candidate | Must rerun after newest lifecycle, focus, sticky/tablet, and booking changes |
| Baseline browser E2E | 36 passed | Local synthetic fixtures |
| Initial new Client 360 browser checks | 16/16 passed | Desktop/mobile search, identity, booking switch, progressive loading, partial failure/retry, links, overflow/accessibility |
| Expanded Client 360 + nested dialog run | 16 passed, 2 failed | Both failures are nested dialog opener restoration, before the saved repair. Current expanded suite has 12 scenarios/24 project cases and is not yet run. |
| Booking/Editor new browser checks | Prior runs: 6 booking + 6 Editor passed | UI agent's last exact-viewport rerun was pending at pause; collect its final report before combining counts |
| Targeted accessibility | No serious/critical axe findings in tested Client 360/search states | Six scans per browser project at 390/768/1440; not full WCAG certification, NVDA, or physical Safari/iOS evidence |
| Source security guard script | Passed | Existing narrowly scoped static guard assertions, not a full security assessment |
| Secret-pattern scan | Passed across 701 eligible text files | Values not printed; not a complete Git-history or live-secret audit |
| Full repository lint | **Failed: 9,045 findings (981 errors, 8,064 warnings)** | Raw full scan needs triage, especially generated `.next-qa` coverage. Do not label every finding pre-existing or claim lint clean. Latest output also includes new `components/client-workspace.tsx:69` hook dependency warning. |
| Scoped helper/UI lint | Earlier scoped runs passed | Rerun all touched files after final repairs |

Synthetic query-budget regression: 100 concurrent attention reads across 100 candidate bookings used exactly 700 metadata queries, seven per read, with bounded output and no per-client core-load fan-out. **This is an in-memory query-shape test, not real-user production stress, real database latency, or a hosting-capacity claim.**

## Baseline audit (already delivered)

Scores below are conservative review judgments, not user-research or conformance measurements. Baseline Public/Portal included local rendered evidence; parts of authenticated Admin/Editor were source-reviewed rather than fully rendered.

| Nielsen principle (0–4 each) | Public | Admin | Editor | Portal |
|---|---:|---:|---:|---:|
| Visibility of system status | 3 | 2 | 3 | 3 |
| Match with the real world | 3 | 2 | 3 | 3 |
| User control and freedom | 3 | 2 | 3 | 3 |
| Consistency and standards | 3 | 3 | 3 | 3 |
| Error prevention | 2 | 3 | 3 | 3 |
| Recognition rather than recall | 3 | 1 | 2 | 3 |
| Flexibility and efficiency | 2 | 2 | 3 | 3 |
| Aesthetic/minimalist design | 3 | 3 | 3 | 3 |
| Error recognition/recovery | 2 | 2 | 3 | 3 |
| Help and documentation | 2 | 1 | 2 | 3 |
| Total / 40 | 26 | 21 | 28 | 30 |

Baseline technical audit totals across accessibility, performance, responsive behavior, theming, and integrity: Public 13/20; Admin 13/20; Editor 15/20; Portal 15/20.

P1 baseline priorities were identity/context fragmentation, missing task-first guidance and misleading completion language, click-only required receipt upload, inaccessible custom modal behavior, and unsupported static health/recovery claims. No P0 was proved. Several fixes are implemented, but final verification and scoring remain unfinished.

Impeccable baseline A/B separation was observed: independent visual/UX critique followed by bounded detector/source evidence. The whole-root critique-storage helper returned “no stable slug for input”; no fabricated snapshot/trend record was created. Use the ordinary audit document for archived evidence. Zero matches from the bounded detector run do not certify the entire application.

## Next steps, in order

1. Read this checkpoint, current Git diff, active brief, project instructions, and relevant installed Next.js/Impeccable guidance. Resume existing work; do not restart the baseline or delete user changes.
2. Collect the paused agents' final checkpoint replies and identify any saved changes beyond this note.
3. Fix the current TypeScript blocker in `components/booking.tsx:689` by making the calendar button's pressed value a real boolean/undefined without weakening the accessibility assertion or date-selection logic. Add/retain a focused regression.
4. Resolve the new Client Workspace hook warning; triage full lint correctly. Exclude generated QA build output through normal configuration if it is the cause, not by suppressing actual source defects. Run focused lint across all touched files.
5. Confirm onsite-only Editor dashboard no longer renders/fetches unauthorized editing queue content and that failed unrelated reads do not hide its valid onsite task.
6. Restart the isolated QA server on `127.0.0.1:3200`, using `QA_ISOLATED_LOCAL=true`, `.next-qa`, synthetic Supabase URL/key, and blank production service/Resend/R2 secrets. Do not reuse the user's authenticated production browser or port 3100.
7. Run the complete updated Client 360 suite, including repaired nested focus restoration, lifecycle labels, scrolled sticky context, and the new Admin first-run/action-center cases. These additions were saved but not yet executed at pause.
8. Complete the second/final visual review at 390×844, ~768, and 1440×900. Check tablet button width, sticky identity, lifecycle density, keyboard focus, long names/references, independent failures, and no document overflow. Keep the documented Impeccable visual-refinement budget; avoid endless polish.
9. Run final TypeScript, full unit/integration, full local E2E, optimized production build, scoped lint, and relevant security guards. Record exact exit codes/counts; do not combine earlier green runs into a current all-green statement.
10. Finish independent final all-ten-heuristic judgments and technical audit. Clearly separate rendered/verified scope from source-only broader routes. Do not force ≥90% when evidence does not justify it.
11. Write the final audit/performance report with baseline/final scores, changed files, a representative synthetic Client 360 journey, exact test evidence, security boundaries, and remaining P2/P3 limitations. No live latency/CWV/100-user production claims without measurement.
12. Stop only the owned QA server after verification. Deliver a local-only handoff. Deployment still requires a new explicit request and a validated release workflow.

## Known limitations and remaining risks

- The latest TypeScript error and unverified modal focus repair prevent release-readiness claims.
- Full-repository lint is not green; generated-output noise versus real source findings remains untriaged.
- Original global reduced-motion behavior and some legacy public square-radius styling are known debt; this work does not claim to have migrated every route.
- Broader legacy menus, walkthroughs, production database latency/indexes/RLS, physical iOS/Safari, assistive-technology behavior, actual client downloads, and live provider reliability are not all established by these local fixtures.
- UI tests intercept synthetic responses; separate actual service tests exercise authorization/aggregation with fake external boundaries. Neither is proof of current production RLS or a live deployment.
- No final whole-application 90% score or zero-P1 certificate has been produced.

## Evidence and local test infrastructure

- New tests: `tests/client-workspace.test.ts`, `tests/client-workspace-navigation.test.ts`, `tests/workflow-authoritative-statuses.test.ts`, `tests/workflow-lifecycle.test.ts`, booking-read/Editor-task/design/copy tests.
- Browser tests: `e2e/client-workspace.spec.ts`, `e2e/fixtures/client-workspace.ts`, `e2e/booking-clarity.spec.ts`, `e2e/editor-next-task.spec.ts`.
- Test plan: `docs/ux-scoped-test-plan.md`.
- Client Workspace screenshots exist in ignored `test-results/client-workspace-workspace-4d10c-ated-accessibility-findings-{desktop,mobile}-chromium/`, including `client-workspace-first-screen-{390,768,1440}.png` and workspace/search views. These precede the last sticky/lifecycle/tablet repairs.
- Nested confirmation failure screenshots exist in ignored `test-results/client-workspace-booking-d-c5a46-us-without-mutating-records-*` folders.
- `next.config.mjs` separates `.next-qa` from the normal `.next` build; `tsconfig.json` includes the generated QA types. This avoided a shared-build/hydration conflict during local testing.
- No running root test/lint jobs remain after their completed outputs were collected. Agent-owned status must be confirmed from their pause replies.
