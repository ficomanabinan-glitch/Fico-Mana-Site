# October 13: batch return reconciliation and booking availability

## Status and boundaries

Implemented and tested locally. Not committed, pushed, or deployed in this task. Production investigation was read-only through the authenticated `_FICOMANA` Chrome session. No customer uploads, deliveries, booking changes, emails, or destructive tests were performed. Existing unrelated changes remain untouched.

No database migration is required. Existing R2 storage, version-one manifests, print metadata, booking IDs, workspace authorization, and folder structure are retained.

## Confirmed production cause

Batch `FM-BATCH-2026-10-04-MAIN` genuinely contains all five editing jobs from the supplied manifest. The production jobs were DOWNLOADED; their bookings were Completed, with matching workspace/client relationships and capping-pinning packages. All five had available RAW records and no deliverables at the time of inspection.

The workspace contained 4,774 available RAW records. The old batch list read this workspace-wide gallery without pagination. A 1,000-row result contained Alexis Cabigas, Patricia Ballesteros, and Christian Ballesteros, but excluded Maja Angela Geron and Juliah Pestio. The live dashboard/detail displayed those same three clients. Batch download instead queried editing jobs by batch/status and included all five. Upload validation relied on the filtered detail and rejected Juliah before creating work.

This was not evidence that Maja or Juliah had left the batch. No reassignment or booking-state repair is needed to resolve the observed mismatch.

## Rules after the fix

- Membership comes from workspace-scoped editing jobs and their persisted batch relationship, not the availability of RAW rows in a dashboard query.
- Listing retains all batch jobs, with total, active, attention, and download-eligible counts where applicable. Missing or changed records get an explanation instead of disappearing.
- Batch reads wait for synchronization before loading membership. Relevant reads use stable pagination and throw on failed/null pages instead of accepting an incomplete read.
- Download eligibility remains separate: jobs must be permitted by their current booking/package/workspace/client relationship and supported editing status. Selected source files must actually exist and belong to the correct client before reserving a download or generating its manifest.
- `POST /api/editor-workflow/batches/:batchId/preflight` independently classifies every supplied client as READY, DELIVERED, UPLOADING, ATTENTION, MISSING, OTHER_BATCH, or INVALID. Supplied manifest IDs do not grant authorization.
- Existing historical manifests remain compatible. An otherwise eligible historical job can receive edited files even when RAW-gallery visibility has changed.
- The browser shows names, reasons, totals, and an explicit eligible-subset confirmation. It performs another uncached server preflight immediately before starting. Newly eligible clients outside the confirmed subset are not silently added.
- Start, per-file operations, and finalization recheck the server-side booking/job/workspace/batch relationship. Cancellation, reassignment, changed client identity, or previous delivery cannot be bypassed by an old manifest.
- Delivered clients are skipped; retries preserve existing duplicate/checksum handling. Partial batches are not marked complete. Failure of the final aggregate read cannot publish COMPLETED.
- Print preparation and filename matching remain associated with their original booking and selection. Publication failures are surfaced rather than reported as successful delivery.
- Reconciliation logs include aggregate status counts only, without client names, IDs, filenames, or signed URLs.

## Booking availability

Both availability consumers use a shared loader with stable pagination and exact-count checks. DB/transport failures, null data, inconsistent counts, duplicate rows, premature empty pages, or unsafe read limits cause a 503 response. A verified successful empty read still means zero reservations. Booking creation/schedule checks cannot continue after an unverifiable availability read. Package-read failures are distinguished from a successfully verified nonexistent package.

## Files changed in this task

### Application

- `lib/booking-availability-read.ts`: shared fail-closed availability reader.
- `app/api/bookings/route.ts`: creation/update availability checks use the reader and service-unavailable errors.
- `app/api/bookings/availability/route.ts`: public availability uses the same verified reader while preserving anonymized output.
- `lib/editor-batch-membership.ts`: shared membership, independent eligibility classifications, and paginated reads.
- `lib/editor-workflow.ts`: consistent list/detail/download membership, fresh upload validations, preflight, delivery checks, and aggregate-only diagnostics.
- `app/api/editor-workflow/[...path]/route.ts`: authenticated preflight endpoint and updated start inputs.
- `lib/security/schemas.ts`: strict preflight/start payload validation with historical metadata compatibility.
- `lib/editor-upload-client.ts`: preflight, explicit subset execution, per-client folder validation, and retry/skip reporting.
- `components/editor-upload-photos.tsx`: accessible, responsive review and confirmation interface.
- `lib/editor-read-cache.ts`: typed additional membership/count fields; cached display detail is not upload authorization.
- `components/editor-dashboard.tsx`, `components/editor-queue.tsx`, and `app/admin/filtering/batch/[batchId]/page.tsx`: truthful totals and attention explanations.

### Regression tests and fixtures

- `tests/booking-availability-read.test.ts`: 21 behavior cases, including read failures and truncated/inconsistent results.
- `tests/editor-batch-membership-server.test.ts`: 11 behavior cases exercising the server workflow with synthetic DB responses, including the five-versus-three scenario, the 1,000-row cap, historical membership, tampering, subset initialization, lifecycle checks, prints, and final aggregation failure.
- `tests/editor-upload.test.ts`: expanded browser-client behavior tests for independent preflight, partial execution, retries, delivered skips, and manifest/folder safety.
- `tests/helpers/load-ts.ts`: loads actual shared membership/availability logic in the test harness.
- `tests/editor-download-groups.test.ts` and `tests/package-workflow.test.ts`: updated obsolete source assertions to reflect shared membership; behavioral tests validate the changed rule.
- `e2e/batch-upload-reconciliation.spec.ts` and `e2e/fixtures/batch-return-folder/`: synthetic five-client folder exercise on desktop/mobile. Fixture JPG files contain synthetic test bytes, not customer photographs; mocked duplicate responses avoid real photo uploads or decoding.

## Executed checks

- `node --test --test-reporter=spec tests/*.test.ts`: 587 passed, zero failures.
- `node --test tests/editor-batch-membership-server.test.ts`: 11 passed again after adding aggregate diagnostics.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/eslint/bin/eslint.js <all changed application/test files>`: passed, zero errors/warnings.
- `npm.cmd run build`: successful production build.
- `node scripts/security-http-check.mjs`: production-build HTTP security checks passed against an owned local server with synthetic credentials.
- `node scripts/security-check.mjs` and `node scripts/secret-scan.mjs`: passed. The secret scan reports tracked text files, not a guarantee about every untracked fixture.
- `node node_modules/@playwright/test/cli.js test e2e/batch-upload-reconciliation.spec.ts e2e/editor-queue.spec.ts --workers=1`: six passed across desktop/mobile Chromium. Tested all five reconciliation rows, explicit confirmation, only three eligible clients initialized, delivered skipping, keyboard activation, queue permissions, and responsive overflow.
- `git diff --check`: passed; Git emitted only Windows line-ending notices.

Automated tests used synthetic records/provider mocks. They do not constitute a real R2 upload or production delivery verification of this new code.

## Rollout and verification

1. Review/stage only this task's files; exclude unrelated docs and generated changes.
2. Deploy the application as an isolated candidate using the established Vercel release gates. No SQL migration or R2 object rewrite is needed.
3. Verify the candidate reaches READY, authenticated editor routes load, and relevant logs contain no new runtime failures. Test new preflight authorization and five-client review using synthetic data.
4. Promote the verified artifact only with deployment authorization.
5. In production, re-open the October 4 batch and confirm all five jobs are represented. Select the existing edited folder and inspect the fresh classifications without starting a customer upload merely as a smoke test.

## Safe staff recovery after rollout

Keep the existing downloaded folder and all edited files unchanged. Retain the root `manifest.json`, client metadata, and each client's `SELECTED/EDITED` folder. Do not move clients to another batch, re-export images, reset selection, delete files, or change booking status to force validation.

Choose that folder in Editor Upload. Review all five names and server reasons. If all five are still eligible, confirm Upload 5 Eligible Clients. If any real state has changed since investigation, upload only the explicitly eligible subset and ask an administrator to review the others. Keep skipped/failed files locally. Refresh preflight before retrying; successfully delivered clients should be skipped, not delivered again.

## Remaining architectural limits

The booking availability change fails closed on reads but does not make the existing check-then-write booking reservation atomic; simultaneous submissions can still require a separate capacity/transaction hardening change. Existing blocked-slot helper behavior was not part of this patch.

Batch reads are paginated, not transactionally snapshot-isolated. Upload authorization is revalidated at subsequent stages to prevent stale dashboard/manifest data from granting access. Existing multi-write delivery publication is not converted to a new database transaction: partial write failures now surface for administrator review. No claim is made that unrelated races or every storage outage have been eliminated.
