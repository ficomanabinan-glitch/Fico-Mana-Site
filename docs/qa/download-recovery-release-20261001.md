# Download recovery release — 1 October 2026

## Outcome

Released the independently streamed ZIP implementation and interrupted-download request recovery to production. The two reported client accounts have download access available again. No client photos, bookings, selections, payments, or staff accounts were deleted.

## Confirmed defects and repairs

- The prior ZIP implementation shared archive/codec scheduling across requests. An interrupted transfer could leave another request waiting without producing its ZIP header. A deterministic regression test reproduced this before the repair. The old production worker also returned HTTP 200 with zero bytes and a runtime hang error, while the same synthetic object streamed successfully through the separate file route.
- Archives now use a request-local, uncompressed ZIP64 stream, incremental CRC32, and Cloudflare `FixedLengthStream` for the exact archive length. Only one R2 body is streamed at a time. There is no shared archive queue and no whole-shoot memory buffer.
- Disconnects cancel the upstream reader and complete the manifest as failed, releasing the reserved allowance. A late completion cannot consume a replacement grant.
- Repeated requests for download access return the existing pending request instead of a misleading error. An interrupted reserved grant can be safely returned to the editor's pending queue with the client's reason.
- The client and editor interfaces refresh download state while visible and on focus/reconnection. The editor panel distinguishes a failed queue read from a genuinely empty queue.
- The two-originals-downloads-per-seven-days policy remains unchanged. Individual-photo downloads do not spend a bulk-download allowance and retain their separate abuse controls.

The Impeccable hardening guidance informed the clearer status messages, error/retry behavior, and stale-response protection. The existing visual design was preserved.

## Test evidence

- Full automated suite: **423 passed, 0 failed**.
- Worker regression suite: 12 tests, including simultaneous independent requests, a stalled source, cancellation, truncated objects, Unicode filenames, CRC validation, and bounded streaming of a large archive.
- Request recovery/access regression suite: 7 tests, including invalid reasons, expired portals, workspace isolation, anonymous execution denial, repeated requests, interrupted grants, late completion, and migration rollback/reapplication.
- TypeScript checking, focused ESLint, production build, security source checks, secret scan, and diff checks passed.
- Production SQL verification confirmed recovery was installed and the RPC was not executable by anonymous callers.
- Authenticated production browser checks verified the recovered request appeared with its reason, could use the studio's existing grant, and the client download control became available again.

## Live synthetic archive checks

Only a synthetic private R2 fixture was downloaded. No real client photos were used and no client download quota was spent by these archive tests.

| Files | ZIP bytes | Transfer time | Validation |
| --- | ---: | ---: | --- |
| 205 | 1,074,825,952 | 103.82 seconds | Every file CRC and SHA-256 matched the fixture |
| 340 | 1,782,638,242 | 166.02 seconds | Every file CRC and SHA-256 matched the fixture |

The final large check completed with a successful Worker outcome, no runtime exception, and 30.999 seconds of CPU time. The Worker has a bounded 120,000 ms CPU allowance for legitimate large photo collections; its existing IP request limiter and billing plan are unchanged. These are single live transfer observations, not a promise of identical timing on every client connection or a concurrent-load benchmark.

## Release identity

- Application source repair: `e7e7473`.
- Validated Vercel artifact: `dpl_99q38wweEtYbiiV8UQ6YLTcHoNU1`.
- Isolated deployment: `https://fico-mana-site-qdxtrpm94-ficomana1.vercel.app`.
- Final private-download Worker version: `30fa60d0-7409-4078-84d1-7dae9db7ba38`.
- Production database: the verified `psosdbnemnsspmsligpp` project.
- Applied migration: `supabase/migrations/20261001031500_recover_interrupted_download_requests.sql`.

The isolated application artifact reached READY, passed protection-aware route checks, and was promoted only after the large ZIP verification. Public production pages responded successfully, unauthenticated editor API access remained denied, and post-release error logs contained no errors in the checked window.

## Recovery instructions and limitations

Clients should reload the portal and start a **new** download. Old failed entries in Chrome's download history can contain failed/invalidated manifest links and should not be resumed. This release does **not** claim HTTP Range/resume support.

If a transfer fails again, record the time, booking reference, displayed archive size, and whether it started receiving bytes. Never paste a signed portal or download URL into public reports. Correlate the manifest state and Worker outcome before attributing a failure to the client's internet connection.

Rollback must consider the application, Worker, and request function together. Do not revert to the known shared-queue archive implementation as a default recovery action. Preserve client records and use failed-manifest completion to release only verified failed reservations.
