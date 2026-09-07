# FICO MANA threat model

Trust boundaries: browser → Next Proxy/Route Handler/Server Action → server-authorized Supabase/Drive/Resend operations. Public Storage is for approved marketing media only. Receipt/thumbnails, client galleries and deliverables are private workflows. The application operates one canonical studio; legacy global admin services are not a multi-tenant SaaS boundary.

| Actor / entry | Assets and threat | Enforced controls / remaining exposure |
| --- | --- | --- |
| Anonymous bot, malicious client | Booking enumeration, receipt spam, portal guessing | Origin guards, server validation, shared quotas and aggregate lookup/session limits; knowledge-based booking recovery is weaker than identity verification |
| Leaked portal URL | Photos, selections, payment summary | HMAC, expiry/revocation, booking/workspace predicates; possession remains authorization, so never log/share private links |
| Onsite/editor or former employee | Cross-client routing, admin escalation, continued access | Existing membership, canonical active studio and capability checks; privileged workflow AAL2; upload-run actor/expiry binding still needs migration |
| Compromised administrator | PII exports, destructive actions, Drive credentials | Server MFA, private responses, origin/rate guards and audit records; approved admin powers remain powerful; offboarding/provider revocation is operational |
| Malicious upload | Decoder attacks, malware, path traversal | Signature/MIME/extension/size checks, full bounded receipt/thumbnail decode, safe ZIP paths, edited size/hash/parent checks; quarantine and full RAW/edited/media scanning remain open |
| Compromised database string | OAuth bearer exfiltration through thumbnail URL; HTML injection in email | Exact Google thumbnail HTTPS hosts, no redirects, time/size bounds, escaped email interpolation; other external destinations still require infrastructure review |
| Compromised Google OAuth token/service key/GitHub account | Entire private dataset, private files, build tampering | Server-only client, encrypted refresh tokens, independent deployment keys, pinned actions, scans; provider MFA, secrets rotation and cloud access review remain essential |

Critical invariants: missing online records never fall back to disk; a portal file matches both booking and workspace; authorization precedes Drive reads; no privilege comes from editable user metadata; originals are not recompressed by these security changes. Test evidence is in `tests/security-boundaries.test.ts` and existing security/reminder/upload suites. These use isolated fixtures and do not constitute a live penetration test.
