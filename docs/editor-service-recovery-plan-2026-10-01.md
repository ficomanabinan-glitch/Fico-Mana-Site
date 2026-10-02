# Editor service-read recovery — focused pre-test plan

1 October 2026. Local optimized build before repair: `MuVMcspXRR2Js2__pzuEF`. Parent owns the server/rebuild. No hosted APIs, provider writes, uploads, downloads, grants or deletion are allowed.

## Requirements extracted before test generation

- ER-1 (owner brief 5/22/23/34): an unavailable read must be visibly unavailable, not successful-empty or an authoritative zero.
- ER-2 (brief 16/17/29): retry the same date/client/batch/report without a full page refresh or a second search.
- ER-3 (brief 22/34): preserve previously verified metadata and filters on refresh failure, distinguish initial loading, error and successful-empty states.
- ER-4 (brief 25/35): recovery is keyboard-operable, labelled, at least 44px tall, within 390/768/1440 layouts.
- ER-5 (brief 37/42): unchanged staff capabilities and business mutations; fixture rejects every unlisted API, hosted origin, binary URL or non-GET method.
- ER-6 (read contract invariant): malformed success payloads are not evidence of an empty schedule, batch collection, upload history or missing batch.

## Risk analysis and assumptions

| Risk | Impact / likelihood | Requirement |
|---|---|---|
| Onsite outage looks like no scheduled clients | High / demonstrated source path | ER-1 |
| Batch-list outage paints zero counts/no batches | High / demonstrated source path | ER-1 |
| Upload-history outage looks like no uploads | Medium / demonstrated source path | ER-1/3 |
| Batch outage looks like nonexistent batch | High / demonstrated source path | ER-1/2 |
| Retry drops reference/date/filter or hides known data | High / plausible | ER-2/3 |
| Malformed 200 looks empty or crashes | High / source checks incomplete | ER-6 |
| QA accidentally starts a real transfer/write | Critical / prevented by strict fixture | ER-5 |

These are reproducible local error-state requirements, not claims about hosted frequency. Use synthetic names and frozen 1 October 2026 clock; Chromium viewport emulation is not physical Safari evidence. No known-good historical version exists for this new wave, so no Git bisect or mutation of the dirty checkout is justified. RED on the original optimized build precedes code changes; GREEN awaits a parent-built artifact. No score change follows from a passing test count.

## Coverage matrix

| Scenario | Destination / failed GET | Priority | Widths | Oracle |
|---|---|---|---|---|
| ER-S1 | `/editor/onsite?date=2026-10-01&booking=FM-120001`; `/api/editor-workflow/onsite` | P1 | 390/768/1440 | No false empty; Retry onsite schedule; same query and client after retry |
| ER-S2 | `/editor/queue?search=FM-120001`; `/api/editor-workflow/batches` | P1 | 390/768/1440 | No zero metrics/false empty; Retry editing batches; matching batch restored |
| ER-S3 | `/editor/upload?batch=FM-BATCH-2026-10-01-MAIN&retry=1`; `/api/editor-workflow/uploads/report` | P2 | 390/768/1440 | Upload chooser remains usable; failed history not empty; Retry upload history restores known row |
| ER-S4 | `/editor/batch/FM-BATCH-2026-10-01-MAIN`; matching batch GET | P1 | 390/768/1440 | Outage not Batch not found; Retry batch preserves route and job identity |
| ER-S5–8 | Same four GETs with malformed 200 metadata | P1/P2 | 1440 | Same explicit recoverable unavailable state, never false success |

Bound: 12 initial-outage journeys plus four malformed-contract cases, desktop project only. Each initial-outage journey proceeds to populated recovery; onsite, batches and upload history additionally demonstrate authoritative empty data after recovery. No transfer button is clicked. Existing shared tests/fixtures are not modified.

## Scenarios before oracles

1. Given an authorized synthetic editor and held schedule/list/history/batch GET, open the exact deep link; release as 503; recover the same GET and retry by keyboard; see the correct client/batch/history. For the three collection surfaces, reload with valid empty data and observe a genuine empty state.
2. Given a malformed 200 on each metadata GET, open the exact deep link; distinguish unusable metadata from a valid empty response; recover and retry without changing the route.
3. Given recovered populated metadata, a background refresh failure must keep known data and expose retry; this is a bounded extension only if source provides a read-only refresh trigger, not a fabricated mutation.

## Oracle design (separate from scenarios)

- UI: persistent `role=alert` containing actionable unavailable guidance, specific retry button; no initial successful-empty copy or batch-not-found copy during a 503/malformed result; no unverified zero KPI.
- Data: expected metadata GET recorded with original date/batch context; successful retry shows exact synthetic booking/name/reference; no API returns real clients.
- Negative: URL unchanged, no second search, no file chooser/transfer/grant/write initiated; context fixture records zero external requests, downloads, unexpected APIs, non-GET methods, page errors or unclassified console errors.
- Accessibility/geometry: focus Retry and press Enter; button bounding box >=44px; document overflow <=1px. Screenshot/error trace saved per width/state in a single run.
- Console: only exact browser-generated resource errors at declared 503 URLs may be classified as expected. Application console errors are never suppressed. Malformed 200 must not trigger a page exception.
- Loading: metadata may be held by an explicit fixture promise, released by the test; no sleep/waitForTimeout.

## Review / evidence status

Plan precedes code. Generated scenarios require parent/owner review before release. RED/GREEN results and build IDs will be appended after execution; a passed synthetic suite is not production or 90% acceptance.

### Recorded RED and repair handoff

- Parent technical review approved the bounded plan and narrow cache helper validation; owner/human acceptance remains DEFER.
- Browser RED: **16/16 failed** on `MuVMcspXRR2Js2__pzuEF`, 174.339 seconds, zero retries/skips/flaky/global-runner errors. Initial 503 produces the four misleading empty/not-found states at all three widths. Malformed 200 masks the three collections and crashes batch detail with `Cannot read properties of undefined (reading 'waitingForSelection')`.
- Evidence: `test-results/editor-service-recovery-red-report.json` and `test-results/editor-service-recovery-red/` traces/screenshots/error contexts. Guard attachments record zero hosted, unlisted API, mutation, download or file-picker attempts. The one batch malformed page exception is recorded as the defect, not suppressed.
- Cache unit RED before edit: `tests/editor-batch-read-validation.test.ts` failed `Missing expected rejection`. After narrow validation repair, cache/deduplication/generation/filter regressions pass (15/15 at first handoff); TypeScript passes. Scoped lint: zero errors, one pre-existing unused `adminBtnGhost` warning in upload page.
- Minimal repairs saved: shared read notices in the four views; previous metadata retained; no unknown initial zeros/empty success; original date/search/batch preserved; actual JSON/metadata shape checked before caching. Existing valid empty batch fast path (which omits optional needsReview) is accepted.
- GREEN browser verification completed on the parent-owned optimized build `GYoSlVXjXI2VExpUOPZ-S`: **16/16 passed**, 40.8 seconds reported by the runner, zero retries/skips/flaky/global-runner errors. All four Editor surfaces distinguish initial loading, 503 unavailability and populated recovery at 390/768/1440; the three collections additionally preserve verified rows on background failure and show genuine empty data only after a successful read. All four malformed-success responses recover without the previous batch-detail crash.
- GREEN evidence: `test-results/editor-service-recovery-green-report.json` and `test-results/editor-service-recovery-green/`. Each case retains strict guard attachments; unavailable/recovered screenshots cover all three widths and malformed-state captures cover all four views. No hosted request, unlisted API, binary transfer, file picker, popup, non-GET mutation, page error or unclassified console error was allowed. Exact browser-generated 503 resource messages at declared failing metadata URLs are recorded separately rather than suppressed globally.
- Existing onsite unit loaders needed two new dependencies: `tests/helpers/load-ts.ts` now executes the actual pure metadata validator and actual `StaffReadNotice` JSX. The success datasets in `tests/onsite-actions.test.ts` now include the API's required `shootDate` and `batch.id`; no assertion or business boundary was weakened. Seven focused onsite/selection/validation tests pass, including completed-upload email, email-only retry, partial-upload safety, confirmation/resume and authorization. The earlier cache/performance regression set is now 16/16 passing.
- Parent owns full-suite/static/rebuild synthesis. No server, provider, download or production operation was performed by this wave. No additional browser wave is pending here; human acceptance and the conditional independent quality gate remain DEFER.

## Finite remaining release-gap matrix (read-only assessment)

| Priority | Remaining scope | Already demonstrated / missing boundary |
|---|---|---|
| Blocker | Conditional 90% independent quality gate | Retained Nielsen Public29/40, Admin31/40, Editor30/40, sample Portal30/40; no fresh rescore authorized by test count |
| Closed in local evidence | Four Editor read-state defects | This wave has RED-before-repair and 16 GREEN journeys on the exact optimized repair artifact; separate owner supplies Sales/Packages evidence |
| Required evidence | Admin System and named Admin synthesis | Editor Onsite/Queue/Upload/Batch basic rendering and read recovery are now covered at all three widths; Reports is not Sales, and dashboard href assertions are not actual destination rendering |
| Required evidence | Specialist contextual continuity | Bookings drawer, DownloadRequests exact context and legacy Files have actual destination proof; payment/selection/batch/portal deep links need bounded destination checks |
| Required evidence | Populated prints/add-ons and broader lifecycle transitions | Service aggregation proves populated records; Client360 browser fixture has empty prints/add-ons; no complete payment→editing→delivery browser transition yet |
| Required evidence | Meaningful private portal authorization/transfer boundary | Six private client-rendered PIN/request/lock/expiry cases now passed; fresh server auth/device-trust, enhanced-release and transfer are not proved by those fixtures |
| Required synthesis | Named optimized measurements/before-after + final report | Admin/search, Client360, Editor and metadata-heavy Files have measured local current baselines; no controlled pre-change implementation speedup; documents still describe executed private6 as pending |
| Optional expansion | Physical Safari/AT, all-status cross-product, hosted load/RUM/real binaries | Useful separate release assurance, not automatically a new defect or a requirement to run destructive production tests |

All ten Nielsen principles are considered without changing scores: visibility (known versus unknown); real-world match (photo/date/FM terms); control (same-context retry/return); consistency (shared notices); prevention (unknown capacity/mutation guards); recognition (identity and descriptive actions); efficiency (direct destinations); minimalism (independent local errors); recovery (explicit retry); help (cause and next step). Existing Workspace/search/attention and scoped dialog evidence covers these in representative states, not every named operational page.
