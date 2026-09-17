# Receipt and payment performance release — 18 September 2026

## Changes

- Receipt uploads reuse the first fingerprint lookup instead of repeating it. Retries of a stored receipt return its existing private reference without another storage upload.
- Successful receipt audit logging runs with Next.js `after`; security rejection logging, image decoding, scanner checks, duplicate reservations, storage upload and metadata completion remain enforced.
- Independent provisioning reads run concurrently. Payment approval runs provisioning and customer notification concurrently rather than serially, preserving the returned email/provisioning outcome.
- Verification queue exit feedback is 180 ms instead of 700 ms. Notification dismissal no longer holds the approval interaction open.
- Supabase project `psosdbnemnsspmsligpp` was freshly verified in its signed-in dashboard as `ap-south-1` (Mumbai). The previous Vercel deployment's functions were `iad1`. `vercel.json` now selects `bom1` so database-backed functions run near this database. This changes function placement, not database contents or file storage.
- A staff primary-button contrast and Add account wrapping defect found in the live check was corrected without changing navigation or account behavior.

## Evidence

- 332 automated tests passed with zero failures, including receipt retry/no-reupload and deferred audit coverage, provisioning failure visibility, database page ceilings, booking device limit and existing workflow preservation.
- Ten local desktop/mobile browser smoke checks passed before the region-only deployment and narrow button corrections. Local production build and candidate remote build passed before those final changes; the final deployment must independently reach READY.
- Staff domains were staged first. Signed-in User Access, empty Payment Verification queue and Files Management date/client hierarchy loaded correctly with the master session. No real client payment was approved and no real file deleted during this check.
- The first candidate `dpl_5XPRTVziAoRuSoP8UrSZhJYCvpBS` reached READY and was promoted. Public homepage and sample portal returned 200 after the canonical www redirect; anonymous staff API requests returned 401. Candidate error log scan was empty.

## Limits and follow-up

### Final rollout result

The final artifact `dpl_2F9ueVimbLd5KgZe5MK31Z5KiXVy` / `fico-mana-site-1ts898ss1-ficomana1.vercel.app` reached READY, with functions explicitly listed as `bom1`. It passed isolated sample-portal 200 and protected API 401 checks, then both staff domains were assigned. The signed-in master account loaded its two staff records and owner protection; Files Management loaded its five-file synthetic date hierarchy. Computed primary-button text is `rgb(17,19,27)` on `rgb(143,160,255)` and Add account is nowrap; the 390 px User Access viewport had no document overflow. It was then promoted to production. Fresh public homepage/sample checks returned 200 and anonymous staff APIs returned 401. The post-rollout error log scan returned no error entries. These are smoke checks, not a complete production workflow or upload latency benchmark.

- There was no pending payment in the live verification queue. End-to-end receipt upload and approval before/after latency is therefore not measured. Do not claim a percentage improvement or a sub-second approval guarantee from read-route timings.
- Mumbai function placement must be checked in the final deployment's build inventory, not inferred from its build-machine location (builds may still run in iad1).
- Optional external malware scanning and customer email delivery can still contribute latency; no security check was removed to hide it.
- File hierarchy root reads remain paginated studio-wide metadata reads, not database-side folder aggregates. R2 originals are not downloaded to list folders.
- The existing synthetic `FM-988057` workflow still needs the review-to-final-delivery tail completed. Production stress testing was not run. The earlier local development read-stress p95 budget failure is not evidence of a production pass.
- Source changes are uncommitted; deploying the working tree is not a GitHub commit/push.

## Rollback

The prior release is `dpl_9A3xEws7FQLZgdDwYtTfEkP7bwZE` / `fico-mana-site-62ztkkj73-ficomana1.vercel.app`. The first performance candidate above is also an available rollback for a region-specific regression. Restore the selected known-good artifact if receipt linking fails, payment outcomes regress, staff auth fails, or sustained new 5xx errors appear. Re-verify public and both staff domains after rollback; do not alter client database rows as a deployment rollback.
