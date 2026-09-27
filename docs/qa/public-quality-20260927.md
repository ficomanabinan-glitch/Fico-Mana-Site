# Public-page quality and editor queue release

## Changes

- Branded, server-rendered missing-page recovery with a real HTTP 404, one H1, keyboard-visible recovery links, and original-client-link guidance. No image or animation dependency was added.
- Homepage now has one shared responsive H1; standalone gallery promotes its existing title to H1. Staff navigation wordmarks are no longer extra H1s.
- Existing page-specific canonical URLs and canonical sitemap retained. Staff hosts disallow crawling; staff/private routes also emit `X-Robots-Tag: noindex`. Robots directives supplement authentication, not replace it.
- Analytics only mounts on known public marketing pages on the public domains. Its event URL excludes query strings/fragments; private/bearer/unknown URLs are dropped. Analytics and receipt enhancement use conditional dynamic imports.
- Package-page background now loads eagerly after the browser identified it as above-the-fold/LCP content.
- Editor queue repair accompanies the release; see `editor-client-queue-20260927.md`.

## Evidence

- 394 Node regression tests passed. TypeScript, production build, targeted lint, security source checks and secret scan passed.
- 24 focused Playwright cases passed across desktop/mobile Chromium: CMS publishing/failure recovery, legal content, date-input bounds at 320/375/430 and 768/1024/1280 widths, editor/admin queue behavior, 404 semantics and links, public canonicals, one H1 per public page, and no uncaught page/console errors in the mocked public-page runs.
- Optimized local production run: 8 checks passed for homepage/gallery/packages/404. Four legal-page checks could not pass in the intentionally disconnected production fixture: its database is `isolated.invalid`, so server CMS reads return 500. Those routes require separate candidate/live verification against the configured database; do not report that isolated run as all green.
- Production build confirms homepage/gallery/packages/404 are static. A header-dependent initial 404 implementation made them dynamic; this was caught and removed before release.
- Initial script references measured from optimized HTML: homepage 16 scripts, 918 KiB raw / 288 KiB gzip; 404 9 scripts, 569 KiB raw / 176 KiB gzip. These include the framework and shared runtime, are not total page transfer or Core Web Vitals, and are not a before/after speed claim. More homepage JS optimization remains possible and needs interaction coverage rather than blindly removing apparently unused code.
- No `console.log`, `console.debug`, or `console.info` calls found in application TS/TSX. Legitimate caught-error reporting retained instead of suppressing failures.
- Impeccable detector returned no findings for changed design targets. Independent finish reviewer: **ship**, no material fixes. Documenter confirmed an ordinary incumbent extension; no new global design system or shipping raster.
- Authenticated FICOMANA Chrome reproduced the queue toast before this release; after-deployment confirmation is required.

## Boundaries

No live bookings, photos, passwords, or queue positions were changed by these checks. Chromium mobile emulation is not an iPhone/Safari test; the WebKit download was unavailable. This is a scoped regression/SEO/runtime pass, not a full penetration test or a guarantee that every route is error-free.
