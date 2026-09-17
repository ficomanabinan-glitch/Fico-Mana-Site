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

Pending. Record the candidate URL, deployment ID, source commit, smoke-test result, log review, production promotion time, and post-promotion verification here before declaring the release complete.
