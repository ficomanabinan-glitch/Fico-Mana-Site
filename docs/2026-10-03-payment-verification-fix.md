# Verification Queue repair and in-site confirmations — 2026-10-03

Status at repair handoff: implemented and tested locally; deployment pending. Production bookings, receipts, notifications and email were not changed by testing. The subsequent release result is recorded separately.

## Report and reproduction

Approving or rejecting every booking in Verification Queue returned “Some reservation details could not be verified. Please review the form and submit again.” Approval and quick forged-receipt rejection also opened Chrome's native confirmation instead of an in-site popup.

Minimal deterministic reproduction: map a database booking with `client_id` into the read model, change its verification status, and pass the entire read model to `saveBooking`. The strict POST schema rejects read-only `clientId`. Independently, rejecting a forged receipt deliberately writes `receiptUrl: ''`, which the old schema rejected.

The read-only production log corroborated the shared failure: POST `/api/bookings`, HTTP 400, `Booking validation rejected fields: [ 'booking' ]`, on deployment `dpl_yodCVJ7a5MxoqD7YfKWqEnJL4fZy` (log timestamp 1791009999457).

History inspection identified `8dc2f57` as the commit adding `clientId: b.client_id` to the read model. This is inspection evidence, not a completed automated bisect; the dirty workspace was preserved.

## Implementation

- `lib/booking-write-payload.ts` explicitly projects the 41 writable booking fields. `saveBooking` no longer sends client/provisioning/response metadata back as writable fields. An exact schema-key regression check guards drift.
- Strict server validation remains enabled. Client identity remains server-owned. Arbitrary receipt URLs and invalid prices remain rejected.
- Staff booking validation permits an explicit empty receipt link so forged rejection can clear it. The public receipt-resubmission schema remains unchanged.
- Verification approval and forged rejection use the existing `StaffModalFrame` for an in-site confirmation with client name, FM reference, peso deposit, clear consequences, Cancel and the appropriate confirmation action.
- The existing ordinary rejection reason form remains in-site and keeps its behavior.
- An immediate in-flight guard and disabled loading controls prevent repeated saves and busy dismissal. Failed confirmation saves keep the popup open with an inline announced error and allow retry.
- Explicit opener capture restores keyboard focus on cancellation, including confirmation opened from the receipt preview. Cancel is initially focused; background page controls are inert while the native HTML dialog is modal. No Chrome confirm/alert is used in Verification Queue.
- Impeccable hardening guided failure feedback, safe cancellation, accessible focus and responsive controls. Existing colors, typography and workflow were retained.

## Evidence

Environment: Windows, Node, Next.js 16.3.6 / React 19; isolated optimized `.next-qa` build; Chrome desktop and Pixel 7 mobile emulation; locale en-PH, timezone Asia/Manila. Browser clock fixed to 2026-10-03T01:00:00Z before navigation.

- Before the fixes, targeted mutation tests reproduced the reported validation failure; 3 of 4 checks failed as expected.
- Final targeted mutation suite: 6 passed. Ten in-memory cycles independently remove each backend fix, reproduce its failure without writes, and confirm the implemented fixes pass. No working-tree rollback or real database mutation was used.
- Full Node regression suite: 539 passed, 0 failed, 0 skipped. Run after the write/schema/focus fixes. The final inline-error addition was then covered by the focused mutation suite and final browser run.
- Final browser suite: 10 passed, 0 failed (five scenarios across desktop and mobile): approval cancellation/focus/double-click/busy Escape; failed approval with inline error and retry; nested receipt confirmation cancellation; ordinary reason rejection; forged rejection with intentional receipt clearing.
- Focus-return and inline-error checks were each observed failing before their respective UI fix, then passed on the rebuilt candidate.
- Final optimized build including TypeScript: passed, all 76 static pages generated. Touched-file ESLint: passed.
- Security source checks and secret scan: passed; secret scan included 768 tracked/non-ignored text files. `git diff --check`: passed.
- Desktop/mobile confirmation screenshots showed no horizontal overflow. Final browser evidence asserts no browser-native prompts, customer downloads, runtime page exceptions, undeclared API calls or hosted-origin requests.

Regression files: `tests/payment-verification-mutation.test.ts` and `e2e/payment-verification.spec.ts`. Playwright evidence is under ignored `test-results/` and `playwright-report/`.

## Boundaries and next step

Browser responses, authentication, notifications, email and provider boundaries were synthetic. The mutation regression exercises the actual `saveBooking`, strict schema and POST handler with explicit in-memory provider stubs. This is local verification, not proof of a real production approval or email delivery.

No database migration is required. Existing unrelated changes were preserved. The owned port-3200 QA server is stopped after verification; no other server was stopped.

On an explicit deployment request: isolate only this repair and its tests, inspect the staged paths, run release checks, deploy an isolated candidate, wait for READY, perform protection-aware smoke checks, inspect logs, and promote that exact candidate. Do not approve or reject real customer bookings as a test without explicit authorization.
