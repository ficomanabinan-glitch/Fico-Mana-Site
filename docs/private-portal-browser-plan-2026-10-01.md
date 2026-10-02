# Bounded private-portal browser plan — generated test draft

Status: requirements/scenarios/oracles recorded before test code. Current: all six desktop Chromium scenarios passed on repaired optimized build `MuVMcspXRR2Js2__pzuEF` with the typed expiry410 contract and exact guidance, with zero retries. This supersedes the earlier generic500 expiry rendering result on `KsMkTqTvmCPEgYWTs_u5D`; that evidence remains historical. See `private-portal-browser-results-2026-10-01.md`. AI-generated tests require human review before merge. No test is marked KEEP without that review.

Source: owner's 43-section brief, requirements 25/33/34/35/39, plus parent's exact bounded assignment. Brief SHA-256: `285bc481d9669a2aeda5491694bcab2e2170792dd250542fb7bb6235707d01a6`. Skills: ai-test-generation 2.0, playwright-automation 2.0; installed Playwright 1.63.0. Author is the current Codex agent; exact runtime model ID is not exposed to this subagent and is not invented.

## 1. Explicit requirements and entities

- PP-1: Actual `/portal/[synthetic UUID]`, **not sampleMode**, initial SSR unavailable → Try Again → intercepted browser data. This proves client-rendered recovery, not SSR authorization, RLS, real device trust or hosted availability.
- PP-2: Reject a synthetic incorrect PIN without losing choices; clear PIN; retry correct synthetic PIN; render submission/download prompt; choose Maybe Later; retain locked submitted choices.
- PP-3: Exhausted two-slot quota hides immediate download; a <5-character reason cannot send; request transport failure retains reason; retry sends same reason and renders PENDING with no duplicate submission affordance.
- PP-4: A synthetic expired backing record uses the repaired **410**, `PORTAL_EXPIRED` contract and exact guidance: `This client portal has expired. Try: contact FICO MANA to request access again.` Recovered data belongs to the same synthetic portal and booking. This proves the client renders the supplied expiry diagnostic without duplicated generic guidance, not actual private expiry authorization. Root separately repaired and tested the actual workflow/API/SSR contract.
- PP-5: Run two journeys independently at 390/768/1440, six scenarios total on desktop Chromium. No actual download, provider, grant, deletion, other portal or unlisted write is allowed. Only intercepted selection/request POSTs are declared.

Entities: synthetic client/booking/public portal UUID; five selected originals; four complementary print allocations; OPEN/SUBMITTED selection; transient PIN; weekly download access AVAILABLE/PENDING; request reason; expired/unavailable client read.

## 2. Risks, invariants and assumptions

| Risk | Likelihood / impact | Guard / source |
|---|---|---|
| Incorrect PIN silently commits or destroys choices | Medium / high | PP-2; compare exact selection payloads except PIN, assert no success prompt on rejection |
| Request failure looks like success or duplicates reason | Medium / medium | PP-3; exact POST/body count, retained textarea, PENDING UI |
| Expiry message or retries lose client context | Medium / high | PP-1/4; URL, exact client/booking, expired message then recovered state |
| Tests contact providers or download photos | Low / critical | PP-5; strict local-origin and endpoint/method guard; fake generated SVG only |
| Phone/tablet sheet cannot be operated or overflows | Medium / medium | PP-5; real focus/Enter actions and viewport checks |

Invariants: all requests stay loopback; app API requests are fulfilled, never continued; only exact declared POST routes; no ZIP/file endpoints; synthetic PNG/SVG preview pixels are not real photos; PIN excluded from draft storage; submitted choices cannot be edited/resubmitted; reasons and selected IDs retain identity on retry.

Assumptions: initial OPEN selection is legitimately preselected with five photos and print allocations; this task focuses on PIN/lock/request recovery, not repeating the sample's whole picking journey. A full private backend remains deliberately blocked in SSR. A browser fixture emulates the typed410 expired read, then a later successful read; this is retry rendering, not proof staff can actually extend expiry. Server/device security remains covered separately. Concurrency, actual ZIP streaming, enhanced delivery, physical devices and assistive technology are outside these six cases.

## 3. Coverage matrix

| Requirements | Scenario family | Positive / negative boundary | Priority | Oracle |
|---|---|---|---|---|
| PP-1/2/5 | PP-S1 × 390/768/1440 | Correct submission + incorrect PIN + transient PIN/locked choices | High | UI, exact payload, absence of download/provider writes |
| PP-1/3/4/5 | PP-S2 × 390/768/1440 | Expired retry + valid request/PENDING + short reason + 500 failure/retry | High | UI, request body/count, same context, absence of duplicate/transfer |

All explicit requirements have happy and negative observations inside these families. No scenario assumes another test ran. Widths are parametrized; six independent contexts, not six new unrelated scenarios.

## 4. Candidate scenarios (what happens)

PP-S1: Given an unavailable SSR synthetic portal, when the client retries, the OPEN selection appears. When they open Review and confirm with an incorrect PIN, it is rejected without committing. When they retry with the correct PIN, their same five choices and print allocations are submitted. When they choose Maybe Later, the submitted review remains locked without starting a download.

PP-S2: Given the same unavailable SSR entry, when the client retries, the submitted portal with two exhausted slots appears. When they enter a short reason, sending remains disabled. When they send a valid reason and the request fails, the reason remains. When they retry, PENDING is shown and another request cannot be sent. Enhanced Download/Preview controls are available but never clicked. When a fresh document is loaded with the backing-record fixture marked expired, protected data is absent; Try Again receives the typed410 expiry contract and exact staff-contact guidance. When availability is restored and they retry, the same PENDING portal context returns.

## 5. Oracles (how success is verified)

- Entry: exact Portal unavailable heading/Try Again, unchanged `/portal/UUID`, no Sample portal information/Finish sample, expected portal data read only after retry.
- S1: Review your choices; exact ₱3,000 confirmation balance; PIN rejection alert; emptied PIN; no Selection submitted sheet yet. Compare both captured POSTs after removing PIN: five exact file IDs, preferences, all four print categories, acknowledgement; no price/total fields. After success: Selection submitted sheet, Download Photos present but never clicked, Maybe Later operable by Enter. Then Your submitted choices, locked notice, no Submit Final Selection/Edit photos, acknowledgement disabled; no PIN in session/local storage.
- S2: recovered submitted context; 2 of 2 weekly slots used; no Download all photos. Reason 4 chars disables Send request and emits no POST. Failure 500 is explicit; exact reason remains. Second POST equals first. Success gives disabled Download request sent plus waiting-for-studio status, no request form and no originals download control. Enhanced `Download all edited photos`, `Preview SYNTHETIC-ENHANCED.JPG` and individual Download controls are enabled but unclicked. Fresh reload + failed retry shows the exact expiry guidance and hides submitted choices/delivery controls; restored retry returns same client and PENDING status.
- Both: viewport scroll width ≤ client width +1; screenshots at final state; all intercepted requests/errors attached. Expected resource errors are classified only for exact declared fixture URL+status (PIN403, unavailable expired read410, request500), never a broad console suppression. Every other console/page error fails. Any unlisted API/provider/content/download/write attempt fails.

## 6–7. Code/execution/review record

Parent reviewed the bounded plan and approved generation, requested read-only enhanced controls and fresh-reload unavailable protection. Contract status was corrected from presumed403 to actual production500 before code. Full TypeScript and scoped ESLint passed before the pause; discovery listed exactly six desktop cases. After explicit parent authorization on resumption, those same six passed in 11.199 seconds against build `KsMkTqTvmCPEgYWTs_u5D`, with zero retries, skipped or flaky cases and no expectation corrections. Human review outcome remains **DEFER** until the owner/reviewer examines the generated tests. A local pass cannot make a human-review claim or meet the owner's 90% gate.

After root reproduced the expiry defect and implemented a typed410/API/SSR repair, root explicitly requested the fixture contract and exact-copy oracle update. That narrow update added410 to the exact URL/status resource-error classifier, supplied `PORTAL_EXPIRED`, and asserted the exact safe expiry copy. Root then repaired the client's duplicate-guidance append and rebuilt. Exactly six updated cases passed once in 11.683 seconds against `MuVMcspXRR2Js2__pzuEF`, with zero retries/skips/flaky/unexpected cases. All other guards and oracles were preserved. No app, server or provider mutation by this test agent; no further browser wave followed.
