# Scoped clarity regression plan

Input: owner UX/workflow brief, accepted independent Assessment A, and scoped changes in booking, editor dashboard, System, and portal review. These tests use synthetic local data only. Node's existing test runner and the existing desktop/mobile Playwright projects are retained; no test-framework migration is in scope.

## Requirements and risks

- REQ-1: Booking progress uses visible ordinal steps matching the selected package; internal skipped form IDs must not appear as skipped customer steps.
- REQ-2: Required receipt selection works from the keyboard, and the optional transaction reference has an associated label.
- REQ-3: Failed catalog or availability reads show retry and must not be interpreted as authoritative empty data. Successful empty lists remain valid. Risk: an unavailable date looks bookable.
- REQ-4: Editor next task prioritizes blockers and known work, respects capabilities, and uses shared lifecycle interpretation. Risk: a staff member is sent to an unauthorized or premature action.
- REQ-5: Unknown dashboard/configuration checks remain unknown, not zero, healthy, or delivered.
- REQ-6: Portal submission reassurance does not promise a new approval state, delivery date, or real submission in sample mode.

Invariants: no reservation or receipt submission in browser tests; no hosted services; no guessed approvals or client downloads; no schema, payment, package, or file-mapping change. The final booking reservation validation is not replaced by an initial calendar read.

## Coverage and scenarios

| Requirement | Scenario | Priority | Category |
| --- | --- | --- | --- |
| REQ-1 | Non-graduation progress remains 1–4; active information step is ordinal 3 | P1 | Transition |
| REQ-2 | Enter and Space activate the receipt chooser; chosen image is shown; reference field can be filled by its label | P1 | Keyboard |
| REQ-3 | Availability fails, dates/Next are disabled, retry succeeds | P1 | Recovery |
| REQ-3 | Catalog fails, retry succeeds; an empty successful response remains distinguishable | P1 | Negative/happy |
| REQ-4 | Failed upload outranks download; approved batch outranks routine onsite; onsite-only role never receives editing action | P1 | Pure behavior |
| REQ-4 | Already-uploaded jobs or unknown storage do not become new upload recommendations | P1 | Boundary |
| REQ-5 | Failed checks return refresh task; no known actionable work returns no invented recommendation | P1 | Partial/empty |
| REQ-6 | Locked review is read-only, reassuring, sample-safe; existing portal regression remains intact | P2 | Regression |

## Oracles

Browser assertions use roles and labels: list item step text/current step; disabled date and Next buttons on failed checks; visible retry and recovery; real filechooser event from Enter/Space; filename and disabled Submit before choosing an image. Tests never click Submit Booking. The public routes are mocked at their HTTP boundary.

Pure tests assert specific next-task destination/label/priority, not internal component state. Strict read tests assert successful empty arrays and rejection on transport, non-OK, and malformed-list results. Source contract checks cover neutral System labels and sample-safe portal wording, not a claim of rendered accessibility.

## Review record

Generated tests are offered for owner/maintainer review, not marked human-approved by the agent. Mechanical checks include imports/types, route/label existence, deterministic unit execution, and the isolated browser suite. Final run evidence is reported separately; passing synthetic tests is not production verification.
