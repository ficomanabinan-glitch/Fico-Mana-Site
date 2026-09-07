# Fico Mana UI refinement — September 8, 2026

This is a presentation update, not a new design, router, or workflow. The golden ratio is a soft guide; operational density and readability take precedence.

## Baseline

The existing application uses Next.js App Router, React, Tailwind v4, shared `lib/admin-ui.ts` class strings, and a scoped CSS module for the alternative admin console. Existing loading boundaries and skeleton components remain in use.

| Surface | Existing structure retained |
| --- | --- |
| `/`, `/gallery`, `/packages` | Hero, sections, carousel, packages and booking form |
| `/admin`, `/admin/mfa`, `/editor/login` | Existing sign-in and MFA forms |
| `/admin/dashboard`, `/admin/sales`, `/admin/reports`, `/admin/expenses` | Page header, metrics, charts, tables and filters |
| `/admin/bookings`, `/admin/calendar`, `/admin/verification`, `/admin/clients` | Lists, calendar, receipt review and client details |
| `/admin/filtering`, `/admin/filtering/batch/[batchId]` | Date grouping, filters, batch and client controls |
| `/admin/provisioning`, `/admin/provisioning/[id]`, `/admin/system` | Drive management, portal links, QR, settings and cleanup |
| `/admin/packages`, `/admin/media`, `/admin/emails`, `/admin/shoot-reminders` | Existing management forms and dialogs |
| `/editor`, `/editor/onsite`, `/editor/queue`, `/editor/upload`, `/editor/batch/[batchId]` | Full-width working area, navigation, upload progress and batch operations |
| `/portal/[id]` | Booking header, session/package cards, selection steps, gallery, prints, payment summary and QR |
| `/newadmin`, `/newadmin/[section]`, `/newadmin/bookings/[id]` | Existing light/dark themes, cards, tables and responsive navigation |

Before editing presentation classes, the signed-in Onsite Upload screen was captured at 1440×900 and 390×844. The baseline had 8–11px labels, square cards, a long header and tightly spaced action buttons. A separate client-portal tab could not be attached reliably. Local production authentication remains fail-closed when production credentials are absent; it was not bypassed for screenshots.

## Shared tokens

`app/globals.css` is the single source for the `--fico-*` tokens and Tailwind v4 `@theme inline` mappings. Use the semantic utility, not another arbitrary pixel value.

| Purpose | Utility | Size |
| --- | --- | --- |
| Metadata / uppercase labels | `text-caption`, `tracking-label` | 12px, 1.5 line height, 0.06em tracking |
| Compact body / tables | `text-small` | 14px, 1.5 |
| Body / mobile form input | `text-body` | 16px, 1.6 |
| Introductory body | `text-large` | 18px, 1.5 |
| Card title | `text-card-title` | 20px, 1.25 |
| Subsection | `text-h3` | 24px, 1.25 |
| Section / long operational heading | `text-h2` | Fluid 24–32px, 1.2 |
| Page title | `text-page-title` | Fluid 28–40px, 1.2 |
| Display heading | `text-display` | Fluid 36–52px, 1.1 |

Spacing uses 4, 8, 12, 16, 24, 32, 48, 64 and 80px. `p-card` scales from 16 to 24px; `py-section` from 48 to 80px. `rounded-card` is 16px; `rounded-control` is 10px. Shared staff controls have a minimum 44px touch height. Existing brand colors, fonts, image crops, animation logic, financial chart colors and navigation destinations are unchanged.

The portal has a contextual 1.618:1 desktop split with a minimum usable secondary-panel width. It stacks below 1024px. Neither the original admin nor editor main area gains a maximum-width constraint. Photo-grid column counts, image aspect ratios, table scrolling and batch grouping remain unchanged.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. `tests/ui-proportions.test.ts` protects the token scale, full-width operational layouts, responsive portal split and removal of the requested filler labels. The sidebar preservation test permits only the approved typography substitutions while still comparing the complete rendered navigation structure and states. Existing light/dark contrast tests continue to check every semantic color pair.

The upload-reset backend is separate unfinished work and is not part of this presentation release. Do not deploy its migration or API changes merely to publish these styles.
