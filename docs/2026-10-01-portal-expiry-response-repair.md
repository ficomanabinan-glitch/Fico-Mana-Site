# Private portal expiry response — reproduction and bounded repair plan

Source: confirmed checkpoint defect in `portalRecord()` and the owner's requirements for clear recovery, private portal expiry and unchanged business logic. Windows/Node/Next16.3.6, branch `codex/download-access-zip-single-file-20260929`, HEAD `ae30724366211d9d4df026e57e385374169d5eda`; dirty implementation preserved. No known-good historical expiry response was supplied, so no bisect or introducing-commit claim is made.

## Requirements, entities and risks (before test generation)

- EX-1: An expired portal remains inaccessible, but tells its client that access expired and to contact the studio. Inferred protocol choice: HTTP410/codePORTAL_EXPIRED; no new expiry period or automatic extension.
- EX-2: A first server-rendered visit and the existing browser API must present the same safe expiry guidance. Unexpected database/provider errors stay generic; don't expose internal details by message matching.
- EX-3: Keep existing workspace ownership, read rate limits, no-store, expiry boundary and active-portal behavior intact. No access to gallery metadata/binaries or mutation after expiry/ownership denial.
- Entities: public portal UUID, active workspace/booking relationship, status, expires_at, gallery revision, requestId and safe typed error. Synthetic records only.

Risks: expired date misreported as server failure (high likelihood/medium impact); widening error disclosure or bypassing expiry/ownership (low likelihood/critical impact); legitimate active portals rejected at a date boundary (low likelihood/high impact). Freeze time at2026-10-01T04:00Z, use actual hasPortalExpired/class/workflow/handler with only DB/network/auth boundaries stubbed. No new dependencies. Test-generation human acceptance remains DEFER, not an invented KEEP.

## Coverage matrix

| Requirement | Scenario | Priority | Oracle |
|---|---|---|---|
| EX-1/3 | Expired timestamp, exact boundary, or expired status with future timestamp | P1 | HTTP410/safe exactcode/message; only client_portals read; no returned private data |
| EX-1/3 | Active portal with future/no deadline | P1 | Existing revision fields and200; scoped known gallery data unchanged |
| EX-2/3 | Cross-workspace or unknown provider error | P0 | Generic500, no internal details, no downstream private reads |
| EX-3 | Read quota denial and malformed UUID | P0 | Existing429/404; zero portal data reads |
| EX-2 | First SSR expired visit / unrelated provider failure | P1 | initialData null, safe expiry guidance only for the typed expiry error; generic recovery otherwise |

## Scenarios, then separate oracles

Given a matched synthetic portal at/after its deadline (or explicitly expired), when its public GET is dispatched, access is denied with useful safe guidance. Given an active future/no-deadline portal, when its revision is requested, existing revision values remain available. Given a mismatched workspace or failed metadata read, when the same endpoint is called, it denies access without revealing details. Given a read-limited or malformed request, it never reads private metadata. Given SSR receives a typed expiry rejection, its initial unavailable screen explains expiry; an arbitrary error does not gain that disclosure.

Oracles: exactstatus/code/message and private-no-store; absence of gallery/booking reads and data; exact query tenant filters; correct active revision; no mutation/provider fetch; SSRinitialData null/error text; no known internal error string in responses. Existing APIs/exports verified in source before code. Regression is written RED before production edits. Revert-to-verify uses an in-memory source variant in the existing loadTs helper, never resets/stashes the user's working tree. Ten fixed-input iterations establish deterministic expiry reproduction.

## Execution and review

RED before application edits: eleven cases executed, six passed and five failed for the expected defect (production500 instead of410 or genericSSR copy). The active/no-deadline revision, ownership/provider failure and malformed/rate-limit controls passed. No live services were called.

Minimal repair: portalRecord uses the existing client-safe PortalSelectionError with PORTAL_EXPIRED/status410 after ownership validation. SSR exposes only this typed expiry error. Client load now throws the supplied reason unchanged; its existing catch adds fallback recovery only when advice is absent, avoiding duplicated/conflicting Try guidance. No access extension, schema or rate-limit change.

Same assertions GREEN: seventeen scoped expiry/SSR/download cases passed. Fresh complete suite497/497 passed in36.0982577s, zero failures/skips. The original QR static assertion was deliberately updated from the removed literal to the typed expiry contract; behavioral expiry tests establish actual denial. In-memory revert produces500/genericfailure again, while ten fixed-input actual reads produce410. Scoped lint/types pass. Fresh isolated optimized build MuVMcspXRR2Js2__pzuEF compiled5.7s/types34.7s and generated76static pages; parallel local checks affect elapsed build time, not user latency.

Updated browser contract: exact safe copy/410/code on the expired fixture; errors still classified only by exact declared URL/status. Six original scenarios pass6/6 in11.682825s at390/768/1440, zero retries/skips/flaky/unexpected,42 interceptedAPIcalls, zero guard violations or unexpected console/page errors. Report test-results/private-portal-expiry410-six-report.json; twelve screenshots under test-results/private-portal-expiry410-six. Root inspected phone/desktop expiry captures: advice wraps inside the existing centered panel, no exposed client/photo UI. This browser run verifies rendering/recovery through intercepted data; actual API/SSR enforcement is tested separately with synthetic DB boundaries, not hosted Supabase/RLS.

Skills: bug-reproduction1.0, unit-testing2.0, ai-test-generation2.0 and Impeccable harden. Exact runtime model ID isn't exposed and is not invented. Parent technical review is separate from mandatory human test acceptance (DEFER). Full-brief quality gate is not certified by this repair. No production change/deployment/commit/push occurred.
