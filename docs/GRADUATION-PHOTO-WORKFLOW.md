# Graduation-only photo workflow

The category saved in Package Manager controls remote photo production. Only
`graduation` generates client portals, studio Drive folders, photo-selection
records and editing-queue entries. This includes custom and inactive graduation
packages already used by a booking; eligibility does not depend on the package
name, seeded ID, number of photos, or price.

Self-portrait bookings continue through normal scheduling, booking confirmation,
payment verification, receipts and ordinary booking emails. Their photos are
edited and handed over onsite, so no new portal access email or Drive hierarchy
is created. Following the requested "only graduation" rule, Creative and
Capping & Pinning categories are also outside this remote workflow.

Automatic payment/booking provisioning, manual provision/retry, portal enabling,
Drive hierarchy creation, folder repair, editor upload setup, batch downloads,
workflow synchronization, and portal-access emails apply the same category rule.
Checks are server-side and fail closed if package rules cannot be loaded. Booking
and payment confirmation still occur before an ineligible booking skips remote
provisioning. Automatic provisioning returns null when skipped. A read-only
snapshot carries `required: false` and the verified payment totals, without
initializing any remote-production records or raising an unnecessary load error.

Client Portals, the filtering dashboard, onsite RAW uploads and editing batches
show eligible graduation bookings. Other packages remain in Bookings, Clients,
the main session calendar, sales and payment views. Existing historical portals,
Drive files, photo selections and editing records are not deleted or migrated.
Already-issued portal links are not automatically revoked by this change.

No schema, RLS, authentication or deployment change is required. No live booking,
payment, email, portal or Drive folder should be created simply to test this rule.
`tests/package-workflow.test.ts` exercises the real provisioning function with a
synthetic self-portrait booking and verifies its confirmation/payment state while
asserting zero portal/folder generation and zero external emails. It also checks
custom packages, category overrides, inactive graduation packages, missing rules,
workspace scoping and catalog pagination.
