# Client Workspace optimized local performance — 1 October 2026

Fresh bounded evidence for the full requirements audit. This record is distinct from the earlier development-server measurement in `performance-client-workspace-2026-10-01.md`. It does not certify field Core Web Vitals, real provider capacity, hosting latency, the complete UX brief, or deployment readiness. No UX score was changed.

## Environment and method

- Root explicitly confirmed the fresh `.next-qa` optimized build and isolated production-mode launcher were ready before browser measurement. Only `http://127.0.0.1:3200` was used.
- Build ID: `kTBGuaRwla6df94Wb1baT`. Route manifest timestamp: `2026-10-01T06:38:29.231Z`.
- Installed Playwright headless Chromium, desktop viewport 1440 × 900. Each observation used a fresh browser context and disabled HTTP browser cache through CDP.
- Network: unthrottled loopback; no real network/device equivalence is asserted. The server was warmed by startup/readiness and preceding requests; this is not a cold-server study.
- Every `/api/` request was intercepted using the existing synthetic Client Workspace fixtures/session. External origins were blocked. Only local document/static asset requests reached the app server. No real Supabase, R2, email, or hosted calls occurred.
- Three retained baseline observations plus one separately labeled CDP CPU-throttling-rate-4 sensitivity observation. No network throttle was applied because intercepted API fulfillment would not represent a realistic provider/network latency profile.
- “Core focusable” timing starts immediately before navigation and ends after the synthetic client heading is visible and the linked-booking selector has received actual keyboard focus. Selector enabled/focus, Manage booking visibility, and pending-details instructions were confirmed while details were deliberately held.
- Details were held for approximately one second after the request arrived, then fulfilled. Details-render timing ends when the package-balance field becomes visible. It measures browser scheduling/rendering after synthetic fulfillment, not database latency.
- LCP, layout-shift, and long-task observers were installed before navigation. Lab observations were read 500 ms after details appeared and before booking switching. CLS uses the maximum session window, excluding shifts with recent input (1-second gaps / 5-second maximum windows). These short scripted lab windows are not field CWV or field INP.
- Four contexts were initially executed. The third baseline's detailed tool output was truncated; one replacement fresh baseline was executed with compact output. The unavailable third timing is excluded rather than reconstructed. Five contexts were therefore executed in total; the table retains baseline 1, baseline 2, replacement baseline, and the optional CPU 4× observation. No additional performance/polish loop occurred.
- All browser contexts and the browser were closed afterward. The root-owned app server was left intact for B's full suite.

## Retained raw measurements

| Observation | CPU setting | Core focusable, ms | Details held, ms | Details visible after release, ms | Last observed LCP, ms | Lab CLS maximum window |
|---|---|---:|---:|---:|---:|---:|
| Baseline 1 | Native CPU | 405.37 | 1068.11 | 33.58 | 384 | 0.004891906721536351 |
| Baseline 2 | Native CPU | 209.27 | 1056.97 | 34.55 | 204 | 0.004891906721536351 |
| Replacement baseline | Native CPU | 209.40 | 1046.76 | 32.99 | 200 | 0.004891906721536351 |
| Optional sensitivity | CDP CPU throttling rate 4 | 939.68 | 1127.63 | 45.45 | 864 | 0.004891906721536351 |

Median of the three retained baseline observations: **209.40 ms core focusable**, **33.58 ms details render after release**, **204 ms observed LCP**. Three samples do not establish p95/p99, expected user latency, or a population pass rate. The first observation includes higher local document response time and should not be silently discarded.

The last observed LCP candidate was the client H1 (`Synthetic Ana María Cruz`, size 24700). Native CPU retained baselines 1/2/replacement had zero recorded long tasks during the observation. The optional CPU 4× observation recorded five long tasks lasting **98, 74, 65, 72, and 76 ms**. Their total duration is 385 ms; this is not Lighthouse TBT or field INP, and no such score is claimed.

All retained observations confirmed the selector was enabled/focused, Manage booking was visible, and pending-details guidance remained visible before release. Zero external requests and zero page errors were observed.

## Optimized HTTP completion counts

Initial navigation in every executed optimized context had:

| Request | Attempts | Completed | Failed/aborted |
|---|---:|---:|---:|
| Core, `FM-120001` | 1 | 1 | 0 |
| Details, `FM-120001` | 1 | 1 | 0 |

The first four contexts also switched to linked booking `FM-120002`; each produced exactly one additional core attempt/completion and one details attempt/completion. The replacement context was limited to initial-navigation recovery evidence and did not repeat the switch.

The first four contexts each recorded seven intercepted API attempts across initial navigation plus booking switch: four Client Workspace metadata GETs, one simulated sync POST, one notifications GET, and one bookings GET. The POST was intercepted, so no server mutation was executed.

Comparison with development: the prior development observation recorded two initial core attempts, with the first aborted by cleanup and the second completed. The optimized run records one initial completed core read. This resolves the scoped optimized-browser duplicate-read evidence gap; it does not prove database query counts or every legacy route's request behavior.

## Actual browser resource inventory and representative waterfall

The replacement baseline observed the following local static resources, read before booking switching. Browser `encodedBodySize` measures the bodies actually received from the local optimized server; `transferSize` also includes overhead. These are not Vercel hosting measurements.

| Static resource class | Resources | Browser encoded body bytes | Browser decoded body bytes | Browser transfer bytes | First start, ms | Last response, ms |
|---|---:|---:|---:|---:|---:|---:|
| JavaScript, including runtime/shared/later imported chunks | 17 | 304841 | 1030632 | 309941 | 24.1 | 229.2 |
| CSS | 5 | 42458 | 277071 | 43958 | 24.0 | 40.8 |
| Fonts | 4 | 106712 | 106712 | 107912 | 23.5 | 188.8 |

Representative replacement-baseline sequence:

1. Document response starts at **19.4 ms**; DOMContentLoaded ends at **45.4 ms** and load ends at **117.0 ms**.
2. Initial shared/runtime JavaScript and CSS requests start around **24 ms**. The large shared Admin chunk finishes at **60.6 ms**; route Client Workspace chunk finishes at **57.0 ms**.
3. Subsequent font requests begin at **161.7 / 161.8 / 178.6 ms** and finish by **188.8 ms**.
4. The client H1 becomes the last observed LCP candidate at **200 ms**; the linked-booking control has been focused by **209.40 ms**.
5. Two later JavaScript resources begin at **222.6 / 224.1 ms** and finish by **229.2 ms**.
6. The deliberately held details data arrives later; its observed layout shift occurs at **1243.2 ms**, with value **0.004891906721536351**, after which details rendering is confirmed.

This sequence demonstrates that the core task does not wait for secondary fixture data. It does not establish critical-path optimizations for real hosted API/image data.

## Fresh optimized route manifest inventory

Read-only inventory from `.next-qa/server/app/admin/clients/[clientId]/page_client-reference-manifest.js`, deduplicating route entry chunks:

| Manifest inventory | Unique chunks | Raw bytes | In-memory gzip bytes | In-memory Brotli bytes |
|---|---:|---:|---:|---:|
| Route entry JavaScript, including shared Admin/framework entries | 8 | 526138 | 151100 | 131274 |
| Route entry CSS | 4 | 274364 | 40438 | 32121 |
| Client Workspace JavaScript beyond shared Admin entry set | 1 | 44348 | 13097 | 11540 |

Incremental route chunk: `static/chunks/0rlcy1wr4vorg.js`. Manifest compression is computed in memory per chunk, not transferred hosting size. The route-entry inventory is narrower than the browser's 17 JavaScript resources because the browser includes runtime and additional fetched chunks; do not confuse these two denominators. Media, fonts, HTML/RSC, API payloads, and future navigation assets are excluded from manifest totals.

## Conclusion and remaining evidence limits

Established in the fresh local optimized build: exactly one initial completed core read and one completed details read; enabled keyboard booking interaction during intentionally withheld secondary data; short details rendering after synthetic release; a low layout-shift observation within the measured window; explicit CPU sensitivity; and actual local resource plus route-manifest inventories.

Unestablished: field INP/CWV, Lighthouse score/TBT, physical mobile/Safari behavior, bandwidth-constrained real API latency, cold deployment/runtime behavior, database/index/RLS performance, provider throughput, large-client payloads, production concurrency/capacity, and CI-enforced performance budgets. These remain full-brief audit gaps and must not be filled by the small local sample or UX score inflation.
