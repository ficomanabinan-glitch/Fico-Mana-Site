# FICO MANA incident response

Owner/incident lead: studio owner or explicitly designated administrator. No 24/7 monitoring service or response SLA was verified.

1. Triage privately using timestamp, event type, actor/workspace/booking IDs where necessary, and a generated request ID. Never paste full portal URLs, tokens, customer photos or raw authorization headers.
2. Preserve restricted evidence: provider audit event IDs, a redacted log export, affected commit/deployment and actions taken. Record who collected it and when. Do not clear logs or rewrite Git while investigating.
3. Contain proportionately. Revoke affected staff membership/session at Supabase, disable a compromised portal through its existing control, restrict exposed provider credentials, and pause only affected jobs. Use MFA-protected provider access. Do not reset the database.
4. Rotate a confirmed exposed key at its provider. Coordinate service credentials, Google revocation/reconnection, portal reissue and encrypted-token recovery; these have different scopes. Deleting a tracked secret or disconnecting the UI is not sufficient provider-side revocation.
5. Restore from a verified clean deployment and separately tested data/object backup. Validate payments, selection state and folder routing. Obtain approval before resending emails or re-enabling reminders.
6. Assess affected people and notification obligations with the business/privacy lead. Document the incident, root cause, recovery evidence, remaining exposure and a regression test.

Recommended alert hooks (not activated): Vercel log drain, Supabase Auth/database logs and `security_audit_events`. Investigate bursts of login/MFA failures, unexpected authorization denials, 429/503 spikes, malware rejection and Drive credential changes. Suggested initial threshold: five auth/MFA failures per actor/IP hash in 15 minutes; tune using legitimate studio traffic. A scanner outage should alert an operator; quarantine-safe outage handling remains a separate required feature.
