# Retention and recovery guidance

These are proposed operational review periods, not automatic deletion rules or legal advice. No retention job, customer deletion or backup was enabled by this pass. The owner must approve a written policy and verify applicable accounting/privacy obligations before deletion.

| Dataset | Proposed review / trigger | Safe process |
| --- | --- | --- |
| Bookings, payment metadata | Annual review after completed/cancelled work | Retain required accounting evidence and dispute holds; minimize unnecessary contact details |
| Receipts | Review with financial records and fraud/dispute holds | Private Storage and linked metadata; delete only approved resolved records with recovery plan |
| RAW, selected and edited photos | Review at the agreed client backup/delivery deadline | Notify per contract, confirm delivery and backups; portal expiry alone does not authorize Drive deletion |
| Portal data | Revoke/expire access per existing rules | Keep records as required for workflow/audit; no silent reactivation or local snapshot recovery |
| Email logs | Suggested 90-day content review | Redact bearer links before longer-term analytics; provider logs and database HTML need separate coverage |
| Security/workflow logs | Suggested 90 days searchable, up to 12 months restricted archive if approved | Redact secrets/PII, hold incident evidence, monitor storage cost; no unverified SIEM claims |

Recovery checklist: verify Supabase backup/PITR entitlement and actual restore point; rehearse restoration in an isolated project; separately inventory Storage object backups and Drive originals/permissions; retain restricted key recovery material; pause reminders and outbound mail in the restore environment; validate booking/payment relationships, folder mappings and portal revocation before reopening access. Database backups alone are not proof of photo/object backup. No backup or restore was verified in this pass.
