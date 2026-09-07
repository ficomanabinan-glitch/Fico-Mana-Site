# Full-width and loading release — 7 September 2026

This release is deliberately limited to seven existing UI/cache files plus regression tests. The separate security-hardening working tree is not part of this release.

- Remove the shared admin page's 1280-pixel maximum width. Both existing console main containers fill available width beside the sidebar.
- Keep sidebar dimensions, gutters, typography, colors, existing controls and responsive breakpoints.
- Prefetch sidebar routes on hover/focus/touch, with a 30-second intent deduplication window.
- Prevent stale requests from clearing newer requests in sales/package/editor caches, and prevent stale package responses from overwriting confirmed edits.
- Keep public website/client portal layouts, authentication, secrets, schema, APIs, Drive routing and deployment architecture unchanged.

The sidebar baseline fixture is copied from commit `056467a`, so rendered-HTML comparison does not depend on Git history being available in shallow CI checkouts.

Validation before release: 98 tests passed, typecheck passed, production build passed, lint had zero errors and 35 existing warnings; source/secret checks passed. The local build used synthetic CI values and is not uploaded. Vercel must build source using the existing Production environment.

Production preflight found no dedicated PORTAL_SIGNING_SECRET or GOOGLE_TOKEN_ENCRYPTION_KEY in the project's environment-variable inventory. The security branch rejects their absence, unlike the existing compatibility behavior. That branch must not be merged as part of this UI release: key migration/recovery and remaining security scope require separate resolution. No key is copied, rotated or exposed by this release.

The isolated `newadmin` redesign remains a separate queued implementation, not a feature of this release.
