# Client Portal approved-prototype implementation

Date: 9 September 2026

## Delivery status

Implemented locally on the existing branch. No automatic merge, GitHub push, Vercel deployment, production email, or live database migration was performed.

The approved HTML controls the visual direction. The subsequent request for rounded corners applies to navigation, controls, image tiles, preview surfaces, drawers, notices and inline add-on panels. Existing package quantities, price calculations, authentication, rate limits and selection locks remain production-authoritative.

## Checkpoints

1. Inspected the portal page, selection controller, preview, drafts, payment calculations, API submission, Drive workflow, catalog, print allocations, expiry, and Admin feedback patterns. Retained the existing architecture and dependencies.
2. Added the desktop contact sheet and sticky preview with the approximate 61.8/38.2 split. Mobile uses tap-to-select and a 450ms hold-to-preview with scroll cancellation. The floating prerequisite button stays fully opaque. The fifth-photo prompt uses the existing Sheet; extras follow live catalog prices and deterministic promotion.
3. Replaced free-print controls with visual pickers. Only included photographs are available. Toga, Alampay/Barong and Frame each require one; Wallet accepts one to four different photos. The existing allocation payload is unchanged.
4. Added the inline add-on accordion. One picker opens at a time and collapse does not erase choices. Explicit Remove is separate from Configure. Both included and extra enhanced photos can be assigned. The existing limit of four add-on types includes Extra Edit. Added server validation and storage for photo assignments.
5. Added a photographic Review with included/extras, print allocations, assigned add-on photos and payment totals. Preserved no-revision acknowledgement, the final PIN sheet, failure retry, draft lifetime, successful locking and server price snapshots. Overview replaces the permanent sidebar.
6. Published deliverables use a large photograph and filmstrip; no demo deliverables enter the portal. Download All, the PIN-gated original-photo Drive folder, and existing resource URLs remain. Added final-delivery expiry: verified upload publication or the existing staff Drive-link release timestamp starts the clock once.
7. Browser verification covers the requested viewport, gallery-size and selection-count matrices. Tested mobile hold/scroll cancellation, merged sticky navigation, preview-only desktop clicks, image skeletons, add-on persistence, PIN failure, successful submission and drawer dismissal.
8. Quality gates passed: typecheck, 368 automated tests, production build. Lint has zero errors and 33 pre-existing warnings outside the portal changes. Old visual assertions were updated for the approved prototype; security and workflow tests still exercise the production code.

## Components and behavior reused

- PortalQueryProvider and existing TanStack cache/pagination.
- ClientPhotoSelection controller, secure submission endpoint and server-authoritative billing.
- AdminToastProvider for success feedback, with an opt-in portal presentation; no new notification library.
- Existing Base UI Sheet for Overview, the five-photo prompt and final PIN confirmation.
- PortalPhotoPreview with protected URLs, keyboard controls, pan/zoom and layout-reserved loading states.
- PortalQrCode, PortalDrivePhotos, PortalExpiryNotice and usePortalPhotoSync.
- Existing 15-minute session draft: no PIN, private URL, image bytes or trusted prices are stored.
- Existing print manifest and enhanced-upload fulfillment rules; RAW originals are not modified.
- Existing next/font families. Motion remains restrained; reduced-motion preferences are respected.

## Main changed files

Frontend:

- app/portal/[id]/page.tsx
- app/portal/layout.tsx
- components/client-photo-selection.tsx
- components/portal-workspace.module.css
- components/portal-photo-contact-sheet.tsx
- components/portal-print-picker.tsx
- components/portal-addon-picker.tsx
- components/portal-review.tsx
- components/portal-overview.tsx
- components/portal-private-image.tsx
- components/portal-photo-preview.tsx
- components/portal-deliverable-gallery.tsx
- components/portal-page-skeleton.tsx
- components/use-portal-photo-sync.ts
- components/admin-toast-provider.tsx
- app/admin/filtering/batch/[batchId]/page.tsx (the existing Editor batch page also renders this component)

Backend and shared rules:

- lib/addon-photo-rules.ts
- lib/editor-workflow.ts
- lib/security/schemas.ts
- lib/portal-selection-draft.ts
- lib/portal-expiry.ts
- lib/portal-email.ts
- lib/booking-provisioning.ts

Verification:

- scripts/verify-portal-prototype.mjs
- tests/addon-photo-assignments.test.ts
- tests/portal-delivery-expiry.test.ts
- Updated existing portal interaction, delivery, expiry, QR, submission, and visual-regression tests.

Pre-existing unrelated edits in app/admin/expenses/page.tsx and app/globals.css were preserved, not replaced. Generated Next.js/TypeScript artifacts may also appear in the working tree.

## Database migrations and deployment order

1. Review and apply supabase/migrations/20260909005547_portal_addon_photo_assignments.sql.
   - Adds optional catalog photo limits and order photo IDs.
   - Known frame/A4/wallet/4R limits are seeded without changing prices.
   - Database guard rejects duplicate or cross-booking assignments.
   - Historical unassigned orders remain unchanged; new submissions require assignments where applicable.
2. Review and apply supabase/migrations/20260909010816_portal_final_delivery_expiry.sql.
   - Adds deliverables_uploaded_at.
   - Starts expiry once from the first published file or existing staff release timestamp.
   - Portal-ready email now records only its email timestamp.
   - Reconciles recognizable old automatic deadlines, retaining an audit of previous values.
   - Preserves explicit staff-set deadlines and never reactivates disabled portals. Explicit staff renewal remains available after delivery.
3. Verify the migrated schema and permissions on the intended Supabase project.
4. Deploy the application and verify a designated test booking across Portal → Filtering → Editor.

Both migrations were executed in isolated local PGlite tests. They have NOT been applied to the live Supabase project. Deploying the application before its required columns exist can make catalog/order reads unavailable.

## Verification scope and limitations

- Desktop widths: 1280, 1440, 1536, 1920.
- Mobile widths: 320, 360, 375, 390, 412, 430.
- Gallery sizes: 5, 20, 50, 100, 200.
- Selection counts: 0, 1, 4, 5, 6, 10.
- Local Chrome desktop/mobile emulation, not physical iOS/Android device testing.
- Browser fixtures intercept portal requests locally. No actual client selections, payments, messages or Drive files were changed by verification.
- Server tests use isolated service-boundary fixtures; SQL tests use a local Postgres-compatible engine. A live end-to-end smoke test remains necessary after an authorized deployment.
- Screenshots under artifacts/portal-prototype use synthetic booking details and either a geometric test image or the attached prototype image. They are verification artifacts, not production seed data.
- Custom catalog entries can use explicit photo_limit metadata; existing price-management screens were not redesigned.

## Recommended next step

Apply the migrations to a staging database, deploy a preview, and validate one test client's complete selection/review/editor-delivery journey. Promote to production only after that check. No merge or deployment is automatic.
