# Editor client queue repair

- Report: "Client queue unavailable / Could not load the client queue" on Client Selections.
- Affected production build: `98f40a789ab8d6f082ae0a54dff18ff7042f508f`; still present in the CMS-only candidate `ee6c52e`.
- Minimal live reproduction: GET `https://editor.ficomana.com/api/bookings/client-priorities` returns 307 to `/editor/api/bookings/client-priorities`; authenticated production requests then returned 404. The admin-domain request returned 200 in the same log window.
- Cause: editor subdomain page aliasing did not recognize the shared queue endpoint. A second server boundary restricted reads to administrators, although editors need to see the queue.
- Repair: exact endpoint pass-through, editor-capable workspace-scoped reads, private/no-store response. Queue mutations retain administrator authorization. Editor-only accounts see the order without an unusable reorder control.
- Tests: `tests/editor-client-queue.test.ts` runs real middleware/route code with explicit auth/database doubles; routing repeats ten times without network, clock, or real records. Three assertions failed before the repair (redirect, editor read, role rejection), all five pass after it. `e2e/editor-queue.spec.ts` checks editor/admin presentation with synthetic data on desktop/mobile.
- History: no known-good editor-domain queue baseline was supplied, so no history bisect was performed.
- Scope: no client data, booking order, authentication credentials, or storage files changed.
