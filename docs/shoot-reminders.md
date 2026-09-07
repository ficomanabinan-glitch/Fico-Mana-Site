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

1. One-time backend deployment: apply `supabase/migrations/20260908060000_shoot_reminders_and_attendance.sql`, then `supabase/migrations/20260908070000_admin_shoot_reminder_controls.sql`. The second migration adds the secure Admin controls and the scheduler extensions. Installing migrations does not enable emails. Existing bookings, payments and reminder history are preserved.
2. Deploy the app to the canonical production domain. The worker is POST-only at `/api/cron/shoot-reminders`; anonymous requests must return 401.
3. Open **Admin → System Settings** or **Admin → Shoot Reminders**. Both show the same reminder settings, backed by the database.
4. Press **Check Reminder Service**. The backend creates/reuses the internal Vault key and the fixed scheduler, and submits a no-email readiness probe to the production endpoint. The Admin panel polls the exact request until it passes or fails; no request ID copying or SQL is needed. A check preserves an existing enabled/paused state.
5. When the check passes, press **Enable Reminders**. **Once enabled, reminders stay on until an administrator presses Disable Reminders.** The saved setting has no expiry. A failed run or service check does not disable it. The server still requires a successful check from the last 10 minutes for the initial enable action; if that check is stale, run it again. This is an activation safety check, not a 10-minute reminder subscription. **Disable Reminders** turns both the saved setting and scheduler off without removing client responses or delivery history, even when a service check has failed. The existing API action remains `pause` for compatibility.

These controls require the server-validated admin role, MFA and owner/admin membership of the active `fico-mana` workspace. Settings actions are rate limited and audited. Browser callers cannot supply destinations, cron expressions or secrets. The 6 AM time and confirmed/no-response rule remain fixed to the requested policy.

Readiness requires HTTP 200 with `success: true` and `dryRun: true`. It verifies the worker, database and presence of email configuration, but does not prove inbox delivery or sender-domain verification. The original `shoot-reminders-setup.sql` and `shoot-reminders-activate.sql` are legacy maintenance scripts; use the Admin controls for normal operation.

The scheduler is `*/5 22-23 * * *` UTC: starts at 6:00 AM PHT, then checks every five minutes until 7:55 AM for the remaining queue and safe retries. These checks **do not mean a new email every five minutes**. There is one delivery record per invitation and reminder kind. The worker processes up to 40 jobs per invocation, with five attempts maximum, and stops claiming at 8:00 AM. Actual inbox arrival depends on provider processing; 6:00 AM is the start of dispatch, not a guaranteed inbox timestamp. A large queue may spread across subsequent checks.

Supabase Cron is used instead of Vercel Hobby cron's within-the-hour timing. See [Supabase scheduled HTTP calls](https://supabase.com/docs/guides/functions/schedule-functions), [Vault](https://supabase.com/docs/guides/database/vault), and [Vercel cron timing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Security and duplicates

Tables/functions are service-only with RLS and explicit revoked anonymous/authenticated access. Staff routes require validated admin role and MFA. RSVP APIs validate a 256-bit private token, enforce mutation origin checks and rate limits, use no-store/no-referrer, and exclude the response URL from analytics. Tokens are not included in bulk Admin responses.

Queue claims are atomic, with expiring leases and per-claim ownership. Attendance and booking validity are rechecked just before sending. Immutable payloads and [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys) prevent repeated sends when acknowledgements are lost. Retries stop before Resend's 24-hour deduplication window. Email logs and accepted-send status are saved in one database transaction. A response submitted after provider acceptance cannot recall an already-sent email.

## Troubleshooting and pausing

- **No first email:** verify Confirmed status, valid client email, active workspace and whether the booking existed during the previous day's 6–8 AM window. Placeholder imported/local addresses are excluded.
- **No 6 AM follow-up:** check first-email status and attendance. Failed/missing first email or a decline intentionally suppresses it.
- **Failed:** check Resend's sender domain, API key, recipient and account limits. Eligible failures retry in the morning window. Do not manually recreate a job or reset its ID to retry an uncertain send.
- **Automatic failure alerts:** the existing Admin notification bell records a fixed, non-sensitive message and a `Try:` solution, with a link to Shoot Reminders. Concurrent/repeated retries create at most one notification per issue per GMT+8 calendar day and never reset a notification's read state. The bell refreshes when opened, when the tab becomes visible, and every three minutes while visible without reloading bookings. These are in-app alerts, not extra client or staff emails.
- **Enabled · Needs attention:** the switch remains enabled. System Settings and Shoot Reminders show the current run error or today's failed delivery count. A later successful run clears its run warning; exhausted failed deliveries still show as failed until their status changes. Historical bell notifications remain for review. The current-day attendance report has each affected client's delivery status.
- **No recent check:** when enabled, the Admin health check warns if no completed run is confirmed for 15 minutes of the 6–8 AM window, including jobs that never reached the worker. It allows a 15-minute grace period after configuration changes and does not warn before 6 AM or when reminders are disabled. After the window, it checks the last 15 minutes of that window. It is evaluated when Admin reads the notification/settings endpoint, not by a new scheduler.
- **Notification storage unavailable:** worker logging and the settings warning are independent of notification inserts. If the entire database is unavailable, neither can be persisted; the request logs retain the generic failure and the settings read shows an actionable unavailable warning. Once access returns, the notification read reconstructs alerts from persisted run/delivery health. No browser telemetry, email secrets, recipient addresses or RSVP tokens are included in these operational notifications.
- **No worker check:** inspect the exact cron job and associated `net._http_response` records; cron job success alone means its HTTP request was queued, not that emails were sent.
- **Response unavailable:** check rate-limit service/security configuration and that the link has not expired or been replaced by a schedule change.
- **Settings unavailable:** the backend deployment must include both reminder migrations. Routine configuration is then done entirely in Admin.
- **Cannot enable:** press Check Reminder Service and wait for a successful result, then enable. Failed/stale activation checks cannot enable sending, but they never switch off already enabled reminders.
- **Legacy setup script rerun:** deliberately pauses reminders; reverify and enable from Admin afterwards.

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

The reminder tests execute the actual migration/queue functions in isolated PostgreSQL (PGlite); only the clock is substituted to test the day boundary deterministically. Settings tests execute the real control functions with isolated Cron, Vault and HTTP fixtures. They cover stale/failed checks, safe enable/pause, duplicate button clicks, workspace roles and secret redaction. They do not connect to production, create real customer records or send emails. External Supabase Cron, Vault encryption, production grants, Resend delivery and live Admin/browser behavior still require deployment verification.
