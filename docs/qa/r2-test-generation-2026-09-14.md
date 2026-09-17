# FICO MANA R2 test-generation record

Date: 2026-09-14
Input: Cloudflare R2 migration specification plus the current code diff
Input SHA-256: `1348560A5F9F7FD2AD87160A6ED994B5C339D578F468313BECC72EFE1A659DAF`
Generator: `gpt-5` in Codex
Skill: `ai-test-generation` 2.0
Framework: Node.js test runner for unit/integration tests; PGlite for isolated PostgreSQL behavior; Playwright is deferred to the browser QA stages.

## 1. Extracted requirements

| ID | Requirement |
| --- | --- |
| REQ-R2-01 | Cloudflare R2 is the only active binary-storage provider; active runtime, UI, email, environment, dependency, and current-schema code contains no Google Drive integration. |
| REQ-R2-02 | Every private object key is generated on the server and is bound to one workspace, booking, shoot date, category, and object identifier. |
| REQ-R2-03 | A client or staff user can receive a short-lived signed URL only after authorization and metadata ownership checks succeed. |
| REQ-R2-04 | Direct and multipart uploads remain unpublished until R2 metadata, byte size, MIME type, and SHA-256 checks pass. |
| REQ-R2-05 | Multipart sessions reject expired, foreign, incomplete, duplicated, or malformed completion data and remain safely retryable. |
| REQ-R2-06 | Photo selection continues to reference relational `gallery_file_id` values; source-to-selection-to-enhanced-to-print lineage remains intact. |
| REQ-R2-07 | Enhanced uploads retain print filenames while normal enhanced deliverables use the approved numbered client-name format. |
| REQ-R2-08 | Portal expiry begins from the intended delivery rule and remains independent from R2 object retention. |
| REQ-R2-09 | Shoot reset/deletion cannot cross a booking namespace and leaves metadata unavailable when object deletion succeeds or partially fails. |
| REQ-R2-10 | Phase 1 is additive and compatible; Phase 2 aborts before removing any legacy identifier if a durable object or relationship has no verified R2 replacement. |
| REQ-R2-11 | The R2 settings and multipart tables are inaccessible to public, anonymous, and authenticated database roles; only `service_role` can use them. |
| REQ-R2-12 | Existing package allowances, extra-photo prices, payment totals, print assignments, and notification state transitions do not change during storage migration. |

## 2. Assumptions, invariants, and unresolved external evidence

### Validated assumptions

- Supabase remains the metadata source of truth; R2 stores binaries only.
- The R2 bucket is private and object access is signed server-side.
- `gallery_files.storage_key` and `deliverable_files.storage_key` are private object keys, never public URLs.
- The app uses deterministic booking namespaces under `workspaces/{workspace}/shoots/{yyyy}/{mm}/{dd}/{booking}/`.
- Historical migrations and dated release records may describe the old provider, but active code and the new terminal schema may not depend on it.

### Invariants

- INV-01: A storage key for booking A can never be signed, deleted, or confirmed under booking B or workspace B.
- INV-02: `storage_status = 'available'` is impossible until the actual object has passed metadata, size, and checksum verification.
- INV-03: A submitted selection resolves only to available gallery rows in the same workspace and booking.
- INV-04: Every ready print copy traces to the selected original and a verified enhanced object without changing the client-facing print filename.
- INV-05: Phase 2 performs no object deletion and commits no partial schema cleanup.
- INV-06: R2 access credentials never enter client bundles, API JSON, database rows, logs, or repository history.
- INV-07: Portal access expiration does not delete retained R2 objects.
- INV-08: Money, package, print, and booking calculations remain provider-independent.

### Evidence still requiring configured external systems

- Hosted Supabase grants, RLS, migration duration, and live preflight row counts.
- R2 CORS behavior, signed URL expiry, multipart completion, lifecycle rules, and checksum metadata with production-equivalent credentials.
- Vercel request/runtime behavior and Resend acceptance/delivery in a preview environment.
- Browser network and memory budgets for real 100–150-photo galleries.

These are release blockers, not assumptions to fake in local tests.

## 3. Coverage matrix

| Requirement | Scenario | Category | Priority | Oracle type |
| --- | --- | --- | --- | --- |
| REQ-R2-01 | SC-001 active source and package manifests contain no retired provider imports, routes, fields, UI copy, env names, or dependencies | Regression | P0 | Static negative oracle |
| REQ-R2-02 | SC-002 create and parse a valid key; reject traversal and cross-booking/workspace ownership | Security/boundary | P0 | Return value + thrown error |
| REQ-R2-03 | SC-003 authorized portal/staff file request resolves only owned, available metadata; foreign/unavailable IDs fail | Security/negative | P0 | HTTP status + redirect target class + no leaked key |
| REQ-R2-04 | SC-004 valid upload confirmation publishes one gallery/deliverable row; wrong metadata, size, type, or checksum publishes none | State/negative | P0 | R2 metadata + persisted DB status + audit |
| REQ-R2-05 | SC-005 valid ordered multipart completion succeeds; expired, missing, duplicate, out-of-range, or foreign parts fail | Boundary/state | P0 | Provider call + DB session state + negative side effect |
| REQ-R2-06 | SC-006 selection and print rows resolve through same-booking gallery IDs after provider identifiers are removed | Integrity | P0 | Foreign-key joins + persisted lineage |
| REQ-R2-07 | SC-007 normal enhanced output is numbered by client; print output preserves the manifest filename | Business rule | P0 | Exact filenames + source-relative mapping |
| REQ-R2-08 | SC-008 first published deliverable starts one deadline; later files do not reset it; expired portal cannot sign while object remains | Time boundary | P0 | Timestamps + object existence + denial |
| REQ-R2-09 | SC-009 owned reset is idempotent; cross-booking key and partial provider failure cannot report successful cleanup | Security/recovery | P0 | DB status + object list + audit/error |
| REQ-R2-10 | SC-010 Phase 1 preserves legacy rows and marks them migration-required; Phase 2 rejects an unmigrated row with zero schema loss | Migration/negative | P0 | Catalog + row counts + transaction rollback |
| REQ-R2-10 | SC-011 Phase 2 succeeds only for verified fixtures and removes retired columns/tables/functions while preserving business rows | Migration/happy | P0 | Catalog + row equality + function behavior |
| REQ-R2-11 | SC-012 anonymous/authenticated roles cannot read/write storage settings or multipart sessions; service role can | Authorization | P0 | SQL privileges + RLS behavior |
| REQ-R2-12 | SC-013 identical provider-independent booking fixture produces unchanged selection total, remaining balance, extras, and print count | Regression | P0 | Exact business values |
| REQ-R2-04 | SC-014 simultaneous confirmation/retry cannot create duplicate metadata or double-count uploaded files | Concurrency | P1 | Unique row + counters + audit cardinality |

All requirements have a happy-path scenario and either an explicit negative scenario or a paired negative branch. Every Critical/High migration risk maps to at least one row; no rows differ only by fixture data.

## 4. Candidate scenarios

### SC-001 — retired provider regression scan

- **Given:** the active app, component, library, script, environment example, package manifest, lockfile, and terminal migration sources.
- **When:** the release scan checks retired provider tokens and package names while excluding explicitly archived history.
- **Then:** it returns no active matches and confirms R2 modules/settings are present.

### SC-002 — private key ownership

- **Given:** two synthetic workspaces and two bookings on the same shoot date.
- **When:** keys are generated, parsed, and checked under matching and mismatching identities, including traversal filenames.
- **Then:** the owned key round-trips exactly; every foreign or malformed key is rejected.

### SC-003 — signed access authorization

- **Given:** one available R2 gallery row, one unavailable row, and authenticated principals for the owning portal, another portal, an authorized editor, and an unrelated workspace.
- **When:** each principal requests the thumbnail, preview, or deliverable endpoint by metadata ID.
- **Then:** only the owning portal and permitted workspace staff receive a short redirect; failures reveal neither object key nor signed URL.

### SC-004 — upload confirmation integrity

- **Given:** a server-signed upload grant and a synthetic R2 object.
- **When:** confirmation runs with correct metadata, then with independently corrupted booking metadata, MIME type, length, and checksum.
- **Then:** only the valid object becomes `available`; each corrupt case remains unpublished and records a bounded failure.

### SC-005 — multipart boundaries

- **Given:** a multipart session at the single-upload threshold and sessions with expired/foreign identifiers.
- **When:** parts are completed in valid order, missing order, duplicate order, out-of-range order, and after expiry.
- **Then:** only the complete owned sequence reaches `completed`; invalid cases do not publish metadata.

### SC-006 — relational selection and print lineage

- **Given:** selected gallery rows in two bookings and print allocations for toga, Alampay/Barong, frame, and wallet sizes.
- **When:** the selected set and print manifest are resolved after the legacy identifier columns are absent.
- **Then:** only same-booking R2 rows resolve, quantities remain correct, and cross-booking IDs are rejected.

### SC-007 — enhanced and print filenames

- **Given:** two enhanced deliverables and one print-bound source for a synthetic client.
- **When:** upload reservations and print copies are generated.
- **Then:** standard deliverables use `ENHANCED {n} - {CLIENT NAME}` while print output keeps the manifest filename and both R2 lineage keys are persisted.

### SC-008 — portal expiry and retention

- **Given:** an active portal with a 30-day policy and two deliverable publication events.
- **When:** the first and second events fire, then access is attempted immediately before and after expiry.
- **Then:** the deadline begins once, never extends on later uploads, access fails after expiry, and the retained R2 object is untouched.

### SC-009 — safe reset/delete

- **Given:** two booking namespaces, derivatives, print copies, and a simulated failure partway through deletion.
- **When:** staff reset the owned shoot, retry it, and attempt a token/key from the other booking.
- **Then:** owned completion is idempotent, foreign deletion is denied, and partial failure cannot leave metadata claiming full availability or success.

### SC-010 — failed cutover rolls back

- **Given:** Phase 1 plus one `migration_required` gallery or deliverable row.
- **When:** Phase 2 runs.
- **Then:** it raises the specific R2 cutover error and every retired column/table/function is still present because the transaction rolled back.

### SC-011 — verified cutover succeeds

- **Given:** Phase 1 fixtures where all durable rows are `r2`, keyed, available, and relationally valid with no active multipart session.
- **When:** Phase 2 runs.
- **Then:** retired columns/tables and the reconciliation RPC disappear; replacement expiry/review/reset functions work; booking, selection, payment, and print rows remain.

### SC-012 — database isolation

- **Given:** public, anonymous, authenticated, and service-role sessions.
- **When:** each attempts storage-settings and multipart reads/writes.
- **Then:** only service role succeeds; RLS remains enabled and no permissive public policy exists.

### SC-013 — unchanged business totals

- **Given:** a package with five included edits, one ₱400 extra, confirmed payment, and print allocations.
- **When:** the storage metadata changes from compatible Phase 1 to R2-only Phase 2.
- **Then:** included count, ₱400 extra, booking total, paid amount, remaining balance, and print quantities are exactly unchanged.

### SC-014 — confirmation retry race

- **Given:** one uploaded object and two simultaneous confirmation attempts with the same signed reservation.
- **When:** both requests complete.
- **Then:** exactly one metadata row and one logical upload count exist; the retry returns the existing verified result rather than duplicating it.

## 5. Assertion and oracle definitions

| Scenario | Positive oracles | Negative/side-effect oracles |
| --- | --- | --- |
| SC-001 | R2 client/storage/settings symbols exist | zero active retired-provider matches; no retired dependency |
| SC-002 | exact parsed workspace, booking, category, extension | throws for traversal, malformed, foreign workspace, foreign booking |
| SC-003 | authorized 302/307 to an R2 signed HTTPS URL with bounded expiry | 401/403/404 for wrong principal/state; response body and logs omit keys/secrets |
| SC-004 | row becomes `r2/available`; size/checksum/metadata equal reservation | no available row or success audit after any mismatch |
| SC-005 | provider receives sorted contiguous parts; session becomes completed | no complete call/publication for expired, foreign, missing, duplicate, or invalid parts |
| SC-006 | exact joined IDs, source names, categories, quantities | no cross-booking selection/print row survives validation |
| SC-007 | exact enhanced sequence and exact print filename | duplicate reservation does not increment sequence or rename print |
| SC-008 | first event creates one immutable deadline | later event does not extend; expiry does not issue signed URL or delete object |
| SC-009 | owned rows become deleted/reset once; audit records correct booking | foreign namespace untouched; partial failure returns error and nonterminal state |
| SC-010 | named preflight exception and hint | catalog and rows exactly unchanged after rollback |
| SC-011 | old catalog entries absent; replacement functions and business rows present | no provider settings/table/column remains active |
| SC-012 | service-role CRUD succeeds | explicit privilege/RLS denial for public, anon, authenticated |
| SC-013 | exact count and Philippine-peso values match pre-cutover fixture | no extra charge, payment, print, or status drift |
| SC-014 | one unique row, one counter increment, reusable verified response | no duplicate row, double-count, or conflicting audit event |

## 6. Generated test-code targets

- Extend `tests/r2-storage-keys.test.ts` for boundary and ownership cases.
- Add `tests/r2-migration-sql.test.ts` for Phase 1 compatibility, Phase 2 rollback/success, privileges, and replacement functions.
- Add `tests/r2-storage-contract.test.ts` for active-source regression scanning and schema/runtime contract alignment.
- Replace provider-era fixtures in upload, expiry, selection, reset, print, and security tests with R2 metadata and object-key oracles.
- Keep provider-backed CORS/signed URL/multipart and full browser tests separate because they require configured preview credentials.

## 7. Human review record

Review decisions are recorded after code generation and execution. A test may be marked **KEEP** only after imports/types resolve, every route/helper is confirmed in source, the test passes independently, and its assertions prove the listed business outcome. External-system scenarios stay **DEFER** rather than being replaced with misleading mocks.

| Generated target | Initial decision | Required review evidence |
| --- | --- | --- |
| `r2-storage-keys.test.ts` additions | Pending | Typecheck, isolated pass, explicit malformed/foreign assertions |
| `r2-migration-sql.test.ts` | Pending | Isolated forward/rollback catalog and row assertions |
| `r2-storage-contract.test.ts` | Pending | Active scan scope reviewed; archive exclusions explicit |
| Updated upload/expiry/selection/reset/print/security tests | Pending | Full suite pass and one-by-one traceability review |
| Provider-backed R2 and browser checks | DEFER | Preview credentials, synthetic namespace, and cleanup approval |
