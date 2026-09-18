# FICO MANA final turnover audit

Date: 18 September 2026

Release target: `ficomana1/fico-mana-site`

Production database: Supabase project `psosdbnemnsspmsligpp`

## Outcome

The release candidate passes the automated functional, security, responsive-layout, and isolated 100-user performance gates. The remaining destructive step—removing live client records and their R2 objects—must be performed only after a fresh production inventory and explicit confirmation of the exact counts. Administrator accounts and workspace configuration are outside that cleanup scope.

## Changes included

- File Management previews no longer redirect the browser to an R2 presigned URL. Authenticated staff receive a private streamed response from the application route.
- Client-portal gallery images no longer expose an R2 URL. A valid, unexpired portal session is required for every image response.
- After a client submits their selection, the portal offers **Download all originals** as a rate-limited ZIP download.
- Onsite Upload exposes **Open Client Portal** only after the upload produced gallery files and an active portal, followed by a concise prompt to verify the uploaded photos.
- Booking creation remains limited to 10 attempts per signed device per hour and now has an aggregate abuse ceiling.
- Bulk original-photo downloads are limited to three attempts per portal/IP rate-limit identity per hour.
- Private media responses use `private` or `no-store` caching, `no-referrer`, and content-type hardening headers.

## Performance evidence

The test ran against an optimized local production build with isolated synthetic data. It did not write to production.

| Measure | Result | Budget | Status |
| --- | ---: | ---: | --- |
| Synthetic users | 100 | 100 | Pass |
| Synthetic bookings / portals | 100 / 100 | 100 / 100 | Pass |
| Synthetic gallery records | 15,000 | 15,000 | Pass |
| Database representative-query p95 | 1 ms | 100 ms | Pass |
| Database representative-query p99 | 2 ms | — | Pass |
| HTTP requests | 300 | 300 | Pass |
| HTTP error rate | 0% | <1% | Pass |
| HTTP p50 | 137 ms | — | Pass |
| HTTP p95 | 256 ms | 1,500 ms | Pass |
| HTTP p99 | 256 ms | 3,000 ms | Pass |
| Throughput | 584 requests/second | — | Informational |

The equivalent development-server run was intentionally rejected as performance evidence because development rendering added about 4.2 seconds per page. The optimized production build removed that overhead.

## Functional and visual evidence

- Automated tests: 341 passed, 0 failed.
- Build: passed.
- TypeScript: passed through the production build.
- Changed-file lint: passed.
- Impeccable UI detector on the changed portal, onsite, and File Management surfaces: no findings.
- Desktop portal visual check: no overflow; gallery and preview hierarchy remain clear.
- Mobile portal visual check at 390 × 844: no horizontal overflow; navigation, gallery, and bottom selection action remain usable.

## Security evidence

- Repository security checks passed.
- Secret scan passed.
- Package vulnerability audit reported no known vulnerabilities.
- Private-file regression tests verify that neither File Management nor client-portal image routes redirect to object-storage URLs.
- Portal originals are unavailable before selection submission.
- The local QA authentication bypass is constrained to an explicit QA flag **and** a loopback hostname, so it cannot bypass authentication on a deployed host.

## Low-cost architecture decision

No load balancer or paid application cache is justified by the measured load. Static rendering, paginated database reads, and existing indexes are comfortably inside the release budgets. Adding infrastructure now would increase cost and operational work without solving an observed bottleneck.

## Known limit and follow-up threshold

Private streaming deliberately prevents direct R2 exposure, but it moves media bandwidth through the application host. A ZIP containing 100–150 full-size RAW files may approach hosting duration or bandwidth limits. This release rate-limits the operation, streams without buffering the entire ZIP, and uses no-compression ZIP entries to reduce CPU cost. If real downloads repeatedly exceed the host limits, the next step should be an authenticated Cloudflare Worker or a prebuilt private R2 archive—not a general-purpose load balancer.

The whole-repository lint command was not used as a release gate because it did not complete in a reasonable time in this checkout. Every changed source, test, and QA script passed targeted lint, and the production build plus full test suite passed.

## Client-data cleanup boundary

Cleanup is not part of the synthetic load test. Before deletion:

1. Confirm the production project is `psosdbnemnsspmsligpp`.
2. Produce fresh counts for bookings, portals, photo selections, gallery files, deliverables, print choices, payments, and corresponding R2 objects.
3. Produce fresh counts for authentication users and administrator/editor memberships that will be preserved.
4. Verify recoverability/backups.
5. Obtain explicit confirmation quoting the exact deletion counts.
6. Delete only client workflow records and owned R2 objects, then re-query counts and verify administrator login.
