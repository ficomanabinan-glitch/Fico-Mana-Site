# Supplier review register

| Supplier | Purpose / data | Credential and least privilege | Failure impact / review |
| --- | --- | --- | --- |
| Vercel | Hosting, function runtime, operational logs | Team MFA, scoped deployment access, protected environments; no secrets in public variables | Site/API outage; review access quarterly and each release |
| Supabase | Auth, booking/payment/workflow DB, receipts/thumbnails/media | Public publishable key is not privileged; server secret restricted; verify RLS/grants, private buckets and service-only RPCs | Sign-in/data unavailable; monthly quota/backup check and quarterly access review |
| Google Drive/OAuth | RAW/selected/edited files and folder mappings | Dedicated studio account, existing minimum required read/write scopes, encrypted refresh token, approved OAuth callback | Upload/download/provisioning unavailable; quarterly grants and recovery review; provider token revocation when compromised |
| Resend | Booking, receipt and reminder emails | Server-only API key, verified `updates.ficomana.com` sender configuration, limited team access | Notifications delayed; acceptance is not delivery; review bounces/abuse and sender DNS monthly |
| GitHub | Source, security checks, deployment automation | MFA, branch protection/reviews, read-only Actions permissions unless needed, immutable action commits | Source/build compromise; quarterly membership and release-time CI review |
| Malware provider (not verified) | Untrusted file scanning | Approved HTTPS endpoint, dedicated token, data-processing/retention agreement | Scanning unavailable; current optional adapter does not implement full quarantine; provider selection and workflow approval required |

Provider plans, current backups, domain verification, MFA status and processing agreements were not checked live during this pass. The business owner must verify them rather than relying on source configuration. Dependencies can process student images and payment metadata; include them in the privacy/vendor register.
