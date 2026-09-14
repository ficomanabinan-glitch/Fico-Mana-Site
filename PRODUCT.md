# FICO MANA

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Customers, especially graduation clients and students, who book a shoot, pay, choose photographs, follow progress, and receive their finished photographs.
- Studio administrators who manage bookings, clients, payments, schedules, and production handoffs.
- Filtering staff who review submitted selections and approve them for editing or reopen them for the client.
- Editors and upload staff who handle RAW photographs, receive approved selections, upload enhanced photographs, and prepare final delivery and print outputs.

The owner is Elrish John Rull. FICO MANA is the product and studio identity for this repository; do not replace it with XRISH CREATIVES branding without an explicit request.

## Product Purpose

FICO MANA is an end-to-end graduation and studio photography management system. It connects the entire photography lifecycle, from booking, payment, and the shoot through photo selection, editing, and delivery, inside one organized platform.

The system is particularly important for high-volume graduation shoots, where many students may be processed in a short period. Success means clients can complete their part independently, staff can identify the next production action, and files and selections reach the correct project with less manual coordination.

## Operating Context

Four connected areas serve the workflow:

1. Public FICO MANA website: packages, studio information, and customer bookings.
2. Admin system: clients, payment verification, schedules, filtering, and operational reporting.
3. Editor workspace: RAW uploads, approved selections, editing queues, enhanced uploads, and delivery preparation.
4. Client Portal: the customer's private digital workspace for a specific photography project.

The customer journey is booking → payment verification → shoot → RAW upload → client selection → staff review/approval → editing → final upload → client download. These are workflow stages, not a requirement to implement every transition as a separate screen.

The Client Portal bridges customers and production. After booking and payment verification, a portal is created or activated for the booking and the customer receives a secure link. Photographs, instructions, selections, progress, and deliverables are centralized there instead of requiring the client to assemble their project from Messenger conversations, emails, and separate Drive links.

Google Drive is part of the file workflow. Client selections feed the editor queue; staff should not need to manually transcribe filenames from messages. Finished files return to the correct client's project and portal.

The business operates in the Philippines. Existing pricing and payment displays use Philippine pesos, and scheduling must respect the studio's local timezone. Exact package prices, quantities, and availability come from configured business records.

## Capabilities and Constraints

### Client Portal

- Show the client's RAW/preview gallery and package-specific required selection count, including used and remaining selections.
- Allow included photo choices, extra edits, included print allocations, and photo assignments for configured add-ons.
- Present selections and applicable totals for review before final submission.
- Submit choices into the production workflow, show order progress, and make published enhanced photographs and final deliverables available to the correct client.
- Support staff reopening of submitted/approved selections, with client notification, so the client can select again.
- Keep each booking's files and information isolated from other clients. Preserve existing private-link validation, PIN gates where applicable, submission locks, ownership checks, and server-side validation.
- Preserve existing expiry and release rules; do not infer expiry dates from old screenshots or change the event that starts the access period during visual refinement.

### Production and file handling

- Preserve original photographs. Internal source mappings must remain reliable across upload, selection, editing, retries, and print preparation.
- Enhanced uploads use `ENHANCED <number> - <CLIENT NAME>` with the original image extension. The name comes from the booking; retries retain the reserved number.
- Print filenames retain their established names and original-photo mapping. Enhanced display-name changes must not rename print outputs or break matching.
- Package quantities, prices, add-on rules, payment totals, and workflow status are authoritative business data, not decorative frontend values.

### Interaction and performance commitments

- Desktop photo clicks show the photograph in the large preview; selection remains an explicit action. Preserve the established mobile selection and preview gestures.
- Support desktop and mobile as deliberate experiences. Keep essential context and actions accessible while scrolling without obstructing photographs or controls.
- Use image-shaped skeletons with reserved layout space while photographs load. Prepare previews gradually in the background and bound bandwidth and memory use.
- Use server rendering for appropriate initial content and client rendering for interactive selection, zoom, pagination, and live updates. Avoid immediately duplicating the initial data request.
- Preserve approved layouts and working features during scoped refinements; apply only the requested changes.

## Brand Commitments

- Keep the existing FICO MANA name and approved brand assets.
- The owner explicitly requires rounded corners across the interface and compact, minimalist controls with even spacing.
- Photography should remain prominent, with enough room to inspect a large preview.
- Use clear, straightforward client and staff language. Keep implementation terminology out of customer-facing instructions unless it helps the customer act.
- Retain established financial color meaning: revenue blue, expenses red, and profit yellow.

These are existing owner commitments, not a new visual specification. Detailed palettes, typography, and component styling belong to the current implementation or a separately authorized design record.

## Evidence on Hand

- Owner-confirmed product description supplied during Impeccable initialization on 14 September 2026; it is the primary authority for product purpose, audiences, and the connected workflow.
- `app/page.tsx`: public website composition.
- `app/admin/`, `app/editor/`, and `app/portal/`: application areas.
- `components/client-portal-page.tsx` and the portal components: existing customer workspace and interactions.
- `lib/editor-workflow.ts`, `lib/print-manifest.ts`, and `lib/print-workflow.ts`: connected production and print behavior.
- `docs/client-portal-prototype-implementation.md`: historical approved-prototype implementation notes. Some deployment/migration sections describe older checkpoints; they are not current environment status.
- `docs/portal-performance-enhanced-names-20260910.md`: implementation and local verification notes for preview loading, rendering, and upload names.
- Existing repository imagery, copy, and tests provide implementation evidence. Do not invent customer testimonials, affiliations, performance measurements, or deployment results.

## Product Principles

1. Connect the whole photography lifecycle: every client action should arrive in the appropriate staff workflow with its project context intact.
2. Make the client's next action clear and self-service, particularly during selection and delivery.
3. Protect project identity: files, selections, payments, and deliverables must stay attached to the correct booking.
4. Preserve production correctness through UI improvements, including print mappings, original files, pricing rules, and submission state.
5. Design for high-volume studio operations and practical mobile access, with responsive interactions and controlled loading costs.

## Open Decisions

- No formal accessibility conformance target has been specified. Existing keyboard support, focus behavior, readable controls, and reduced-motion behavior should be preserved.
- No unique competitive claim beyond the owner-described connected studio workflow has been asserted.
- Current production availability and deployment state require live verification; this product record does not certify them.
