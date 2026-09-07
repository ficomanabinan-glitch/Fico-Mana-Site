# Data handling classes

| Class | FICO MANA examples | Handling |
| --- | --- | --- |
| PUBLIC | Published package catalog, consented website marketing images/video | CDN/image caching allowed; approval before moving client material to public Storage |
| INTERNAL | Workflow configuration, package drafts, deployment metadata | Authenticated staff on a need-to-know basis; do not publish operational details |
| CONFIDENTIAL | Client/student names, contact details, bookings, payment metadata, receipt images, RAW/selected/edited photos | Workspace/booking ownership checks, private file access, no shared HTTP cache, no Git fixtures or public screenshots |
| RESTRICTED | Staff credentials, MFA recovery material, portal/RSVP bearer URLs, Supabase service credentials, Google refresh tokens, signing/encryption keys | Server-only secrets storage, encrypted recovery, tightly limited custodians; never chat, logs, screenshots or source control |

Use synthetic names and `example.test` addresses for tests. Empty transaction examples intentionally contain no customer data. Exported ZIPs, email attachments and downloaded photos remain confidential after they leave the application. Staff must control device access and approved backup locations.
