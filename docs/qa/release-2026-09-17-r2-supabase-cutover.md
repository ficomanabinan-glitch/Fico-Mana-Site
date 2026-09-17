# FICO MANA R2 and Supabase cutover release

Date: 2026-09-17 (Asia/Manila)

Owner and go/no-go approver: Elrish John Rull

Target:

- Vercel team/project: `ficomana1/fico-mana-site`
- Required Supabase project: `psosdbnemnsspmsligpp`
- Storage: private Cloudflare R2
- Source branch: `codex/ui-consistency-portal-polish-20260908`

## Pre-deployment evidence

- Unit/integration suite: 319 passed, 0 failed.
- TypeScript: passed.
- Production build: passed on Next.js 16.3.4.
- Targeted ESLint: 0 errors, 36 pre-existing warnings.
- Security source checks: passed.
- Secret scan: passed.
- `git diff --check`: passed.
- Retired Google Drive runtime scan: no active application references.
- Vercel dry package: 465 files; required Supabase, R2, storage, and editor-file runtime modules included.
- Local audit artifacts, proposal project, test suite, migrations, and generated caches are excluded from the Vercel package.
- The application no longer contains an embedded Supabase URL or publishable key fallback.

## Release method

1. Commit and push one reproducible R2-backed source revision.
2. Configure the next Production deployment for Supabase `psosdbnemnsspmsligpp` while the current deployment remains live.
3. Create an isolated production-target deployment with `--prod --skip-domain`.
4. Wait for `READY`, then verify public pages, protected API behavior, headers, logs, Supabase access, and private R2-backed routes.
5. Promote the verified deployment to the production domains only after every release-blocking smoke check passes.
6. Re-run production smoke checks immediately after promotion.

## Rollback criteria

Rollback to the prior Vercel production deployment if staff authentication fails, booking or portal data is missing, reservation submission fails, onsite/editor uploads cannot be indexed, portal selections cannot be submitted, cross-client files are visible, the new deployment produces sustained 5xx responses, or a data-integrity/security regression appears.

Rollback does not delete records from either Supabase project or objects from R2.

## Candidate and promotion evidence

- Source commit: `12d4e82` (`feat: complete R2 storage and Supabase cutover`).
- Candidate URL: `https://fico-mana-site-ntlhp86x4-ficomana1.vercel.app`.
- Vercel deployment: `dpl_A72J6QTzjyKo9WLMeMkFwt1DHuDJ`.
- Candidate state: production target, `READY`, built with Next.js 16.3.4.
- Candidate smoke result:
  - `/`, `/packages`, and `/portal/sample`: `200`.
  - `/api/packages` and `/api/website-media`: `200` with live JSON data.
  - `/api/editor-files`, `/api/editor-workflow/filtering`, `/api/bookings`, and `/api/storage/settings`: unauthenticated requests correctly rejected with `401`.
  - CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, referrer policy, and permissions policy present.
  - Candidate error log review: no errors found.
- Promoted at `2026-09-17 16:43` Asia/Manila.
- Post-promotion verification:
  - `https://ficomana.com/` redirects to the canonical `https://www.ficomana.com/` and returns `200`.
  - `https://www.ficomana.com/`, `/packages`, and `/portal/sample`: `200`.
  - `https://admin.ficomana.com/admin`: `200`.
  - `https://editor.ficomana.com/editor` redirects to `/editor/login` and returns `200`.
  - Production `/api/packages`: `200`; production editor file API remains protected with `401` for an unauthenticated request.
  - Production error and warning log review: no entries found during the release window.
- Production environment cleanup completed after promotion:
  - Retired Google Drive variables removed.
  - Superseded `SUPABASE_SERVICE_ROLE_KEY` removed; `SUPABASE_SECRET_KEY` remains authoritative.
  - Required Supabase public settings, private R2 settings, email settings, and portal/security secrets retained.

Release decision: **GO**. The validated artifact is live and passed the immediate post-promotion checks.
