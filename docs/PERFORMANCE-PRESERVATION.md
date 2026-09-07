# Performance and interface preservation

Baseline: commit `056467a`, 7 September 2026. This pass also contains compatible security hardening. No router, schema, deployment architecture, routes, or API response shapes are to be replaced. The user subsequently authorized one visible exception: full-width main content in the original admin and editor portals. The shared admin page width cap is removed; both existing main elements explicitly fill the available content area. Sidebars, gutters, typography, dialogs and forms retain their existing design.

## Existing route and component structure (recorded before performance edits)

- Root `app/layout.tsx` supplies fonts, global CSS and deferred analytics. Public routes: `/`, `/packages`, `/gallery`, `/privacy`, `/terms`, `/filtering`, `/submit-raw-photo`, `/portal/[id]`, `/shoot-response/[token]`.
- `/admin` owns the existing sign-in page and persistent admin layout. Children: `/mfa`, `/dashboard`, `/bookings`, `/calendar`, `/clients`, `/provisioning`, `/provisioning/[id]`, `/verification`, `/filtering`, `/filtering/batch/[batchId]`, `/sales`, `/expenses`, `/reports`, `/packages`, `/media`, `/emails`, `/system`, `/shoot-reminders`.
- `/editor` owns the existing editor layout/shell. Children: `/login`, `/onsite`, `/queue`, `/upload`, `/batch/[batchId]`.
- `components/dashboard-sidebar.tsx` renders navigation/profile for the existing shells. Page headers, tables, buttons, cards, chart markup, design tokens, and styles are unchanged by this pass.
- `app/admin/loading.tsx` and `app/editor/loading.tsx` already provide loading boundaries. Admin page/loading skeleton components and `components/editor-page-skeleton.tsx` already exist; retain their exact dimensions and styling.
- Sales and packages use 90-second in-memory read caches; editor batches use 30 seconds, with a 60-second synchronization freshness interval. These are browser-session caches, not shared caches of private responses. Preserve expiry, selected filters, and forced-refresh behavior.
- Next already minifies production CSS/JS and splits App Router routes. Image config already supplies AVIF/WebP; fonts are locally served. Do not add duplicate optimizers or change original client photographs.

## Before-state observations

Authenticated production dashboard captured through the FICOMANA browser profile at desktop **1440 x 900** and mobile **390 x 844**. Existing dashboard: sidebar, header/sync controls, search, six summary cards, session schedule and weekly revenue chart. No test records created.

An initial narrow capture appeared to overflow, but later captures followed user navigation and viewport changes. A fresh, isolated dashboard baseline at **390 x 844** correctly shows the mobile header and a single column. Do not treat the initial observation as a confirmed responsive defect.

For the subsequently requested full-width exception, fresh production dashboard baselines are saved under ignored `artifacts/preservation/production-dashboard-1920x1080-before-width.png` and `production-dashboard-390x844-before-width.png`. At 1920 pixels, the original shared `max-w-7xl` page cap leaves unused space to the right. These are before-state screenshots, not proof of the local modifications running in production.

Local unchanged application started on `http://localhost:4277`. A separate local staff session is needed for authenticated before/after comparison; production cookies are not extracted or transferred.

## Smallest proposed changes

1. Replace unconditional full sidebar route prefetch with hover/focus/touch intent prefetch, retaining native Next Link and all markup/classes.
2. Fix stale-request cleanup races in existing sales/package/editor caches so an old completion cannot clear a newer in-flight request.
3. Prevent an older package read from overwriting an acknowledged package edit.
4. Preserve existing skeletons, stale-content behavior and private/no-store API headers. No new UI components, animations, fonts or assets.
5. Explicit user exception: remove only the shared admin page width cap and set both console main elements to `w-full min-w-0`. Keep the 260-pixel desktop sidebar and existing 20/32-pixel content padding. Editor pages already have uncapped page wrappers. Remaining maximum widths are for dialogs, authentication forms, readable paragraphs and individual controls, not the main page. Legacy `/filtering` redirects inside the admin shell; the public website and client portal are unaffected.

## Verification record

Cache tests verify that invalidating an active read then starting a replacement does not create a third network request when the old read finishes. An acknowledged package edit wins over an older response. The sidebar produces byte-identical server-rendered HTML against the baseline in desktop/mobile navigation states. Intent prefetch is the only navigation change.

Local authenticated testing of the full security branch remains blocked by missing server configuration. After the user authorized deployment, only the compatible UI/performance subset was released as `8bd808c`. Its authenticated production admin/editor dashboards were inspected through the existing online browser sessions at 1920 x 1080 and 390 x 844. Screenshots are saved as `artifacts/preservation/released-admin-1920x1080.png`, `released-admin-390x844.png`, `released-editor-1920x1080.png` and `released-editor-390x844.png`. Compared with the matching online baselines, admin desktop content expands as requested; the editor and mobile layouts retain their prior appearance. These empty-dashboard checks do not validate populated tables, uploading states or the unreleased security changes. No auth bypass, cookie extraction or customer-record write was used.

The user subsequently requested removal of the decorative box icon beside “Packages and client photo-selection rules” in System Settings. This is another explicit small visual exception: only that icon and its unused import are removed. The heading, description, Manage Packages link and actual selection rules are preserved. The separate follow-up release is `d12a227`.

Local verification: 112 tests passed, including the full-width regression test; typecheck passed. Lint had zero errors and 35 existing warnings. The production build with synthetic CI-only credentials and production HTTP header/origin checks passed again after the final width change. Source and credential checks passed. Full-history Gitleaks 8.30.1 scanned 200 commits with no remaining credential findings after one narrowly reviewed public publishable-key exception. See the security release gate for deployment blockers. No speed percentage or Core Web Vitals improvement is claimed without measurements.
