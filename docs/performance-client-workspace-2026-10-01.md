# Client Workspace local performance evidence — 1 October 2026

This is a bounded diagnostic record for the remaining full-brief audit. It is not a production latency, Core Web Vitals, hosting capacity, or deployment-readiness claim. No implementation files changed during this measurement.

## Method and boundary

- Browser: local headless Chromium through the installed Playwright package, 1440 × 900 CSS viewport.
- Application: the existing isolated Next development server at `http://127.0.0.1:3200`.
- Three fresh browser contexts; the development route was already warmed by earlier QA.
- Data: existing `e2e/fixtures/client-workspace.ts` core/details fixtures and synthetic session. Every `/api/` request was intercepted. External requests were blocked. No Supabase, R2, mail, production, or cloud service was contacted.
- Timing starts immediately before navigation. “Core interactive” means the synthetic client heading is visible and the linked-booking selector is visible, enabled, and successfully focused. The existing Manage booking link is visible while secondary details remain intentionally pending.
- Secondary details were held for approximately one second after the request arrived, then released. “Details UI after release” measures until the package-balance field becomes visible. This measures browser rendering/scheduling after synthetic fulfillment, not database/provider latency.
- Browser/context were closed after each run. The shared QA server was not stopped or changed.

## Raw observations

| Trial | Core interactive, ms | Held secondary request, ms | Details UI after release, ms | Booking focus confirmed | Manage booking visible | Pending details instruction visible |
|---|---:|---:|---:|---|---|---|
| 1 | 640.75 | 1053.85 | 35.33 | Yes | Yes | Yes |
| 2 | 429.80 | 1050.94 | 35.69 | Yes | Yes | Yes |
| 3 | 527.11 | 1083.73 | 33.67 | Yes | Yes | Yes |

Median core-interactive observation: **527.11 ms**. Median details-render observation after release: **35.33 ms**. These three warm local development observations do not establish a latency percentile or a real-user performance budget.

Each trial recorded zero external requests and zero page errors. The core record and a real keyboard-focus interaction remained available while secondary production/payment data was deliberately withheld.

## Duplicate HTTP request classification

All three development trials recorded:

- First booking `FM-120001`: **two core GET attempts**, **one details GET**.
- After deliberately switching to linked booking `FM-120002`: **one new core GET**, **one new details GET**.
- Eight intercepted API attempts across the navigation plus booking switch: five Client Workspace reads, one simulated `/api/sync` POST, one notifications GET, one bookings GET. The sync POST was intercepted and did not execute a server mutation.

A separate single bounded event-classification run observed this exact initial sequence:

1. First core GET requested.
2. Second identical core GET requested.
3. First core GET failed with `net::ERR_ABORTED`.
4. Second core GET finished.
5. Details GET requested and finished.

The component has a core fetch effect with `AbortController` cleanup and dependencies `[clientId, bookingId, coreRetry]`, and a separate details effect after core state is available. The observed aborted/restarted development request is consistent with React development effect replay. It is **not evidence of two completed production reads**. A corresponding optimized-server navigation is still needed to prove the production request count; do not report “no duplicate HTTP requests” from the development run.

## Generated optimized artifact inventory

Read-only inventory used `.next/server/app/admin/clients/[clientId]/page_client-reference-manifest.js` and its unique route entry chunks. It did not launch or navigate an optimized server.

- Build ID: `KifFFMX1jw70oFSEGOYlr`.
- Route manifest modified: `2026-10-01T05:23:30.882Z`.
- Client Workspace source modified: `2026-10-01T04:57:43.541Z`.
- Admin layout source modified: `2026-10-01T04:20:13.385Z`.
- The manifest postdates those two source files. This does not independently establish freshness of every other source file or a full deployment candidate.

| Inventory | Unique chunks | Uncompressed bytes | In-memory gzip bytes | In-memory Brotli bytes |
|---|---:|---:|---:|---:|
| Route entry JavaScript, including shared Admin/framework chunks | 8 | 525450 | 151017 | 131342 |
| Route entry CSS | 4 | 274364 | 40438 | 32121 |
| Client Workspace JavaScript beyond the shared Admin entry set | 1 | 43629 | 12977 | 11443 |

The incremental Client Workspace chunk is `static/chunks/33jn1gna23ai0.js`. The complete route entry set includes shared chunks and must not be described as the component's standalone size. Gzip and Brotli values were computed in memory per chunk; they are not observed hosting transfer sizes. Boot/runtime files outside the route entry manifest, future lazy loads, media, fonts, HTML/RSC payloads, and API responses are not included in these totals.

For comparison only, the development browser Resource Timing entries reported 21 script resources with a combined encoded-body size of 1215764 bytes in each timing trial. Development assets/HMR differ from optimized assets; this value must not be compared directly as a production bundle regression.

## What this establishes and what remains

Established locally: progressive core/details loading permits an enabled booking interaction and visible workflow destination during held secondary reads; details render shortly after fixture release; changing booking produces the expected additional core/details pair; the initial extra development core attempt is aborted; generated optimized route-entry chunk sizes can be inventoried.

Unestablished: optimized-server core-interactive timing/request count, cold navigation, mobile CPU/network throttling, CWV/LCP/INP/CLS, real database/index latency, real provider throughput, large-client payload stress, production concurrency, and hosting transfer compression. These gaps remain explicit requirements-audit evidence limits. No UX score was changed on the basis of this diagnostic.
