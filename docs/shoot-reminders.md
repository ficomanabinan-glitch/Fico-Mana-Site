# Automatic shoot reminders and attendance

## Business rules

- Philippine time (`Asia/Manila`), not the visitor's device timezone.
- Day-before reminder: starts at 6:00 AM the calendar day before a Confirmed booking.
- Shoot-day reminder: starts at 6:00 AM only if the day-before email was successfully accepted by Resend, and the client is `confirmed` or `pending` (no response).
- `declined` clients do not get the shoot-day reminder. Declining records a response and optional note for staff; it does not cancel bookings, release slots or alter payments.
- Same-day bookings or bookings whose first email never succeeded do not receive the second email.
- Changed dates, session/arrival/shoot times or recipient addresses invalidate old response links. The new schedule needs its own first email before a morning reminder is eligible.
- Reminder links expire at midnight after the shoot date. Reading links, including email-scanner GETs, does not change attendance. The client must submit the response page.
- Admin → Shoot Reminders shows responses, notes and email states, searchable by client and date range. Reports only include the signed-in staff member's workspace.

## Production setup

Existing Vercel environment requirements: `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`/supported sender setting (see `lib/resend-config.ts`), Supabase URL and server secret key, and the existing security/rate-limit configuration. Never set secrets as `NEXT_PUBLIC_*` variables.

1. Apply `supabase/migrations/20260908060000_shoot_reminders_and_attendance.sql` in the Fico Mana project's SQL Editor. It creates only reminder/attendance objects and starts disabled. It relies on the existing bookings, email_logs, workspaces, pgcrypto schema and grants.
2. Deploy the app to the canonical production domain. The worker is POST-only at `/api/cron/shoot-reminders`; anonymous requests must return 401.
3. Run `supabase/shoot-reminders-setup.sql`. It creates the internal key in Supabase Vault, stores only its hash in the service-only settings table, creates a paused scheduler and returns `readiness_request_id`. No client email is sent.
4. Inspect **that exact request ID** after the request completes:

   ```sql
   select id,status_code,timed_out,error_msg,content
   from net._http_response where id = REPLACE_WITH_READINESS_REQUEST_ID;
   ```

   Require HTTP 200 with `success: true` and `dryRun: true`. This verifies the worker, database and presence of email configuration, but does not prove inbox delivery or sender-domain verification.
5. Run `supabase/shoot-reminders-activate.sql` and verify both scheduler `active` and settings `enabled` are true. This is the step that enables scheduled customer emails.

The scheduler is `*/5 22-23 * * *` UTC: starts at 6:00 AM PHT, then checks every five minutes until 7:55 AM for the remaining queue and safe retries. These checks **do not mean a new email every five minutes**. There is one delivery record per invitation and reminder kind. The worker processes up to 40 jobs per invocation, with five attempts maximum, and stops claiming at 8:00 AM. Actual inbox arrival depends on provider processing; 6:00 AM is the start of dispatch, not a guaranteed inbox timestamp. A large queue may spread across subsequent checks.

Supabase Cron is used instead of Vercel Hobby cron's within-the-hour timing. See [Supabase scheduled HTTP calls](https://supabase.com/docs/guides/functions/schedule-functions), [Vault](https://supabase.com/docs/guides/database/vault), and [Vercel cron timing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Security and duplicates

Tables/functions are service-only with RLS and explicit revoked anonymous/authenticated access. Staff routes require validated admin role and MFA. RSVP APIs validate a 256-bit private token, enforce mutation origin checks and rate limits, use no-store/no-referrer, and exclude the response URL from analytics. Tokens are not included in bulk Admin responses.

Queue claims are atomic, with expiring leases and per-claim ownership. Attendance and booking validity are rechecked just before sending. Immutable payloads and [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys) prevent repeated sends when acknowledgements are lost. Retries stop before Resend's 24-hour deduplication window. Email logs and accepted-send status are saved in one database transaction. A response submitted after provider acceptance cannot recall an already-sent email.

## Troubleshooting and pausing

- **No first email:** verify Confirmed status, valid client email, active workspace and whether the booking existed during the previous day's 6–8 AM window. Placeholder imported/local addresses are excluded.
- **No 6 AM follow-up:** check first-email status and attendance. Failed/missing first email or a decline intentionally suppresses it.
- **Failed:** check Resend's sender domain, API key, recipient and account limits. Eligible failures retry in the morning window. Do not manually recreate a job or reset its ID to retry an uncertain send.
- **No worker check:** inspect the exact cron job and associated `net._http_response` records; cron job success alone means its HTTP request was queued, not that emails were sent.
- **Response unavailable:** check rate-limit service/security configuration and that the link has not expired or been replaced by a schedule change.
- **Setup script rerun:** deliberately pauses reminders; reverify readiness and run activation again.

Pause only this feature without deleting any data:

```sql
update public.shoot_reminder_settings set enabled=false where id=1;
select cron.alter_job(jobid,active:=false) from cron.job where jobname='fico-shoot-reminders';
```

## Verification

```powershell
pnpm install --frozen-lockfile
node --test tests/shoot-reminders.test.ts
pnpm test
pnpm typecheck
pnpm build
```

The reminder tests execute the actual migration/queue functions in isolated PostgreSQL (PGlite); only the clock is substituted to test the day boundary deterministically. They do not connect to production, create real customer records or send emails. External Supabase Cron, Vault, production grants, Resend delivery and live Admin/browser behavior still require deployment verification.
