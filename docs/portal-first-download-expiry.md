# Portal download expiry and client folders

## Behavior

- Provisioning creates RAW, SELECTED N PHOTOS, and EDITED PHOTOS under the client folder. It no longer creates/recreates DELIVERABLES or publishes a new mapping for it. Existing Drive files/folders are not deleted. Same-client legacy mappings remain available for recovery/cleanup; a root switch retires only stale index links as before.
- Edited uploads, print copies, portal previews and ZIP downloads still use the same verified enhanced file IDs. No copy/move or portal API redesign is needed.
- The portal notice shows the configured Portal expiry days (default 30) before downloading. No clock starts on provisioning, delivery, opening the portal/QR, previews, PIN submission, or View All Photos.
- Only a completed client portal Download All ZIP starts the clock. It is recorded on the server after the stream completes, before successful EOF. A cancelled, failed, or empty ZIP does not start it. A failed database update fails the transfer instead of silently dropping expiry tracking.
- The server cannot verify that a browser saved bytes to permanent storage, or observe downloads performed on Google's website. It uses completed portal transfer as the measurable event. Direct Drive access/sharing remains unchanged; portal expiry does not automatically delete or trash Drive files or revoke Google sharing.
- A service-only transaction locks the portal and records first_download_at, a snapshot of portal_expiry_days, and expires_at. Repeat/concurrent downloads and later settings edits never move that deadline.
- The existing expiry/status/ownership checks apply to the portal, QR, thumbnails, edited files, selection APIs and downloads. Background revision checks update the visible notice after a download, including one on another device. Dates are shown in GMT+8.
- Explicit admin renewal remains available. Renewing a portal that never recorded a download leaves expiry unset until the first one; after a recorded download, explicit renewal grants a new admin-controlled period without erasing history.

## Existing records and deployment

Install `supabase/migrations/20260908073000_portal_first_download_expiry.sql` before publishing the application. The migration adds two columns and a service-only function. It removes old deadlines only from active, unexpired portals without a recorded first download, auditing each previous deadline. Already expired or disabled portals stay closed. Older downloads were not recorded, so an eligible existing portal starts its new period on the first completed download after this release. No first-download timestamps are guessed or backfilled.

This migration changes active portal deadlines as requested. It does not delete any booking, payment, selection, photo, or Drive folder. Re-running it cannot reset an already-started timer. Use the recorded previousExpiresAt audit value for a deliberate rollback if required; do not bulk overwrite newer download deadlines.

Read-only verification:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='client_portals'
and column_name in ('first_download_at','download_expiry_days');

select has_function_privilege('anon','public.record_portal_first_download(uuid,uuid)','EXECUTE') as public_access,
  has_function_privilege('authenticated','public.record_portal_first_download(uuid,uuid)','EXECUTE') as member_access,
  has_function_privilege('service_role','public.record_portal_first_download(uuid,uuid)','EXECUTE') as service_access;
```

Expect two columns and `false, false, true`. Migration installation and production deployment must be verified separately; local tests are not proof of either.

## UI preservation

Client Portals table rows are vertically centered. The portal's Project Status, Included Photos counter, and submitted-selection notice use the existing rounded-control token; existing spacing, colors and business behavior are unchanged. The new expiry notice uses the existing rounded-card and portal color tokens.

## Local verification (2026-09-08)

- 322 tests passed, including isolated PostgreSQL migration/RPC execution, authorization, concurrent repeat downloads, settings snapshots, failed/cancelled streams, the actual ZIP route, and cross-device notice refresh.
- Production build/type checking, source security checks, secret scanning, and local production-mode HTTP security checks passed. Lint: zero errors and 35 existing warnings.
- Browser before/after checks used the real components with synthetic records at 1440 × 900 and 390 × 844. The two compact portal panels kept their exact width/height while changing from 0px to the existing 10px control radius. Provisioning status/button vertical centers now match. Mobile viewport and document widths both measured 390px.
- No production migration, deployment, Drive mutation, real client download, or client-data cleanup was performed during this implementation round.

## Production database installation (2026-09-08, GMT+8)

- Applied `20260908073000_portal_first_download_expiry.sql` to project `hrvyxxamxacosmbnkxwd`, main Production, through the authenticated SQL Editor. Verified at 05:22 GMT+8.
- Both columns and the service-only function are present. Public/anonymous and authenticated execution are denied; service-role execution is allowed. The normalized installed function body matches the local migration (MD5 `24baa51edb6d67def842c2f5cd14def8`).
- One active, unexpired legacy deadline was cleared; its previous deadline is retained in one audit record. The portal now has no countdown and no first-download timestamp. There were no expired or disabled portals to change.
- Before/after counts were unchanged: 1 booking, 1 payment, 11 gallery entries, 1 selection, 5 delivered files, and 1 portal. RLS remains enabled on client portals, selections, and delivered files. No client download was performed to test the timer, and no Drive operation was performed.
- This verifies the database installation only. The application changes still need publishing before downloads invoke the new function and the new notice appears. Until then, the old application can still write delivery-based deadlines; the database installation alone is not a completed application rollout.

## Final delivered-photo previews (2026-09-08)

- Final Deliverables now reuses `PhotoSelectButton` in preview-only mode and the existing `PortalPhotoPreview`, rather than opening an image in a new tab. Tap/click, 450 ms long press, keyboard activation, two-finger pinch, mouse-wheel zoom, drag, zoom buttons, and close behavior are shared with photo selection.
- Delivered-photo previews do not modify selections or invoke Download All. The same protected URL is used by each tile and viewer, retaining private image caching and authorization revalidation. Removed photos also close their open preview after a background update.
- The gallery keeps its existing grid, image ratio, spacing, labels, icons, colors, hover treatment, and Download All action. No new API or database change is required for this preview improvement.
- Verification: 327 tests passed, including delivered-photo gesture handlers, cache authorization and first-download separation. Production build and typecheck passed; the changed application components passed lint without warnings or errors.
- Browser checks used actual server-rendered components with synthetic records at 1440 × 900 and 390 × 844. Before/after gallery cards measured identically: desktop 254.0625 × 351.078125 px; mobile 156 × 228.5 px. Mobile document width remained 390 px. Browser screenshots verified layout; interactive gesture behavior was verified in the actual component-handler tests, not on a deployed client portal.
- These application changes have not yet been published to Vercel.
