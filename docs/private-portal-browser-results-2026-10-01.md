# Private portal: bounded client-rendered browser evidence

## Current result: repaired expiry410 contract

The updated six prepared scenarios passed once on optimized isolated build **`MuVMcspXRR2Js2__pzuEF`** at `http://127.0.0.1:3200`, parent-owned browser-fixture launcher. This supersedes the generic500 expiry-message result below; prior evidence remains history, not the current app contract. The bounded non-sample **client-rendered** journey evidence gap is covered, not private server authorization or provider delivery proof.

Fresh report: `test-results/private-portal-expiry410-six-report.json`; screenshots: `test-results/private-portal-expiry410-six/`. Start `2026-10-01T12:25:45.570Z`; total11,682.825ms; six passed, zero skipped/unexpected/flaky cases, zero retries, exit0. Same Playwright1.63.0 desktop Chromium project, one worker, six fresh contexts and widths. Existing-server-only mode stayed enabled; no automatic dev fallback or server/build change by this agent.

| Width | PIN/retry/locked review | Quota/request/unavailable/recovery | Intercepted API calls | Guard violations / unexpected errors |
|---|---:|---:|---:|---:|
| 390 | Passed,1,839ms | Passed,1,392ms | 5+9 | 0/0 |
| 768 | Passed,1,493ms | Passed,2,072ms | 5+9 | 0/0 |
| 1440 | Passed,2,011ms | Passed,1,658ms | 5+9 | 0/0 |

All three fresh expired-read retries received the intercepted HTTP410/`PORTAL_EXPIRED` contract and rendered exactly **`This client portal has expired. Try: contact FICO MANA to request access again.`**, with no generic refresh/reopen suffix. Protected client/review/delivery UI remained hidden on fresh unavailable load; recovery retained the same PENDING booking with no third request POST. All earlier PIN, payload, balance, keyboard, lock, quota, reason-retention, enhanced-controls-read-only and overflow assertions passed unchanged.

All42 recorded API calls remained intercepted. Each PIN journey captured two selection POSTs; each quota journey captured two identical-reason request POSTs. Nine exact expected resource errors: threePIN403, three injected request500, three expiry410. Zero provider/unlisted-write/file/download/popup violations and zero unexpected console/page errors. Twelve fresh screenshots retained. Per-case redacted payload/request/error evidence is embedded in the JSON report. All cases passed, so retain-on-failure traces were not retained. Browser execution finished and no further browser task followed.

The earlier P2 expiry-specific guidance gap is **repaired and verified for this browser rendering scope**, not still open on this build. Root supplied separate actual workflow/API/SSR tests; this browser fixture does not itself execute private backend authorization, expiry checks or persisted writes. Initial private SSR remains deliberately unavailable before client retry. All historical boundary limits below still apply: synthetic preselected data, generated SVG previews, no real downloads/providers, no physical-device or accessibility certification, no human KEEP, no UX rescore/90%/deployment claim.

## Historical result: pre-repair generic500 contract

The prior exact six scenarios passed once on build `KsMkTqTvmCPEgYWTs_u5D` on 2026-10-01. No application changes or expectation corrections were required for that historical run.

## Environment and reproducibility

- Optimized isolated build: `KsMkTqTvmCPEgYWTs_u5D`, parent-owned launcher, `http://127.0.0.1:3200` only.
- Public route: `/portal/77777777-7777-4777-8777-777777777777`, not `sampleMode`. Initial private SSR backend deliberately blocked; each journey starts with Portal unavailable and retries into intercepted browser data.
- Playwright 1.63.0, `desktop-chromium` (Chrome channel), one worker, six fresh contexts at 390×844, 768×1024 and 1440×900. Desktop engine with viewport changes, not physical-device certification.
- Start: `2026-10-01T12:10:30.204Z`; runner duration 11,198.755ms; exit 0. Exactly six passed, zero skipped, unexpected or flaky cases; retries explicitly zero.
- Existing-server-only mode: `QA_USE_EXISTING_SERVER=true`; no automatic dev fallback, server/build mutation, hosted call, real file transfer or provider write by this agent.
- Plan, fixture and spec: `docs/private-portal-browser-plan-2026-10-01.md`, `e2e/fixtures/private-portal.ts`, `e2e/private-portal.spec.ts`. Skills ai-test-generation 2.0 and playwright-automation 2.0, including applicable references, were read again on resumption. The original pipeline established requirements, risks, matrix, scenarios and oracles before code. Full TypeScript and scoped ESLint passed before execution.

## Results

| Width | PIN rejection → retry → locked review | Quota failure → PENDING → unavailable → recovery | Intercepted API calls | Guard violations / unexpected errors |
|---|---:|---:|---:|---:|
| 390 | Passed, 2,362ms | Passed, 1,364ms | 5 + 9 | 0 / 0 |
| 768 | Passed, 1,515ms | Passed, 1,394ms | 5 + 9 | 0 / 0 |
| 1440 | Passed, 1,470ms | Passed, 1,982ms | 5 + 9 | 0 / 0 |

These durations are test-run timings, not performance benchmarks. All 42 recorded API calls were browser-intercepted. Each PIN journey made exactly two selection POSTs: synthetic incorrect PIN rejected with 403, followed by synthetic correct PIN. Their choice payloads matched except PIN: five included IDs, no extra-edit IDs, all four print categories and acknowledgement, with no client price/total fields. The confirmation displayed ₱3,000. PIN was cleared on rejection and absent from draft storage. Success opened the download prompt; keyboard Enter on Maybe Later retained the locked review without a download.

Each quota journey made exactly two request POSTs containing the same reason: injected transport failure 500, then PENDING. A four-character reason could not submit and emitted no POST. Failure retained the reason; PENDING removed the form and disabled another request affordance. Enhanced bulk Download, individual Download and Preview controls were visible/enabled but not clicked.

Each quota journey then freshly reloaded with the browser backing-record fixture marked expired. The initial unavailable state and failed retry hid submitted choices, client identity and enhanced download controls. Restoring the fixture and retrying recovered the same client/booking and PENDING state without a third request POST. Final scroll-width checks passed within the ≤1px allowance.

Across all cases: zero hosted-origin/unlisted-write/file/download/popup guard violations; zero unexpected console/page errors. Only the exact fixture URL/status resource errors were classified: three PIN403, three request500 and three expired-read500 responses. No broad error suppression was used.

## Retained artifacts

- Machine-readable report: `test-results/private-portal-resumed-six-report.json`. Each case embeds a `private-portal-intercepted-evidence` JSON attachment containing request paths/methods/statuses, payloads with synthetic PIN redacted, expected HTTP error classifications, violations and unexpected errors.
- Screenshots: `test-results/private-portal-resumed-six/`, twelve images covering locked review, PENDING, unavailable and recovered states across the three widths.
- Tracing was configured `retain-on-failure`; all cases passed, so no failure trace is retained. No saved trace is claimed.
- The run was stopped after exactly six cases; no diagnostic/retry/polish wave followed.

## Historical limitations and then-open issue

The OPEN fixture begins legitimately preselected, so this does not replace full private photo-picking coverage. All API state changes are in-memory intercepted responses, not persisted selection, download grants, Supabase authorization/RLS, private SSR authorization, email delivery, actual expiry enforcement or ZIP streaming. Previews are generated synthetic SVGs, never client photographs. Real provider or production availability is untested. Human review of the generated tests remains **DEFER**, not KEEP.

At that historical build, the P2 expiry-specific recovery gap remained: `lib/editor-workflow.ts:1047–1048` threw plain `Portal expired.` errors; `app/api/editor-workflow/[...path]/route.ts:89` and the GET catch at line697 produced the generic production fallback `Editor workflow request failed.` (500). The historical tests intentionally preserved that contract. Root subsequently repaired it and authorized changed-contract verification, documented in the current result above. These historical source line references describe the old snapshot, not current source.

There were no fixture/oracle failures and no newly demonstrated product defects in these six scenarios. This result does not rescore the earlier UX matrix, satisfy a whole-brief 90% gate, certify accessibility or authorize deployment.
