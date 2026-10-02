# Admin Package Manager and Sales recovery: bounded results

The two confirmed outage states are repaired and the unchanged six local browser journeys pass. This completes the finite Admin recovery batch, not the owner's whole 43-section brief, a UX score target or a production release gate.

## Evidence and chronology

| Layer | Before repair | After repair |
|---|---|---|
| Read-envelope unit contracts | Four failures: malformed successes were accepted instead of rejected | Same four pass; combined existing cache/performance regressions14/14,559.5089ms |
| Packages browser journey | Three widths failed: false totals/no-matches and missing retry | Three pass: persistent outage, keyboard retry into valid empty catalog, search/category retained |
| Sales browser journey | Three widths failed: terminal skeleton and missing retry | Three pass: terminal outage, keyboard retry, true empty report, reporting context and dirty target retained |

RED: `test-results/admin-service-recovery-red-report.json`; unchanged optimized baseline `MuVMcspXRR2Js2__pzuEF`; one worker, no retries. Start2026-10-01T12:47:29.892Z;121110.855ms;0 passed/6 failed,0 skipped/flaky. All18 failed assertions were intended product oracles. No fixture/oracle defect or report-level error was observed. Six traces and outage screenshots remain in `test-results/admin-service-recovery-red/`. Later recovery/form phases were blocked by initial failures, not observed RED, and not retroactively claimed reproduced.

GREEN: `test-results/admin-service-recovery-green-report.json`; root-provided combined optimized build `GYoSlVXjXI2VExpUOPZ-S`; unchanged test assertions, one worker, no retries. Start2026-10-01T13:01:31.642Z;25336.253ms;6 passed/0 failed,0 skipped/flaky/retries/report errors. Three widths:390×844,768×1024,1440×900, desktop Chromium engine, en-PH/Asia-Manila, fixed synthetic clock. Twelve fresh screenshots remain in `test-results/admin-service-recovery-green/`: outage and recovery for each surface/width. No success traces are claimed (configuration retains failure traces). Process exited0 and browser contexts closed before slot handoff; no further browser wave.

## What changed and was verified

- `app/admin/packages/page.tsx`: persistent existing StaffReadNotice distinguishes failed initial catalog reads from valid empty data. Metrics/no-matches are gated on successful or acknowledged package data. Retry does not reset search/category or package editor state. Known-good packages stay available during a failed refresh.
- `app/admin/sales/page.tsx`: failed initial read ends skeleton loading in a persistent notice. Known-good report stays during a failed refresh, explicitly marked as the last loaded report that may differ from the selected period. Dirty-target ref prevents cached or successful read application overwriting unsaved target inputs; acknowledged Save still resets that guard before settings reload, without changing the write payload.
- `lib/package-manager-cache.ts`: a non-array successful response rejects before sorting/cache insertion rather than becoming[].
- `lib/sales-read-cache.ts`: a successful response missing object summary/settings sections, or using null/arrays for them, rejects before cache insertion. No nested financial-schema validation is claimed.
- New isolated browser fixture/spec and unit contract file were planned before generation; scoped lint across all seven changed/new TypeScript files and full TypeScript check passed. The shared fixtures/specs were not edited by this owner.

Browser assertions verify: no false initial Package totals/no-matches; Sales loading ends without financial metrics before success; persistent section-specific retry buttons operate by keyboard; successful empty data is not mislabeled as failure; filters/report query values remain exact; pending Add Package intent survives held-read failure and permits draft typing afterward; Sales target77777 remains unchanged across an existing refresh503 and successful retry; final document overflow≤1px at each width.

## Safety boundary

Every app API call was intercepted in a fresh synthetic context at `http://127.0.0.1:3200`. All hosted origins, unlisted API paths/methods, actual downloads/uploads, popups and unexpected console/page errors fail guards. There were no provider calls, real clients/photos or business writes. The shell still attempted its exact automatic `/api/sync` POST; the fixture fulfilled this as an explicitly declared in-memory no-op with zero changes. This is not GET-only evidence or a claim that no POST was attempted.

| Guard observation | RED | GREEN |
|---|---:|---:|
| Fresh contexts |6|6|
| Intercepted API requests |39|54|
| Declared shell sync POST no-ops |6|6|
| Business-write attempts |0|0|
| Exact expected503 resource errors |15|18|
| Unexpected console/page errors |0|0|
| Guard violations |0|0|

Per-context request/error evidence is attached to both JSON reports. Initial Package read is held by a promise, not a timed sleep. Sales refresh uses the application's existing `admin:sales-data-changed` event; no business mutation is used to trigger it.

## Limits and review status

Package draft fields are not rendered in the existing initial loading branch. The test verifies pending editor intent survives failure, then types a draft and intentionally cancels it before retry; it does not prove typed package fields survive a read retry while that drawer is open. Dirty Sales target retention is browser-verified; Save Targets/PATCH and package Save/POST/PATCH remain unexercised. Package last-successful data preservation on malformed refresh is unit-verified, not an additional browser refresh scenario.

Envelope guards are intentionally narrow. They do not reject every malformed nested financial field or package record; no full schema guarantee is made. The existing TTL, generation protection, deduplication, sort order and package mutation-response behavior are preserved by focused regression evidence.

AI-generated tests still require the owner's human review: DEFER, not human KEEP. Root's technical review is recorded in the plan but is not misrepresented as owner approval. Skills used: Impeccable harden/craft-floor, bug-reproduction, ai-test-generation and Playwright automation; their influence was to preserve incumbent UI, use a known notice pattern, record oracles before code, reproduce before page fixes and keep strict isolated boundaries. The bounded assignment used one RED and one GREEN batch; no historic introducing-commit bisect, ten-run determinism claim or unsafe revert of unrelated workspace changes.

This is client UI behavior under synthetic failures in an optimized local build. It is not production/provider authorization, real outage recovery, whole-app accessibility certification, cross-engine/physical-device evidence, field performance evidence, an updated Nielsen/technical score, whole-brief90% completion or deployment authorization. Root owns server/build/full regression and remaining release gates; this owner made no such mutations.
