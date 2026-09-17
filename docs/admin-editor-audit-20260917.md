# Admin and Editor audit and QA evidence

Date: 17 September 2026. Changes in this pass are local; no deployment or production data mutation was performed.

## Follow-up remediation and loading optimization

Additional local changes preserve the incumbent layout and workflow:

- Pipeline status counts now use the same booking population as the review summary, including historical submissions. No review records were modified.
- File deletion uses a native modal dialog, focuses Cancel on opening, restores focus on closing, supports Escape when idle, blocks dismissal while deleting, and displays errors inside the confirmation.
- Files Management reuses opened-folder metadata for 30 seconds through the existing owner-bound, bounded browser cache. Uploads and deletes invalidate all folder snapshots; older-session responses are rejected. Private API responses and signed URLs are not shared-cached.
- Upload feedback starts before network progress begins, closing the initial duplicate-action gap.
- Parent-folder file queries request only identity/storage-key metadata; full displayed file details are fetched only at the file-folder level. Gallery/deliverable reads remain parallel and do not retrieve photo objects.
- Provisioning reads request explicit displayed columns and fail visibly when status/settings queries fail, rather than presenting missing/not-started states. Successful responses explicitly use private/no-store headers.
- Staff workspaces share a readable muted-text/placeholder floor; Files Management metadata was also corrected locally. This is not a full contrast certification for every colored/custom surface.

Verification: 327 regression tests and 10 desktop/mobile browser smoke checks passed before the additional provisioning-health regression. Final build and that regression are recorded in the completion message. The new dialog has isolated lifecycle/keyboard-cancel logic tests; authenticated rendered focus-trap verification remains required.

Performance limitations: no production speedup percentage is claimed. The earlier development-server spike result remains unresolved until an optimized isolated production environment can be run safely. Existing file-browser row caps still require scalable database-side aggregation/pagination for studios exceeding the current listing ceiling. Public pages already benefit from static/server rendering; interactive private staff views retain client rendering and server-authorized APIs. No global rendering-mode switch, public private-data cache, infrastructure load balancer, cloud mutation, or deployment was made.

## Coverage and integrity verdict

The incumbent dark, rounded operational interface is coherent. Navigation, permissions, payments, photo selection, and storage behavior are preserved. The final Impeccable source scan of `app/admin`, `app/editor`, the shared sidebar, and shared UI constants returned no findings. This is not proof of WCAG compliance.

All 15 Admin navigation destinations were opened in the authenticated live browser on desktop and at 390px mobile width: Dashboard, Bookings, Clients, Client Portals, Verification, Calendar, Shoot Reminders, Sales, Expenses, Reports, Packages, Media, Email Logs, User Access, System. Rendered headings appeared, and none had document-level horizontal overflow. This does not establish that every table cell is comfortable to use on mobile.

All six Editor navigation destinations were opened: Dashboard, Editing Batches, Client Selections, Upload Photos, Onsite Upload, Files Management. Several early captures were loading states. Mobile Dashboard was inspected after loading; other Editor mobile captures primarily established loading feedback, not completed-content usability. Dynamic batch details, every modal, and permission-specific variants remain a coverage gap.

### Provisional pre-fix technical health

| Dimension | Score | Evidence and limitation |
|---|---:|---|
| Accessibility | 2/4 | Unlabeled filters, subtle focus styles, insufficient secondary contrast; no full axe/keyboard certification. |
| Performance | 3/4 | Read caches, lazy file navigation, isolated regression checks; hosted throughput and field vitals unmeasured. |
| Responsive design | 3/4 | All Admin root pages fit tested mobile width; completed Editor mobile paths and 200% zoom incomplete. |
| Theming | 2/4 | Shared tokens exist, many page-local colors remain; admin primary foreground needed correction. |
| Implementation integrity | 3/4 | Strong domain-specific workflows and rounded controls; misleading initial storage state and exact-markup test drift. |
| Total | 13/20 | Provisional, not a post-fix or release-certification score. |

## Prioritized findings and local fixes

1. **P1 — Admin filters lack accessible names.** Bookings: five root filters; Sales: date and period; Packages: category and search; Email Logs: search; shared booking lookup. Added descriptive accessible names without changing filter logic. WCAG 1.3.1/4.1.2. Recommended harden, then polish.
2. **P1 — Primary button and input-focus contrast.** Admin uses lavender primary with inherited white foreground, and shared focus uses a faint accent. Corrected admin primary foreground to dark ink and shared input/select focus to a visible lavender ring. Placeholder opacity increased. Remaining individual low-opacity metadata must be tested separately. Recommended typeset/colorize, then polish.
3. **P2 — User Access form alignment.** Password controls aligned at the top rather than shifting for the one helper line. Account controls have stable responsive columns, visible field labels, wrapping identity text, busy-state protections, and safe form reset after asynchronous submission. Local implementation only; authenticated rendered proof of the new layout still pending. Recommended layout, then polish.
4. **P2 — Misleading Client Portals initial state.** Unknown storage settings previously read as missing credentials and counts as zero. Initial counts now show an unknown marker; storage distinguishes checking, unavailable, configured, and missing. Recommended harden, then polish.
5. **P2 — Notification semantics and small-screen width.** Added explicit button name/expanded state/control association and a viewport-bounded rounded panel. Shared sidebar now has a navigation landmark name. Recommended adapt/harden, then polish.
6. **P2 — Editor pipeline count inconsistency.** Live Filtering Dashboard showed Pending Review 29 in overview but 27 in the pipeline. Needs a shared business-status calculation; do not alter review records to reconcile presentation. Recommended clarify/harden.
7. **P1 verification gap — Custom destructive dialogs.** Files Management uses an ARIA modal but focus containment/return and Escape behavior need a full keyboard audit. Do not certify this path from role attributes alone. Recommended harden.

Positive findings: stable desktop workspace shells, named navigation links, existing confirmation and permission checks, responsive loading skeletons, rounded notices, cached reads, and opened-folder-only file loading. These should remain intact.

## Booking rate-limit change

Public booking middleware now uses 10 attempts per one-hour fixed window and a signed, HttpOnly, SameSite=Lax browser cookie. Hashes are stored in the existing service-only atomic inquiry counter. A new key namespace prevents old IP/day counters from carrying into the new policy. Retry-After reflects the remaining window. Staff authenticated submissions retain the existing exemption; receipt upload has its separate existing quota.

This limits **attempts**, not only successful bookings. Invalid or failed booking POSTs can consume allowance. The cookie identifies a browser profile, not hardware: clearing cookies/incognito/another browser can reset identity. First cookie-less concurrent requests and deliberate identity resets require broader abuse controls; invasive fingerprinting was not added. The second route-level per-resource limiter remains in place and is also configured to 10/hour.

Isolated SQL burst test: 100 queued attempts for one identifier allowed exactly 10, rejected 90, another identifier remained independent, and access reset exactly at one hour. PGlite uses one embedded connection; this does not establish hosted multi-connection PostgreSQL lock capacity.

## Automated checks and repeat commands

- Normal regression run: 325 tests passed.
- Endurance run: three rounds, eight workers, 325 passed each, 975 test executions total. First run exposed an expected navigation-markup change; the test now explicitly asserts the new label and still compares all prior structure/links/states.
- Production build passed before the final automation/config-only additions.
- Type check passed after Playwright installation; final automation additions require the final type check.
- Browser smoke: 10 passed across desktop Chrome and a mobile Chrome viewport. Sample-gallery tests choose five images, prove desktop click previews without selecting, enable Continue, and advance to Free Prints. Four anonymous staff routes are protected in both viewports. These are local synthetic tests, not hosted lifecycle tests.
- Broad Admin lint reports existing unused-import/effect-dependency warnings; no blanket dependency rewrites were made.
- Final TypeScript check and focused lint of the new automation and limiter passed.

### Executed local rendering load result

| Phase | Concurrent requests | Total requests | p95 | p99 | Errors |
|---|---:|---:|---:|---:|---:|
| Baseline | 5 | 40 | 380ms | 380ms | 0 |
| Stress | 15 | 90 | 786ms | 829ms | 0 |
| Spike | 30 | 120 | 1732ms | 1736ms | 0 |
| Recovery | 5 | 40 | 293ms | 294ms | 0 |

**Result: FAILED latency budget in spike phase.** All 290 requests succeeded, and recovery passed. This is a short, localhost development-server rendering probe, not sustained hosted capacity. Do not relax the budget to disguise the breach or infer a production bottleneck from development rendering overhead alone. Run the same profiles against an isolated optimized production build and correlate telemetry before optimization.

Commands:

```text
pnpm qa:e2e
pnpm qa:endurance
pnpm qa:stress
```

The browser suite starts a localhost development server if needed and refuses non-local URLs. Endurance results and logs are generated under `artifacts/qa`. The local read stress runner measures baseline, stress, spike, and recovery for homepage/sample SSR only. It asserts p95 < 1500ms, p99 < 3000ms, and error rate < 1%. These are provisional lab budgets, not field web-vitals targets.

`load-tests/workspace.js` supplies additional k6 baseline/stress/spike/soak profiles, restricted to localhost. k6 is not installed or executed in this pass. Its anonymous authorization probes require a correctly configured local service; setup failures are not capacity successes.

## Remaining release gates

1. Render the changed User Access and shared components on an isolated candidate at desktop/tablet/mobile, including 200% zoom, keyboard, slow/error/permission states. Do not infer production fixes from local source.
2. Complete Editor loaded-mobile and dynamic batch/file dialog checks; fix remaining proven accessibility/count issues.
3. Provision or identify an isolated staging Supabase/R2/email environment before provider-backed load testing. The production project must not serve as a load-test seed database.
4. Automate the complete synthetic booking → receipt → approval → onsite upload → portal → selection → review → batch → enhanced/print → delivery → download/reopen chain. Prior live testing reached submitted Pending Review; final enhanced delivery remains unproven.
5. Seed realistic 100–150-photo galleries and multi-client upload workloads; test duplicate filenames, retries, multipart interruptions, cross-client access denial, cleanup boundaries, SQL locking, and recovery under staged load. Measure hosted latency and correlate DB/server telemetry.
6. Run Lighthouse/RUM appropriately: lab LCP/CLS/TBT; field INP is not produced by a page-load Lighthouse run.
7. Commit the additive inquiry migration and verified source/QA changes. Confirm `psosdbnemnsspmsligpp` and `ficomana1/fico-mana-site` configuration, deploy an isolated READY artifact, smoke/log-test it, and promote only after explicit deployment instruction.

No release-ready or full-system stress-pass claim is made by this report.
