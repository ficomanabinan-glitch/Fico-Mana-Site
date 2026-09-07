# FICO MANA — isolated admin presentation

## Scope and existing consoles

This is an additive, light-first presentation frontend, not a replacement for the original operational console. `admin.ficomana.com/admin/*`, `editor.ficomana.com`, the public website and client portal keep their existing components and styling. This patch does not change database schema, RLS, photo-selection limits, payment calculations or manifest-based file routing.

The design reference was opened and visually inspected in Figma: the supplied shadcn component library, node 72-2722 (carousel/component examples). The new interface adapts its restrained card/control language rather than copying the canvas. Exact Figma component inspection requires additional Figma access; existing shadcn/Base UI primitives and isolated CSS tokens are used instead.

## Pages

- `/newadmin`: live studio overview, today's schedule, recent financial chart and production links.
- `/newadmin/bookings`: client/booking search, status filters, date sorting, pagination and detail links.
- `/newadmin/filtering`: existing raw-photo status helpers, search/status filters and day/week/month grouping.
- `/newadmin/editor`: batch counts and statuses, day/week/month grouping, repeated batch/collection downloads and links to the existing upload/retry workflow. Old Editing/Ready-to-Upload values display as Downloaded; no assignment controls added.
- `/newadmin/selections`: package-dependent limits and client selection overview.
- `/newadmin/payments`: existing monthly financial totals and recorded client payment statuses.
- `/newadmin/drive`: connection and client folder/portal state; no credentials exposed.
- `/newadmin/reports`: existing financial calculations and date-selectable curve chart; latest available date selected by default.
- `/newadmin/settings`: current packages, included-selection rules and existing management tools.
- `/newadmin/bookings/[id]`: overview, recorded payments/verified total, enhancement preferences, submitted print allocations/add-ons and Drive folders. Uses TOGA PICTURE, not ROGA.

Search, filters, pagination, charts and client detail views work inside the preview. Operational mutations, uploads, receipt handling, email sending and settings edits deliberately open their existing secured console in a clearly marked new tab. This presentation does **not** claim a full redesigned replacement of those mutation/upload interfaces. Download links use the existing authorized batch/collection endpoints, including their original download audit behavior.

Live data is the default. The explicit **Show sample data** switch displays fictional `Sample Student`/`SAMPLE-*` records only in memory. Samples are never written to an API/database, contain no real PII and cannot trigger real file downloads or changes. Empty live data never silently becomes sample data.

## Backend and access

Reused APIs: `/api/bookings`, `/api/editor-workflow/batches`, per-batch detail/download, collection download, `/api/sales/summary`, `/api/provisioning`, `/api/admin/packages` and per-booking provisioning. Existing sales calculations and raw-photo workflow helpers are reused; no second source of financial truth.

Server layout requires the existing canonical workspace administrator authorization and AAL2. Existing host-local `/admin` sign-in and `/admin/mfa` screens are intentionally reused. There is no bypass, shared-domain cookie expansion, service key in the browser, new auth API or weakened policy. Only the exact new hostname is added to the mutation-origin allowlist.

Reads run independently in parallel and stay in the authenticated layout's memory while navigating. Refresh retains successful prior data on transient failures but clears it on authorization failures. Account changes/logout clear the preview's data and recheck server authorization; outstanding old requests cannot repopulate the new session. No persistent PII cache is added. New-console responses are private/no-store.

## Design system and accessibility

All new styling is scoped to `components/new-admin/new-admin.module.css`. Existing global CSS, root theme, old admin/editor components and shared visual primitives are not modified. The new shell supplies light variables locally; modal Sheet content receives the same tokens through its own scoped wrapper.

- Typography: 12, 14, 16, 20, 26, 42px. Body 16 × 1.618 ≈ 26px line box; heading hierarchy 16 × 1.618 ≈ 26 and 26 × 1.618 ≈ 42. Shared 1.2/1.3 heading and 1.5/1.618 body line-height tokens.
- Spacing: 4, 8, 12, 16, 24, 32, 40, 48, 64px. Controls ≥44px; mobile sidebar uses the existing accessible Sheet primitive.
- Reusable components: shell/navigation, shadcn-backed Button and Sheet, Panel, Status, Empty, layout-matched Loading, financial chart and client tables.
- Status badges include icon and text as well as color. Keyboard-visible 3px focus outline, labels, table headers/captions, main-content skip link, selected-state attributes and reduced-motion handling are implemented.

Measured sRGB contrast ratios from the actual tokens:

| Pair | Ratio |
| --- | ---: |
| Main text / white card | 16.10:1 |
| Secondary text / white card | 6.86:1 |
| Primary button text / fill | 16.10:1 |
| Selected navigation text / fill | 9.37:1 |
| Success text / fill | 6.56:1 |
| Warning text / fill | 6.47:1 |
| Info text / fill | 7.70:1 |
| Input border / white | 4.16:1 |
| Focus ring / white | 7.10:1 |
| Dark amber profit line / white | 5.33:1 |

Tests also check meaningful chart/control colors at ≥3:1 against page/card backgrounds and text pairs at ≥4.5:1, including primary hover. These token tests are not a complete WCAG conformance certification; rendered keyboard/mobile and all-state review must be recorded separately.

## Subdomain configuration

Vercel team `ficomana1`, project `fico-mana-site`: `newadmin.ficomana.com` has been added to **Production**, with **no redirect**. The exact requested DNS record shown by Vercel is:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| CNAME | newadmin | 2fcb322a6a27f51c.vercel-dns-017.com | Automatic |

Namecheap access currently requires the owner to sign in. Do not change root, www, admin, editor, mail or Resend records. Domain verification/TLS must be confirmed after the new CNAME is saved. No nameserver migration or paid plan is required by this implementation.

`https://newadmin.ficomana.com/` redirects only its own root to `/newadmin`. Existing `/admin` and `/admin/mfa` on the new host remain the secure sign-in flow; its successful `/admin/dashboard` redirect lands in `/newadmin`. Old admin/editor hostnames never redirect to the new console. For online QA using an already authenticated admin session, the additive route `https://admin.ficomana.com/newadmin` is available; it does not change the original `/admin/*` pages. Host-only cookies mean the new subdomain may require a separate sign-in and MFA.

## Validation and release status

122 tests passed; typecheck passed; targeted new-console lint passed; production build passed with the added dynamic routes. Source/security scans passed. Authenticated online visual QA and final production/DNS verification are in progress; do not claim the new subdomain is live until confirmed.

Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm security:check`, `pnpm security:secrets`, `pnpm security:http`. Build checks use synthetic CI environment values locally; only the normal Vercel Git integration builds with production credentials. Never upload the local synthetic build.
