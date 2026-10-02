# Admin Package Manager and Sales: focused recovery plan

Status: requirements, risks, coverage, scenarios and oracles recorded before new test code. Browser execution awaits root's explicit slot handoff; no app fix before RED. AI-generated tests require human review; all six remain DEFER, not human KEEP.

## Source and requirements

Owner's 43-section UX completion brief and root's finite assignment cover only `app/admin/packages/page.tsx` and `app/admin/sales/page.tsx`. Current baseline optimized build is `MuVMcspXRR2Js2__pzuEF`. Local metadata reads only, port3200; no business writes or provider calls.

- AR-1: A failed initial package read must not render authoritative zero package totals or a valid no-matches message. Show a persistent, section-specific recovery notice with Retry package catalog.
- AR-2: A failed initial Sales read must end the loading skeleton and show a persistent notice with Retry sales data, without invented financial metrics.
- AR-3: Retry keeps current package search/category and Sales period/date/report basis. A valid empty200 result must still render the existing empty/zero state, without an outage notice.
- AR-4: Preserve the pending Add Package editor intent across an initial delayed read failure; preserve dirty Sales target inputs through an existing refresh failure and its retry. Package fields are only rendered after loading ends, so no claim of a typed draft surviving that initial failure. No saving is exercised.
- AR-5: Six independent scenarios (two journey families ×390/768/1440 desktop Chromium); strict local-origin, API-method/path, download/popup, console/page-error guards. Only exact fixture503 resource errors are expected. Every API response is intercepted; all business writes forbidden. The shell's automatic exact `/api/sync` POST is intercepted as a declared in-memory no-op with zero changes; never forwarded.

Verified source symptoms: Packages catch only toasts and finally stops loading while packages remain[]; metrics and no-matches render. Sales catch only toasts, finally clears loading, but `if (loading || !data)` keeps skeleton indefinitely. `AdminPageHeader` does not render its onRefresh callback, so tests must not invent a header refresh button. Sales `applyPayload` currently resets target fields on cached and successful reloads; this is a separate form-retention risk to verify after initial recovery is implemented.

## Risks and invariants

| Risk | Likelihood / impact | Coverage |
|---|---|---|
| Package outage mistaken for no offerings/zero totals | High / high | AR-1 positive retry + negative false-empty assertions |
| Sales outage appears permanently in progress | High / medium | AR-2 terminal skeleton absence + persistent retry |
| Failed/retried read erases work or filters | Medium / medium | AR-3/4 exact retained input values/query parameters |
| Empty success is mislabeled failure | Medium / medium | AR-3 deliberate empty200 control phase |
| Test accidentally writes/contacts providers | Low / critical | AR-5 strict fixture teardown evidence |

Invariants: no API request continues to real backend; only declared metadata GETs plus the exact automatic shell `/api/sync` POST fulfilled as an in-memory no-op; no business writes, photos downloaded, upload started, save clicked or hosted origin; each context owns fresh caches/session; errors expected only exact API URL+503; no broad console suppression; read retry is keyboard operable; identity remains admin route. This is not a GET-only suite or a claim that the shell made no POST attempt.

Assumptions: Add Package is opened while the first read is held, but fields are not visible until loading ends. The test verifies editor intent survives failure, then fills a draft. Existing Cancel intentionally closes/discards it before retry, because the drawer blocks background controls; we do not fake-click a covered retry. This does not prove typed package fields survive a read retry while the drawer is open. Sales refresh is triggered through its existing `admin:sales-data-changed` event without a business mutation, then retry uses the visible recovery action. This is in-browser metadata rendering evidence, not provider auth or real outage proof. No known-good historic commit is provided; bisect/revert of unrelated user changes is outside scope. We use one RED/one GREEN batch, not the skill's suggested10 repeats, per the bounded assignment.

## Coverage matrix

| Requirement | Scenario family | Positive / negative | Priority | Oracle |
|---|---|---|---|---|
| AR-1/3/4/5 | AR-P ×3 widths | Persistent outage, no false-zero/empty, delayed draft survives; keyboard retry yields true empty | High | UI/input/query/guard evidence |
| AR-2/3/4/5 | AR-S ×3 widths | Terminal outage; filters retained; true empty; dirty form survives refresh503 and recovery | High | UI/input/query/guard evidence |

## Scenarios before oracles

AR-P: Given a held initial package read and legitimate synthetic admin, staff sets search/category and opens Add Package. When the read fails, the pending editor becomes available. After entering a draft and intentionally cancelling, staff sees an outage rather than zero/no packages. When staff retries by keyboard into successful empty data, existing filters stay and the true-empty state appears.

AR-S: Given a failed initial report, staff changes reporting period/date/basis while reads remain failed. When reads complete, loading ends in an explicit outage rather than financial zeros. When staff retries into empty200, current filters remain and true-empty financial data appears. Staff then loads a non-empty day report and edits an unsaved target. When the existing sales-data-change refresh fails and is retried, that target and reporting context remain intact.

## Oracles

- AR-P: first response held by promise, not sleep; header/filter controls usable; draft Add Package heading and typed Package Name present after503; no save/write. After Cancel: no Total Packages/Visible on Website/Selection Rules metrics and no No packages match these filters; persistent alert includes Retry package catalog; no Loading package catalog. Retry receives200empty; category/search identical, same URL; no retry notice, true no-matches and authoritative0 totals return. Screenshot before expected RED assertion and final recovered state.
- AR-S: exact failed GET response observed, loading skeleton absent, no Booked Revenue metrics until success; Retry sales data in persistent alert. Week/2026-10-02/booking_date retained and retry URL exact. Empty200 renders booked revenue₱0 and No package sales in this period, no notice. Day report renders₱3500; monthly target edited to77777. Existing sales-data-change event provokes503; dirty value unchanged on failure and subsequent200 retry, same filter/query context. No Save Targets/PATCH.
- All: full test evidence attaches declared request method/path/query/status, expected HTTP errors, violations and unexpected errors; zero mutations/downloads/providers; screenshots at3 widths; final document overflow≤1px. Failure traces retained.

## Pipeline and review

Skills read by the test owner: Impeccable4.3.1 harden (incumbent Operate mode; no new visual world), bug-reproduction1.0 + determinism reference, ai-test-generation2.0 + staged prompt references, playwright-automation2.0 + applicable fixture/selector/network/anti-pattern guidance. AGENTS.md and installed Next runtime error-handling/data-fetching guides inspected. Root already ran Impeccable context once this session; do not rerun. Craft-floor is required immediately before any later UI edit, not for this planning/test-only stage.

No human review decision or exact underlying runtime model ID is invented. Tests are draft DEFER until human review. Initial type/lint/discovery and RED/GREEN execution records will be appended when completed. No passing count implies whole-brief90%, WCAG certification or deployment authority.

## Narrow read-envelope contract extension

Root authorized two read-helper guards after source inspection: successful Packages must be an array; successful Sales must have object (non-null, non-array) summary/settings sections. These checks run before cache insertion, without changing TTL, generation protection, request deduplication, sorting or mutation responses. This is envelope validation, not a full financial or package-record schema validator. Existing read-cache tests intentionally use minimal summary/settings records; exhaustive nested-field validation is not claimed.

Four new focused tests in `tests/admin-service-read-contract.test.ts` first ran RED on 2026-10-01: 0 passed /4 failed, each with Missing expected rejection, duration128.4596ms. No helper fix had been applied. The tests cover malformed success envelopes, retaining last successful cache on malformed refresh, and permitting the next retry. No network or provider is used; only the fetch boundary is stubbed. The finite browser count remains six; malformed-envelope behavior is covered at the unit boundary, not advertised as additional browser coverage.

## Execution checkpoint

- Source-only preparation: exactly6 desktop scenarios discovered; new fixture/spec lint and full TypeScript check passed. No browser before explicit handoff.
- Browser RED: unchanged optimized build `MuVMcspXRR2Js2__pzuEF`; existing-server mode, one worker, zero retries. Started2026-10-01T12:47:29.892Z, duration121110.855ms. Six failed, zero passed/skipped/flaky; all18 failed assertions were intended product oracles, not fixture/oracle defects. Packages at every width showed Total Packages, Visible on Website and no-matches during failure and had no retry. Sales at every width kept its skeleton and had no retry. Six failure traces and outage screenshots retained under `test-results/admin-service-recovery-red/`; report `test-results/admin-service-recovery-red-report.json`. No report-level errors or fixture guard violations. Later retry/empty/dirty-target phases were unreachable in this RED run and are not claimed observed yet.
- Approved repair: the two pages now use the existing StaffReadNotice. Initial unavailable catalog/report does not render authoritative empty/zero data or perpetual loading. Known-good data stays on a failed refresh; Sales explicitly warns that retained data may differ from the selected reporting period. Filters and package editor state are not reset. A small dirty-target ref prevents cached/network reads overwriting unsaved targets; acknowledged Save behavior still allows reinitialization from the refreshed settings. No business save is tested.
- Helper GREEN: four new envelope contract tests plus existing cache/performance-preservation checks passed14/14, duration559.5089ms, with no skipped/todo cases. This is not exhaustive nested-record validation.
- Post-repair scoped lint (two pages, two helpers, three new test files) and full TypeScript check passed. No server/build/provider changes by this test owner.
- Browser GREEN: unchanged six cases on root-provided optimized build `GYoSlVXjXI2VExpUOPZ-S`; started2026-10-01T13:01:31.642Z, duration25336.253ms. Six passed, zero failed/skipped/flaky/retries/report errors. All retry/empty/filter and Sales dirty-target phases now reached and passed at390/768/1440. Six fresh contexts made54 intercepted API requests, including six declared automatic sync POST no-ops. Eighteen exact expected503 resource errors classified, zero unexpected errors/guard violations, no business-write attempts. Twelve screenshots retained in `test-results/admin-service-recovery-green/`; JSON report `test-results/admin-service-recovery-green-report.json`. Process exited0 and all browsers closed before returning the slot. No further browser wave by this owner.

Final bounded results and limitations are recorded in `docs/admin-service-recovery-results-2026-10-01.md`. Human review remains DEFER, not KEEP. Green counts do not alter any visual score or deployment decision.
