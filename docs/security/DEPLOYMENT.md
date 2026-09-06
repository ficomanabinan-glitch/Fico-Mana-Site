# Fico Mana security deployment runbook

## Order of operations

1. Take a current Supabase database backup and record the Vercel deployment ID.
2. Add every required server-only environment variable from `.env.example` to
   Production, Preview, and Development as appropriate. Remove any
   `NEXT_PUBLIC_*` variable containing passwords or server credentials.
3. Apply `supabase/migrations/20260906151436_production_security_hardening.sql`
   to the linked production project with `supabase db push`.
4. Run `pnpm security:receipts` with production Supabase credentials. This uses
   the supported Storage API to make the existing `receipts` bucket private and
   enforce its 5 MB image allowlist. It does not delete objects.
5. Run `supabase/security-verification.sql` in the Supabase SQL editor. The
   receipt bucket must report `public = false`; anonymous/authenticated grants
   on the listed private tables must return zero rows; anonymous function
   execution must be false; legacy public receipt-reference counts must be zero.
6. In Supabase Auth settings, disable public user signup, set the minimum
   password length to 12 with upper/lowercase letters, digits, and symbols,
   enable secure password changes and TOTP MFA, and use a 24-hour session
   timebox with an 8-hour inactivity timeout. The repository `config.toml`
   records the intended values, but confirm the hosted project actually matches.
7. Deploy a preview, sign in as an owner/admin, enroll or challenge TOTP, and
   exercise booking, receipt verification, Drive provisioning, onsite upload,
   portal selection, editor download, and edited-photo delivery.
8. Run the repository verification commands and deploy production only after
   all required checks pass.

## Required commands

```sh
pnpm install --frozen-lockfile
pnpm security:secrets
pnpm security:check
pnpm security:audit
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:http
supabase db push
pnpm security:receipts
```

## Rollback

Rollback the application by promoting the previous known-good Vercel deployment.
Do not make the receipt bucket public again. The migration is additive except
for privilege tightening and public receipt policies; restore a database backup
only if a tested forward fix is not possible. Existing object IDs, bookings,
Drive relationships, and receipt files are preserved.

Changing `PORTAL_SIGNING_SECRET` invalidates old invitation links and remembered
portal cookies. Changing `GOOGLE_TOKEN_ENCRYPTION_KEY` makes stored Drive refresh
tokens unreadable until Google Drive is reconnected. Plan those rotations rather
than changing them accidentally during rollback.

During the initial migration, omitting those two dedicated variables preserves
the previous service-key-derived signatures and Drive encryption. Add the
dedicated values only during a planned portal-link rotation and Drive
reconnection; the remaining security variables should still be configured
before deployment.
