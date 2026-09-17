# FICO MANA handoff and audit — 17 September 2026

## Current status

Production testing is paused at the editor selection-review queue. The full workflow is not yet certified. Only the clearly labeled synthetic booking below was created or changed during this test.

- Workspace: `E:\zzzzFICO LOCAL\Fico-Mana-Staging`
- Branch: `codex/ui-consistency-portal-polish-20260908`
- GitHub: `ficomanabinan-glitch/Fico-Mana-Site`
- Vercel: `ficomana1/fico-mana-site`
- Production artifact: `dpl_9A3xEws7FQLZgdDwYtTfEkP7bwZE`
- Artifact URL: `https://fico-mana-site-62ztkkj73-ficomana1.vercel.app`
- Deployed source commit: `6f030a2` — secure staff account management
- Required database: Supabase `psosdbnemnsspmsligpp` (`ficomana-new2026`)
- Private photo storage: Cloudflare R2

## Completed and verified

### User Access release

Admin User Access lists authentication accounts, creates staff accounts, assigns permitted roles, deletes eligible users with email confirmation, and lets the signed-in user change their own password using their current password. Server authorization protects owner accounts and self-role/self-deletion. The master owner account was verified; credentials are intentionally omitted here.

Pre-release checks: 323 tests passed, TypeScript and focused lint passed, production build passed. The candidate reached READY, anonymous route/authentication smoke checks passed, and the exact artifact was promoted. The live User Access page was verified with an authenticated master session.

### Production workflow test

Synthetic booking: **FM-988057 — QA WORKFLOW TEST 20260917**

- Package: FICO PACKAGE; shoot date: 2026-09-18.
- Test email: studio-owned `ficomanabinan@gmail.com`.
- No real bank payment was made. A sample PNG was used solely as QA payment proof.
- Public form navigation passed through package, calendar, graduation details, contact, and deposit.
- Receipt endpoint uploaded a valid sample image successfully.
- Initial booking submission failed with 503. Production logs identified the missing `consume_inquiry_rate_limit` RPC.
- The missing rate-limit table/function was added in the required Supabase project. An initial SQL variable naming error was corrected before final validation.
- Explicit function check returned `allowed=true`, `remaining=19`, and a valid reset timestamp.
- Retrying the same reference and same receipt returned HTTP 201. The booking was saved without another receipt upload or duplicate rejection.
- Payment approval was verified with a fresh database query: `Confirmed / Paid Deposit`.
- Onsite upload used five distinct local JPG/PNG sample files: `booking_model_preview.jpg`, `gallery-1.png`, `gallery-2.png`, `gallery-3.png`, `preview.png`.
- Upload UI reported **5 uploaded, 0 failed**; refreshed gallery count was 5; portal email showed **Email Sent**.
- The private portal loaded all five photos. The client selected five included photos, assigned Toga/Alampay/Frame prints, and assigned four different wallet photos.
- Optional add-ons were skipped. Review showed package ₱3,500, paid ₱500, balance ₱3,000.
- PIN confirmation and final submission passed. The portal displayed that the final selection was submitted and duplicate submission was blocked.
- The synthetic record appeared in the editor Pending Review queue.

## Local work not yet committed/deployed

1. `supabase/migrations/20260917174500_add_inquiry_rate_limit.sql`
   - Applied to the production database through SQL Editor; the repository migration is currently untracked.
   - Restore this in version control before the next release so fresh databases do not repeat the booking outage.
   - Verify function execution privileges remain service-role only, denied requests, window reset, and concurrency before declaring the migration fully regression-tested.
2. `app/admin/users/page.tsx`
   - Password form now top-aligns field blocks so helper text does not raise one input.
   - Account rows share identity/status/management columns, with labeled editing controls and responsive reflow.
   - Long names/emails wrap; nested grids can shrink; editing controls disable while requests are pending.
   - Password hints are associated with their input.
   - Async successful form resets use a captured form reference.
   - Mechanical Impeccable detector, focused ESLint, and TypeScript checks passed after these edits.
   - Rendered desktop/mobile visual verification remains pending; these fixes are local only.
3. `tsconfig.tsbuildinfo` is generated and modified. Do not include it in the feature commit.

## Audit findings and limitations

### P0 — Public booking rate-limit migration missing (live repair verified)

Middleware failed closed because the required RPC was absent. Receipt upload could succeed first, then booking creation failed. The live repair now permits saving the same pending reference/receipt. The source migration still needs a commit and regression coverage.

### P1 — Remaining production lifecycle unverified

Selection approval/reopen, editing-batch archive download, enhanced upload/naming, unchanged print output, client final delivery/download, duplicate filename prevention, and Files Management operations have not yet been exercised in this run.

### P2 — User Access alignment (local fix, visual check pending)

Screenshots showed bottom-aligned password fields with unequal helper heights and inconsistent account-row column topology. Scoped fixes preserve the dark rounded admin identity and existing access rules.

### P2 — Booking contact accessibility

Several contact fields lack programmatic label association (name, phone, Facebook name/link, notes). Email fields were discoverable by label. Add explicit input IDs/label associations and test keyboard order without changing validation or submitted data.

### P2 — Loading truth in Client Portals

Before the provisioning request completes, the screen briefly displays zero counts and “Storage credentials are missing.” Loaded data then shows configured storage. Replace false initial status with a loading/unknown state to avoid misleading staff.

### Browser automation limitations

Chrome receipt attachment failed because the extension disallowed local file URLs. The receipt stage was tested through the production multipart endpoint, not completed through the public file picker. To enable Chrome uploads: open `chrome://extensions`, open ChatGPT extension Details, and enable “Allow access to file URLs.”

Native Chrome confirmation dialogs caused control timeouts. Approval was later verified by database state; the isolated in-app browser handled onsite file uploads and portal interactions. Do not confuse extension timeouts with application failures.

Performance baselines, Lighthouse/mobile throttling, field Web Vitals, cross-browser tests, and a 100–150-photo gallery test remain unperformed. No performance improvement is claimed. Do not run production stress/load tests without separate operational coordination.

## Next sequence — follow this order

1. Finish the paused synthetic workflow in `editor.ficomana.com/editor/filtering`. Filter **FM-988057** and operate only on this record. Review five selected photos and print assignments, then approve.
2. Verify the approved editing batch, download its archive, and inspect source/print mappings. Upload sample enhanced files through the normal editor upload flow. Confirm retry-safe `ENHANCED <number> - <CLIENT NAME>` names and unchanged print filenames.
3. Reload the synthetic client portal. Verify delivered photos, preview/zoom, individual downloads, and final archive download. Check production logs for the exact requests and database/storage results, not HTTP success alone.
4. On the same QA record, verify duplicate filename rejection, Files Management lazy folder browsing/previews, and selection reopen/resubmit notification. Do not delete test or real files without confirming exact targets.
5. Finish User Access desktop/mobile visual checks, including the add-account form, long identifiers, keyboard navigation, loading/error states, and disabled actions. Do not alter real account roles/passwords for UI tests.
6. Fix the contact-label and provisioning-loading findings. Add focused regressions for the missing rate-limit database contract and any reproduced workflow failures.
7. Measure homepage, booking, synthetic portal, admin, and editor page performance. Use the performance-testing skill: establish LCP/CLS/TBT and request/bundle/image baselines first, then optimize demonstrated bottlenecks. Lab TBT is not field INP. Test large galleries using isolated sample data, not real customer bulk uploads.
8. Run relevant unit/API/database/browser/accessibility tests, lint, typecheck, build, secret scan, and dependency security checks. Document exact passes/failures and untested scope.
9. Commit scoped fixes and migration to the existing branch, push, deploy an isolated Vercel candidate, wait for READY, smoke-test with protection-aware requests, scan authenticated/5xx logs, and only then promote the exact validated artifact. Recheck all three custom domains after promotion.
10. Report and separately authorize cleanup of **FM-988057**, its QA payment record, portal, and sample objects. Its synthetic deposit currently affects test-visible finance totals; it is not a real payment.

## Suggested QA skill order

`database-testing` → `api-testing` → `agentic-browser-testing` → `accessibility-testing` → `performance-testing` → `release-readiness`.

Already used in this run: agentic browser testing, performance-testing guidance, and Impeccable layout/harden. Performance measurement itself is still pending.

## Safety boundaries

Do not use the old Supabase project. Do not expose service keys or copy credentials into reports. Preserve real bookings, files, account roles, R2 objects, and unrelated local changes. Never certify the full release from a build or a single HTTP 200. Keep this QA record clearly distinguished from real studio work.
