# FICO MANA hardening audit

Audit started 2026-09-07 against `056467a`. Local branch: `codex/security-hardening-20260907`.

This is a repository review, not a penetration test or a statement about current live policies. Production settings, stored tokens, backups, and installed migration state have not been inspected or changed during this pass. No customer records or credentials are reproduced here. Deployment is gated on the checklist in SECURE-DEPLOYMENT.md.

## Architecture and trust boundaries

Next.js App Router with React/TypeScript client components, server Route Handlers, two sign-in Server Actions, and a session-refresh Proxy. Supabase Auth verifies staff; PostgreSQL stores transactions and service-only workflow tables. Private Storage holds receipts/thumbnails; Google Drive holds studio originals and edited output; public Storage serves website media. Resend sends booking and shoot-reminder emails. PostgreSQL reminder RPCs queue and lease jobs. GitHub/Vercel build and deploy the application.

The app is one studio, not a general multi-tenant SaaS: several legacy administrative queries and Drive settings use a single studio configuration. Authorization must fail closed for other workspaces until all global paths are tenant-scoped. Public booking IDs plus email addresses are knowledge-based recovery, not strong identity proof.

## Findings recorded at audit start

The table below preserves the original findings. Current local dispositions and remaining work are recorded in HARDENING-RESULTS.md; an original Open status is not a claim that no code remediation was made.

| ID | Severity | Affected component | Risk / scenario | Required fix | ISO Annex A | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FM-01 | HIGH | data/ficomana-store.json | Eight transactional booking records tracked as a fixture; copies persist in Git history | Remove tracked snapshots; synthetic example; PII/history checks; coordinated history purge | 5.34, 8.10, 8.12, 8.33 | Open |
| FM-02 | HIGH | lib/booking-load.ts; server-store; booking routes; email log fallback | A deleted/missing online booking can reappear from disk; writes mirror PII to disk | Explicit development-only local store; authoritative missing result; no production mirroring | 8.3, 8.31 | Open |
| FM-03 | HIGH | lib/auth/workflow.ts; auth/admin.ts; supabase/server.ts | Removed membership may be automatically recreated from an old claim; claims do not reflect revocation | Active server membership required; bootstrap off by default; canonical studio boundary | 5.18, 8.2, 8.5 | Open |
| FM-04 | HIGH | lib/auth-api.ts; editor-workflow route | Admin workflow capabilities can bypass admin AAL2 through editor API | Server assurance check for administrator workflow access | 8.2, 8.5 | Open |
| FM-05 | HIGH | lib/google-drive.ts downloadDriveThumbnail | Database-influenced URL receives OAuth bearer header without host restriction | Exact HTTPS destination validation, redirect rejection, response size/time bounds | 8.20, 8.24, 8.28 | Open |
| FM-06 | HIGH | editor-workflow upload sessions | Run lacks uploader and expiry binding; completion accepts client-selected upload IDs before ownership checks | Bind actor/workspace/batch/run/client and expiry; verify before Drive reads | 8.3, 8.26 | Open |
| FM-07 | HIGH | upload-scanner; raw/receipt/edited/media paths | Missing scanner allows trust promotion; direct resumable edited/media content validation incomplete | Private quarantine, retry worker, clean-only access and promotion; provider required | 8.7, 8.26 | Open |
| FM-08 | MEDIUM | security/environment; client-portal; google-oauth | Signing/encryption reuse service keys; compromise crosses security domains | Independent required keys; versioned authenticated encryption; rotation procedure | 5.17, 8.24 | Open |
| FM-09 | MEDIUM | portalRecord/getPortalFile/preparePortalDeliverables | Booking predicates exist but workspace relationships are not independently verified throughout | Workspace/bookings chain checks, compound relationship constraints and negative tests | 8.3, 8.28 | Open |
| FM-10 | MEDIUM | shoot invitation/delivery/email log tables | Raw RSVP tokens also appear in immutable delivery payloads and stored HTML | Hash lookup token; encrypted delivery material; redact persisted email links | 5.17, 8.12, 8.24 | Open |
| FM-11 | MEDIUM | rate-limit keys; origin guard; API/admin mutations | Resource-varying keys evade aggregate quotas; some privileged mutations lack shared quota | Per-IP and actor aggregate limits in addition to resource keys; reject missing mutation origin | 8.5, 8.16, 8.20 | Open |
| FM-12 | MEDIUM | error-response, audit metadata, proxy | Arbitrary request IDs/log exception text can contain secrets or untrusted data | Server-generated request IDs; value redaction; token-free route templates | 8.15, 8.12 | Open |
| FM-13 | MEDIUM | next.config.mjs | Inline scripts allowed by CSP | Plan nonce migration with dynamic rendering/caching impact; avoid breaking static pages | 8.26, 8.28 | Open / staged CSP migration needed |
| FM-14 | MEDIUM | .github/workflows/security.yml; secret scan | Mutable action tags and current-file-only scan | Pin upstream verified commits; full-history credential scan; PII gate | 8.8, 8.25, 8.32 | Open |
| FM-15 | MEDIUM | historical and current migrations | Some historical SECURITY DEFINER functions lack hardened ACL/search path; live installation unknown | Forward privilege verification/hardening, safe search path, catalog assertions | 8.3, 8.9 | Open |
| FM-16 | MEDIUM | app/api/emails/send; booking PUT | Staff email dispatch trusts submitted recipient/content; PUT bypasses shared payload validation | Load canonical booking/payment; strict schemas; quota/audit | 8.3, 8.26, 8.28 | Open |

## Controls already present — preserve

- Server `getUser()` verification; admin MFA default at `requireStaffAuth`.
- Opaque private receipt references with 120-second signed delivery, magic/MIME checks.
- Portal HMAC and constant-time comparison, revocation/expiry checks and QR using the same URL.
- Shared Upstash/PostgreSQL rate limiting, origin protection on browser mutation routes.
- Editor manifest validation, workspace-qualified batch lookup, Drive parent/size/SHA-256 completion checks.
- Atomic conditional photo-selection state claim prevents concurrent requests entering the copy flow together; PostgreSQL transactional selection persistence still needs verification.
- Service-only workflow tables and security-definer RPC ACLs in recent hardening/reminder migrations.
- Private no-store protected routes and standard security headers; no broad reflected CORS.
- Dependency audit at audit start: no known production vulnerabilities reported by pnpm.

## Review coverage

Route inventory includes every file in app/api and app/auth (methods and auth/origin/rate-limit/error boundaries); both Server Actions; Proxy, layouts/auth contexts; all migration grant/policy/function declarations across lib/migrations and supabase/migrations. High-risk upload, portal, Drive, booking, email and reminder implementations are reviewed in depth. Source review is not evidence of effective live RLS, storage privacy, firewall settings, malware scanning, or monitoring. Runtime negative tests and command results are recorded in HARDENING-RESULTS.md.
