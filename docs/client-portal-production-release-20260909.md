# Client Portal production release — 9 September 2026

## Result

The owner authorized deployment after the local implementation handoff. The release is live on the existing FICO MANA Vercel project, with both required Supabase migrations applied and independently verified.

- GitHub commit: `ca51444804eb6776c249a5454950b3a1477bbe7f`.
- Published branch: `codex/ui-consistency-portal-polish-20260908`.
- `main` was not merged or moved. Future production releases from `main` must include this portal change to avoid replacing it with the older implementation.
- Vercel team/project: `ficomana1/ fico-mana-site`.
- Preview deployment: `h4oLaL553kMP7hfrNPAM4uV7gfsY` — Ready.
- Production deployment: `Cjb2BP36RXKEx9ieAQbzpG2q6nZP` — Ready; production build completed in 44 seconds at approximately 10:26 AM, Asia/Manila.
- Production deployment details: https://vercel.com/ficomana1/fico-mana-site/Cjb2BP36RXKEx9ieAQbzpG2q6nZP
- Release was promoted through Vercel's existing Git integration. Vercel rebuilt the exact commit using Production environment variables. No local build or local environment file was uploaded.

## Database verification

The production `NEXT_PUBLIC_SUPABASE_URL` in Vercel was verified against project `hrvyxxamxacosmbnkxwd`. Its dashboard name contains TEST ENVIRONMENT, but it is the actual database configured for this production application.

Installed, with full statements recorded in `supabase_migrations.schema_migrations`:

1. `20260909005547_portal_addon_photo_assignments.sql`
2. `20260909010816_portal_final_delivery_expiry.sql`

Each migration and its history entry was executed transactionally. Post-installation verification confirmed:

- `addon_catalog.photo_limit`, `client_addon_orders.photo_ids`, and `client_portals.deliverables_uploaded_at` exist.
- All three assignment/delivery triggers exist.
- RLS remains enabled on the catalog, add-on orders and client portals.
- The portal-ready email RPC remains executable by `service_role`, not `anon` or `authenticated`.
- Portal/order counts are unchanged. One existing portal was processed by the expiry reconciliation and an audit row records its previous and resulting deadline.
- No client selection, booking, payment, original photograph, Drive file, or email was created or deleted for verification.

The dashboard reported no scheduled backups. No database backup, PITR restore point, or restore rehearsal is claimed. The expiry migration preserves prior deadlines in its scoped audit entry; that audit is not a full database backup.

## Live checks

- `https://ficomana.com` redirects to `https://www.ficomana.com/` and returns HTTP 200.
- `https://admin.ficomana.com/admin` returns HTTP 200 with private/no-store caching.
- Anonymous `https://editor.ficomana.com/editor` redirects to the expected editor login, returning HTTP 200 with private/no-store caching.
- A fresh client portal browser view loaded the new workflow navigation, real gallery, large preview, rounded controls and Overview drawer.
- Overview opened and closed; it displayed the new final-delivery expiry explanation and existing client/package/payment details.
- The authenticated Business Expenses page loaded its existing expense data and completed Sync.
- The authenticated Editor dashboard loaded its existing batch and progress data.

The existing portal tab could not be inspected reliably by the browser tool, so verification used a fresh tab in the same authorized FICO Chrome profile. No PIN was entered and no client selection was submitted or changed. Paid add-on submission, actual uploads, downloads and email delivery were not exercised against live client data.

## Quality gates

Before publication: 368 automated tests, TypeScript checks and the production build passed. Lint had zero errors and 33 pre-existing warnings. Source-security and secret checks were rerun during deployment and passed. Vercel's preview and Production builds both passed. No GitHub Actions workflow ran for this release-branch push; the Vercel check completed successfully.

## Working tree

Reviewed earlier Business Expenses rounding and legacy portal CSS adjustments were included in the release. Local `.agents/`, `.codex/`, `.env` files, screenshots, and generated TypeScript/Next artifacts were not added to the release commit. This post-release record is local documentation and was not part of the deployed application commit.
