# ISO/IEC 27001:2022-aligned technical controls

This is a technical mapping, not certification, an ISMS audit or a complete Statement of Applicability. ISO/IEC 27001 also requires organizational risk management and governance: [ISO standard overview](https://www.iso.org/standard/27001).

| Annex A controls | Component / implementation / evidence | Status and residual risk | Required operational control |
| --- | --- | --- | --- |
| 5.15–5.18; 8.2, 8.3, 8.5 | `auth/workflow`, `auth-api`, `supabase/server`; existing members/capabilities, server user validation and privileged AAL2; negative boundary tests | Code hardened; live membership/MFA/recovery unverified | Joiner/mover/leaver procedure and quarterly access review |
| 5.34; 8.10, 8.12, 8.33 | Removed transactional snapshots, `.gitignore`, fixture/secret scan, metadata redaction | Current tree sanitized; historical PII/clones remain | Approve coordinated purge, export/device controls and privacy policy |
| 5.17; 8.24 | Required independent startup keys, existing HMAC/AES-GCM, strict token envelope checks | Code checks present; actual key entropy/separation and recovery not verified; RSVP hashes/rotation version migration pending | Secure generation, custodianship, planned rotation/recovery drills |
| 8.7, 8.26, 8.28 | File signature/MIME/path/size checks, full bounded receipt/thumbnail decode, restricted thumbnail destinations | Partial: direct resumable scans and quarantine missing | Approve private quarantine/provider and clean-only release workflow |
| 8.15, 8.16; 5.24–5.28 | Structured security audit, generated error IDs, token-free routes; incident-response guide | Local redaction tested; centralized monitoring/alert delivery not verified | Log drain/SIEM onboarding, threshold tuning, evidence retention and incident exercises |
| 5.23; 8.9, 8.20 | Provider register, origin protection, headers, shared quotas, exact thumbnail HTTPS host checks | Code controls present; live firewall, RLS, backups and supplier settings require verification | Supplier review and deployment preflight |
| 8.8, 8.25, 8.29, 8.32 | Pinned Actions, checksum-verified Gitleaks, dependency audit, 20 new regression tests, frozen install/build gate | Local checks; CI remote run and release acceptance pending | Protected branches, reviewed updates and rollback approval |
| 8.27, 8.31 | Preserved App Router/API/contracts; local storage prohibited in production; synthetic isolated tests | Architecture retained; authenticated screenshot comparison blocked by local secrets | Separate development/production environments and visual release review |

Control applicability and risk acceptance must be approved by the business. This mapping does not claim every cited control is fully implemented; open items are listed in the audit and release gate.
