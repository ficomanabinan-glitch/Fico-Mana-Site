# R2 migration QA evidence

Date: 2026-09-15
Scope: FICO MANA public site, Client Portal, Admin, Editor, Supabase metadata, and private Cloudflare R2 storage.

## Result

Local release decision: **NO-GO for production cutover** until live credentials, object migration, hosted database preflight, backup restore rehearsal, and real-browser checks are completed. The application implementation and isolated regression suite are green.

## QA sequence applied

1. `qa-project-context` — project stack, environments, auth, and critical flows recorded in `.agents/qa-project-context.md`.
2. `risk-based-testing` — migration risks and release gates recorded in `docs/qa/release-risk-matrix-2026-09-14.md`.
3. `ai-test-generation` — R2 requirements converted into key, upload, portal, expiry, print, and cutover tests.
4. `database-testing` — additive and terminal migrations executed in isolated PostgreSQL; rollback, constraints, ownership, expiry, and print lineage verified.
5. `api-testing` — portal and staff API contracts exercised through route handlers, including authorization, validation, cache headers, rate limits, ownership, and failure responses.
6. `security-testing` — source/secret scans, dependency audit, auth/RBAC, origin, IDOR, filename/path, checksum, metadata, private-cache, and fail-closed tests executed.
7. `performance-testing` — production build and 50 MiB multipart upload/concurrency tests executed. Live latency and Web Vitals remain pending a credentialed test environment.
8. `accessibility-testing` — static WCAG color, keyboard semantics, loading state, touch-target, dialog/viewer, and responsive behavior tests executed. A real NVDA/keyboard pass and axe browser scan remain pending an available browser surface.
9. `cross-browser-testing` — compatibility-sensitive code was reviewed, but Chromium/Firefox/WebKit execution could not be completed because the connected browser surface was unavailable and Playwright browsers are not installed in this checkout.
10. `release-readiness` — evidence evaluated below.

## Passing evidence

- Functional and regression tests: **297 passed, 0 failed**.
- TypeScript: **passed**.
- Production build: **passed**, 70 static pages generated and all dynamic routes compiled.
- ESLint: **0 errors**, 37 warnings. Warnings predate or sit outside this storage migration and are not hidden.
- Security source scan: **passed**.
- Tracked-file secret scan: **passed** across 777 text files.
- Production dependency audit: **0 known vulnerabilities** after pinning `baseline-browser-mapping` to 2.11.21.
- R2 transfer: one 50 MiB file passed ten-part upload, transport retry, exact SHA-256 verification, and metadata-only app requests.
- R2 concurrency: three 50 MiB files passed with a global peak of three simultaneous PUTs and serialized session creation.
- Confirmation retry: after R2 accepted the bytes, an application confirmation retry transferred **zero** photo bytes.
- Database phase 1: legacy rows preserved and marked for migration.
- Database phase 2: verified R2 rows retained; retired columns/tables removed; unmigrated rows abort and roll back the entire transaction.
- Portal isolation: foreign workspace/booking IDs, expired/disabled portals, database failures, resets, and rate limits produce no signed R2 URL.
- Runtime regression scan: no retired storage-provider contract in active runtime, UI, environment, maintenance, verification, or dependency sources.
- Live Cloudflare account: verified the intended FICO MANA account and the exact `ficomana-private-photos-production` bucket on 2026-09-15 without changing configuration.
- Live R2 privacy and inventory: public access and the public development URL are disabled; the bucket contains **0 objects / 0 B**.
- Live R2 CORS: exact match to `docs/storage/r2-cors.production.json`, including the four production origins, `GET`/`HEAD`/`PUT`, all seven approved request headers, exposed `etag`/`content-length`, and `MaxAgeSeconds: 3600`.
- Live R2 lifecycle: exact match to `docs/storage/r2-lifecycle.production.json`; incomplete multipart uploads under `workspaces/` are aborted after one day and the rule is enabled.
- Live R2 credentials: the dashboard shows no existing Account or User R2 API tokens. No token was created.
- Read-only reconciliation tool: focused tests prove one cached `HeadObject` request per unique key, strict size/checksum comparison, namespace fail-closed behavior, and absence of R2 download/list/mutation or Supabase write/RPC calls.

## Required live gates before production

1. Create and store restricted R2 S3 credentials in Vercel; do not expose them as `NEXT_PUBLIC_*`.
2. Confirm the exact private bucket, CORS origins, lifecycle rules, and R2 endpoint in the target Vercel project.
3. Create a fresh hosted Supabase backup and perform a restore rehearsal in an isolated project.
4. Apply the additive migration only.
5. Copy originals, previews, thumbnails, enhanced files, deliverables, and print artifacts; verify size, checksum, key ownership, and record counts.
6. Run the terminal migration preflight. Any reported count must block cutover.
7. Exercise authenticated Admin and Editor uploads plus one private client portal end to end against test data.
8. Run axe and keyboard checks in Chromium, then the critical photo-selection flow in Firefox and WebKit. Report engine coverage accurately; WebKit is not a claim of real Safari coverage.
9. Measure Client Portal LCP, CLS, TBT, API p95/p99, error rate, and multipart throughput in staging. Do not load-test production without coordination.
10. Apply the terminal migration only after every prior gate is green, then re-run the smoke, security HTTP, and download checks.

## Known limitations

- A local production server correctly refused to start with test-only/missing production secrets. The protection was retained; credentials were not weakened to manufacture a browser pass.
- The FICOMANA Chrome profile became available for the Cloudflare checks above, but no Supabase or Vercel dashboard tab was shared. No claim is made for a hosted SQL preflight, Vercel environment readiness, live keyboard/axe pass, Firefox, WebKit, Safari, or mobile-device run.
- Historical SQL migrations still contain the old schema names because changing applied migrations would destroy migration integrity. Only the terminal cleanup migration and its regression test may refer to those retired names in current work.
