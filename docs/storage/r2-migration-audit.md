# Cloudflare R2 migration audit

Date: 2026-09-14

This audit records the production storage dependencies found before the migration. Historical migration files and release notes may keep references to Google Drive as history; active runtime code may not.

## Active integration surfaces

- Storage client and authorization: `lib/google-drive.ts`, `lib/google-oauth.ts`, `lib/google-drive-scopes.ts`, and `lib/drive-folder-mappings.ts`.
- Booking initialization: `lib/booking-provisioning.ts`, `app/api/provisioning/route.ts`, and the provisioning/system admin screens.
- Onsite RAW upload and synchronization: `lib/raw-upload-client.ts`, `lib/raw-upload-server.ts`, `lib/raw-upload-contract.ts`, `lib/raw-upload-shared.ts`, `lib/onsite-drive-sync.ts`, and the booking/editor workflow API routes.
- Client portal gallery and selection: `lib/editor-workflow.ts`, `lib/portal-selection-source.ts`, `components/portal-drive-photos.tsx`, and `app/api/editor-workflow/[...path]/route.ts`.
- Editor download/upload and delivery: `lib/editor-workflow.ts`, `lib/editor-upload-client.ts`, editor dashboard components, the filtering batch page, and the workflow API route.
- Print fulfillment: `lib/print-workflow.ts` and `lib/print-manifest.ts`.
- Retention and deletion: `lib/shoot-storage-cleanup-server.ts` and `app/api/admin/shoot-storage/route.ts`.
- User-visible terminology: admin bookings, provisioning, system, filtering, RAW submission, onsite upload, editor upload/queue, client portal, and email templates.
- Deployment/security configuration: `.env.example`, `next.config.mjs`, `lib/security/environment.ts`, `lib/security/schemas.ts`, and `scripts/security-http-check.mjs`.

## Database dependencies

- `google_drive_settings` stores OAuth credentials, root-folder configuration, and portal-expiry settings.
- `drive_folders` stores physical folder mappings.
- `booking_provisioning` stores root/month/day/client folder IDs and a Drive URL.
- `editing_batches` stores day-folder ID and URL.
- `gallery_files`, `deliverable_files`, `batch_upload_files`, `photo_selection_items`, `print_allocations`, and related SQL functions store Drive file IDs.
- The private Supabase `fico-mana-thumbnails` bucket stores a separate preview cache and must be retired after R2-backed preview and thumbnail objects are in use.

## Migration decisions

1. Use one private R2 bucket and a server-only S3-compatible client.
2. Treat Supabase as the source of truth; R2 listings are for reconciliation and cleanup only.
3. Replace physical folder creation with deterministic booking prefixes.
4. Generate object keys on the server from stable workspace, booking, asset, and category identifiers.
5. Upload browser files directly with short-lived presigned PUT or multipart URLs; confirm each object with `HeadObject` before publishing metadata.
6. Serve portal images only after portal-to-booking-to-asset authorization. Cards use thumbnail objects, the viewer uses preview objects, and originals are downloaded only when allowed.
7. Store relational selections rather than copying selected originals.
8. Mark pre-existing Drive-only metadata `migration_required`; never report it as available in R2.
9. Keep portal-expiry policy in generic `storage_settings`; storage retention remains a separate policy.
10. Remove OAuth routes, tokens, folder mappings, Drive environment variables, and Drive-only UI after all runtime call sites use the storage abstraction.

## Key pattern

`workspaces/{workspaceId}/shoots/{year}/{month}/{date}/{bookingId}/{category}/{objectId}.{ext}`

Allowed categories are `raw`, `original`, `preview`, `thumbnail`, `enhanced`, `deliverable`, `print`, and `temporary`.

## Production boundary

Code, migrations, and automated tests can be completed locally. Creating the private bucket, provisioning R2 credentials, applying the production migration, setting exact CORS origins, and configuring lifecycle rules require owner-controlled Cloudflare, Supabase, and Vercel access. Existing binaries must be copied from Drive to their new storage keys before their metadata can be marked `available`.

## Implementation status — 2026-09-15

- Active frontend, backend, email, environment, maintenance, verification, and dependency sources contain no Google Drive integration, credential, URL, folder, or file-ID contract.
- OAuth routes, provider modules, external-folder actions, public RAW submission routes, and provider-specific UI have been removed.
- Browser uploads now use private R2 presigned single-part or multipart plans. Application requests carry metadata, never photo bytes.
- Portal thumbnails, previews, deliverables, ZIP downloads, editor uploads, print lineage, and storage cleanup use owned R2 keys.
- The additive migration marks legacy records `migration_required`; the terminal migration refuses to run until every live object relationship has an available R2 replacement.
- Historical migrations remain unchanged as immutable schema history. The terminal migration and its regression test necessarily name the retired fields they verify and remove; they are not executable application connections.
- Production cutover is not yet authorized: live R2 credentials, object copying, backup/restore rehearsal, hosted preflight, and terminal migration execution remain required.

## Hosted cutover preflight

Run `supabase/maintenance/20260915_r2_cutover_preflight.sql` in the hosted Supabase SQL Editor after Phase 1, after object reconciliation, and once more immediately before Phase 2. It is a read-only report: it performs no insert, update, deletion, schema change, or permission change.

Do not run Phase 2 unless the report returns `cutover_ready = true`. Save the complete result with the release evidence. The eight blocking counters must all be zero; the inventory counts and byte totals must also agree with the independently produced R2 reconciliation report. A zero blocking count verifies metadata relationships, not the physical presence or checksum of an R2 object, so R2 `HeadObject`/checksum reconciliation remains a separate mandatory gate.

## Read-only object reconciliation

Run `pnpm storage:reconcile` only after the target Supabase and R2 environment variables have been loaded locally. Add `--workspace <uuid>` to limit the report to the FICO MANA workspace, `--concurrency <1-50>` to tune metadata-request concurrency, or `--output <path>` to choose the JSON report location.

The command reads only database rows that claim an available R2 object. It checks gallery originals, previews, thumbnails, deliverables, and both print lineage keys. Each unique key receives at most one R2 `HeadObject` request; duplicate database claims reuse that response. It never downloads an object body, lists the bucket, invokes a database RPC, changes a row, or sends an R2 mutation command.

Original gallery and deliverable claims require exact equality between database `file_size`/`checksum` and R2 `Content-Length`/`sha256` metadata. Derivative and print claims do not currently have separate expected size/checksum columns, so they require a positive R2 byte size and a valid stored SHA-256 metadata value. Any missing object, invalid claim, incomplete metadata, size mismatch, checksum mismatch, or HEAD error makes the report fail closed with exit code `2`. Configuration/query failures use exit code `1`; a fully verified report uses exit code `0`.

Reports default to `artifacts/r2-reconciliation-<timestamp>.json`, use create-only writes, and contain private object keys for remediation. Keep them out of public artifacts and attach the final production report to restricted release evidence. Compare its gallery/deliverable claim counts and bytes with the hosted SQL preflight before authorizing Phase 2.
