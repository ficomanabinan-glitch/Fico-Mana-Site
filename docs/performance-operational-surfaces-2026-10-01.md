# Operational surfaces — optimized local performance baseline

Measured 1 October 2026 at 11:27:54 UTC / 7:27:54 PM Asia/Manila. **Nine fresh browser contexts executed; nine passed; no retries or additional browser contexts.** This is current-baseline evidence, not a controlled before/after speedup, a Lighthouse score, field Core Web Vitals, provider capacity, or a UX rescore.

Retained raw artifact: [`test-results/operational-performance-2026-10-01.json`](../test-results/operational-performance-2026-10-01.json). Reproducible runner: [`scripts/qa-operational-performance.mjs`](../scripts/qa-operational-performance.mjs). It requires an already-running isolated optimized server; it never starts or reconfigures the app server. Command used: `node scripts/qa-operational-performance.mjs` (exit 0).

## Environment and safety

- Existing optimized `.next-qa` build **`kTBGuaRwla6df94Wb1baT`**, served only at `http://127.0.0.1:3200`. Parent reported the QA launcher and HTTP-level SSR fixtures; no provider configuration was changed by this measurement.
- Headless Chrome **154.0.8037.59**, 1440 × 900, Asia/Manila browser timezone. Three sequential, fresh contexts per surface, with service workers blocked. Routing disables browser HTTP cache; the optimized app server and OS caches were already warm. This is not cold hosting.
- Unthrottled CPU and unthrottled loopback. No physical-phone, constrained-bandwidth, or real API-latency equivalence is asserted.
- The full browser suite and the separate download-context RED had finished before these measurements began. B confirmed a safe browser pause; no other team-owned browser run overlapped these nine contexts.
- Every browser `/api/` request was intercepted and fulfilled from fixed synthetic responses. Every non-loopback origin was blocked. Local document/static/RSC requests reached the isolated app server; no app API request reached it.
- The console's automatic `POST /api/sync` was also fulfilled locally. This is an observed mocked sync attempt, **not a server mutation**. Uploads, grants, deletion, actual files, PIN data, and customer records were never submitted or fetched. No unexpected mutation or external-origin attempt occurred.
- Business time was fixed to `2026-10-01T04:00:00Z` by replacing browser `Date` only. Native timers and `performance.now()` continued to run. This establishes the expected “today” fixture but does not exercise long-running cache aging or background polling.

The performance-testing skill's measure-first and lab/field distinction guided this bounded run. Its broader backend load/stress/soak and CI-budget tasks were not invoked: the authorized task was local browser baseline evidence, not capacity testing.

## Fixed fixtures and actionable endpoints

Existing fixture contracts were reused from `e2e/fixtures/client-workspace.ts`, `e2e/editor-next-task.spec.ts`, and `e2e/staff-recovery.spec.ts`.

| Surface | Fixed payload | Readiness / interaction asserted |
|---|---|---|
| Admin dashboard + global search | 3 bookings, 1 authoritative attention item, 2 same-name search results with distinct identity/contact | Attention item is visible; its **Open client** action accepts focus and points to the intended second booking. Persistent Search clients is activated with Enter. A keyboard-typed `FM-120001` query produces exactly one matching target link among the two results, with the correct client/booking URL; that target accepts focus. |
| Editor dashboard | 1 failed-upload editing batch containing 1 client / 5 selected photos; 1 onsite job | **Retry failed upload** heading is visible; **Retry upload** accepts focus and its target is exactly `/editor/upload?batch=FM-BATCH-SYNTHETIC&retry=1`. No upload is attempted. |
| Files metadata workflow | 1 booking, 1 originals category, **500 file metadata rows**, each representing 5,242,880 bytes; all `previewAvailable: false` | Correct client folder accepts focus; Enter loads 500 **Open** links and a focusable folder search. Keyboard input `SYNTHETIC-0500` filters to exactly the correct one-row result. No file is opened, image fetched, or deletion control used. |

The Files `level: files` JSON is **73,517 UTF-8 bytes**. Its represented indexed file size is 2,621,440,000 bytes, but those binary bytes were **not transferred**. This is deliberately metadata-heavy rendering/filtering evidence, not large-gallery thumbnail decoding or ZIP throughput.

Readiness timers use the controlling process's high-resolution monotonic clock. Navigation timers start immediately before `page.goto` and end after the specified visible, correct, focusable action assertions. Interaction timers start immediately before actual keyboard input/activation and end after the correct resulting state is asserted. They include browser automation/assertion overhead; they are not pure render time or event-to-next-paint metrics. Search latency also includes the application's existing 250 ms debounce.

## Retained measurements

All nine observations are retained. No warm-up sample, higher value, or layout-shift value was discarded.

| Measurement, milliseconds | Context 1 | Context 2 | Context 3 | Three-context median |
|---|---:|---:|---:|---:|
| Admin navigation → correct attention action focused | 359.54 | 281.06 | 344.91 | **344.91** |
| Global search: keyboard query → correct result focused | 372.42 | 347.41 | 372.13 | **372.13** |
| Editor navigation → correct next-task action focused | 251.21 | 225.11 | 238.72 | **238.72** |
| Files navigation → correct client originals folder focused | 254.69 | 236.45 | 246.56 | **246.56** |
| Files folder Enter → 500 links + folder search focused | 187.06 | 190.10 | 183.83 | **187.06** |
| Files keyboard filter → correct single row visible | 240.85 | 209.04 | 207.78 | **209.04** |

Three observations establish only these small local samples. They do not establish p95/p99, population reliability, a production latency distribution, or an improvement over an unmeasured earlier version.

## Completed request counts

Counts below include the entire short observed flow, not just initial navigation. Every listed request was intercepted before reaching the app API. Each URL/method occurred exactly once per context; no replay or aborted duplicate was observed.

| Surface | Attempted / completed per context | Failed / aborted / pending | Endpoint breakdown |
|---|---:|---:|---|
| Admin + search | **6 / 6**, all three | 0 / 0 / 0 | GET bookings; GET booking priorities; mocked POST sync; GET notifications; GET attention; GET search with `q=FM-120001`. Initial dashboard has 5 completed attempts; search adds 1. |
| Editor | **4 / 4**, all three | 0 / 0 / 0 | GET session; GET batches; GET onsite (`date=2026-10-01&fast=1`); GET batches (`sync=1`). The last is an intentional synchronization read with a distinct query, not an aborted initial replay. |
| Files | **4 / 4**, all three | 0 / 0 / 0 | GET session; GET client categories; GET storage summary; GET selected raw category. Folder filtering is local and creates no new API request. |

Total: **42 attempts, 42 completions**, 0 failures, 0 pending at capture, 0 blocked-origin attempts, 0 unexpected mutation attempts, 0 page/console errors. These browser completion counts do not measure database query counts or whether a hosted synchronization read performs additional work.

## Actual browser resource bodies

The following are observed browser Resource Timing `encodedBodySize` values, not source-file size, a compression estimate, route-manifest totals, or a hosting bandwidth bill. Full resource URLs, decoded/transfer bytes, initiators and start/end times are retained in the raw artifact. Navigation HTML is separate and excluded from this resource table. Synthetic API bytes describe fixture fulfillment, not real provider payload/compression behavior.

| Surface | JavaScript count / encoded bytes | CSS count / encoded bytes | Font count / encoded bytes | Other local resources, encoded bytes | Synthetic API encoded bytes |
|---|---:|---:|---:|---:|---:|
| Admin + search | 16 / **301,386** (each) | 5 / **42,458** (each) | 4 / **106,712** (each) | **14,867 / 16,320 / 16,320** | **5,539** (each) |
| Editor | 13 / **244,620** (each) | 5 / **42,458** (each) | 3 / **90,172** (each) | **14,336 / 14,338 / 14,338** | **1,167** (each) |
| Files | 14 / **260,768** (each) | 5 / **42,458** (each) | 2 / **67,064** (each) | **7,795** (each) | **74,348** (each) |

“Other local” includes automatically fetched local resources such as RSC/prefetch responses. Its observed variation is retained rather than forcing identical request totals. Admin's initial-page snapshot and post-search snapshot are both saved; opening/searching the sheet added the search API response, not additional JavaScript/CSS bodies during these observed windows.

## Lab paint and layout stability

Observers were installed before navigation. CLS is the **maximum session-window sum**, excluding entries with `hadRecentInput`: adjacent shifts must be less than 1 second apart, within a window shorter than 5 seconds. It is not a simple sum of every shift. The capture occurs 500 ms after each final verified action/state; Admin also has a pre-search snapshot after a 500 ms settle. These are short scripted observation windows.

| Surface | Last observed LCP, ms, contexts 1 / 2 / 3 | LCP candidate | Lab CLS maximum, contexts 1 / 2 / 3 |
|---|---|---|---|
| Admin + search | **464 / 244 / 264** | Console Dashboard H1 | **0.015603 / 0.016116 / 0.016116** |
| Editor | **220 / 196 / 204** | Today's upload and editing work H1 | **0 / 0 / 0.014993** |
| Files | **160 / 168 / 160** | Folder-opening explanatory paragraph | **0 / 0 / 0** |

The Admin first-context LCP occurring after the action-readiness check illustrates why actionable readiness and observed largest paint are distinct measures. Keyboard interaction ends normal page-load LCP collection; the Files candidate does **not** measure the later 500-row list paint. Input-associated folder/filter movement is excluded by standard CLS semantics; a zero Files result does not mean its interactive layout never changes.

No long tasks were recorded in these short unthrottled windows. This is not a Lighthouse TBT result and does not prove no longer task occurs elsewhere. Captured page windows were approximately 1.685–1.795 seconds for Admin, 0.730–0.751 seconds for Editor, and 1.139–1.190 seconds for Files; exact values and individual shifts are in the artifact.

## Conclusion and remaining limits

This extends the named-surface performance evidence beyond Client Workspace: the fixed Admin attention/search, Editor retry-next-task, and 500-row Files metadata tasks were correct and actionable in all three fresh contexts each, with explicit resource inventories and completed request accounting. The separate Client Workspace optimized report remains the evidence for intentionally delayed secondary details.

Unestablished: a pre-change baseline for these surfaces; field INP/CWV; Lighthouse scoring/TBT; physical mobile/Safari; constrained-bandwidth or cold-hosted behavior; actual authentication/database/index/RLS timing; provider latency and capacity; thumbnail decoding; photo/ZIP transfer throughput; production-sized client/search histories; long-duration cache/polling behavior; and CI-enforced performance budgets. No application optimization was made or justified solely from these samples, no UX score increased, and no release/deployment readiness certificate is implied.
