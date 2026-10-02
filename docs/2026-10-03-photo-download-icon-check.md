# Individual photo download icon

Scope: local refinement requested by owner; no deployment authorized for this change.

## Requirements and risk analysis before test generation

R1: individual Download becomes an icon at the top-left of its photo. R2: filename remains below. R3 (existing invariant): authorization, original/deliverable kind and endpoint remain unchanged; individual downloads do not use bulk quota. R4 (existing invariant): clicking download cannot select or open the photo. R5: loading, error/retry, keyboard and mobile access remain usable.

Assumptions: apply the same presentation to contact-sheet cards, the large preview and enhanced hero, not filmstrip navigation or Download All. Keep access-gated visibility. No new libraries, network calls on render, or live-client test downloads. Layout assessments independently identify sibling controls (not nested buttons), persistent 44px targets, high-contrast backing and readable errors as necessary. Existing mobile metadata is hidden; only downloadable cards restore filename visibility.

Risk/coverage matrix: R1/R2 → SC1 (P1 browser geometry, names, mobile/901px/desktop); R3/R4 → SC2 (P1 controlled synthetic click, no preview/selection/quota action); R5 → SC3 (P1 component pending/rejection/retry and browser keyboard/error visibility). Negative checks: no unauthorized controls in open selection, no nested buttons, no overflow or real downloads.

Scenarios: SC1 opens a submitted synthetic portal, inspects raw thumbnails and enhanced hero at supported widths. SC2 activates a single-photo icon using the keyboard; a synthetic rejected preparation leaves the portal and choices intact. SC3 holds preparation pending, verifies busy/disabled feedback, rejects it and retries successfully using a stub, with readable recovery text.

Oracles (separate from scenarios): SC1 computed target size >=44px and inset near 8px within image bounds; button has no visible Download text; correct filename remains visible. SC2 exact existing single-photo endpoint/kind, zero bulk calls, no preview dialog and unchanged choices. SC3 named busy button becomes disabled only during preparation, role=alert contains exact error and button becomes enabled for retry. Fixtures prohibit hosted access and actual photo transfers.

Test generation: Node component harness and existing Playwright private-portal fixture; model inherited from current Codex session (exact runtime model ID not exposed), Impeccable 4.3.1 / ai-test-generation 2.0. Input is owner's screenshot-backed request recorded above. Human review remains required before merge; no human approval is inferred from automated tests.

## Verification

Local implementation complete. Shared icon presentation is used by contact-sheet cards, the large raw preview and the enhanced hero. The icon remains visible (not hover-only), has a 44x44px target, accessible filename-specific label/title, preparing status/spinner and existing authorization-backed handler. Errors remain in normal flow below the photo. Downloadable cards retain filenames on mobile. The downloadable grid uses three columns at 901–1100px and four at 1101–1260px to prevent overlap with selection badges; metadata wraps as filename then status. Fixed column counts retain the existing layout invariant; the first automatic-fill version was caught by the full GitHub regression suite and replaced, not waived.

Final checks: 18/18 focused Node tests; 26/26 browser tests, zero retries/skips, including existing PIN, locked selection, quota request and revoked-access regressions. New icon tests cover 390/901/1440px under desktop and mobile Chromium projects, icon bounds, no visible text label, filename visibility, badge separation, keyboard activation, exact original/enhanced preparation routes, error/retry and no bulk calls or selection changes. Fixture logs reject actual downloads, hosted requests and unlisted mutations. Screenshot inspection caught the cramped 901px layout in the first batch; the one permitted confirmation showed the correction working.

Typecheck and focused ESLint passed; final isolated production build passed (11.8s compile, 7.5s types, 76 static pages). Impeccable scoped layout scan returned no findings. `git diff --check` passed. Generated QA output is excluded from release packaging. No production configuration, customer record, photo, download allowance or deployed release was changed. No commit, push or deployment performed. Owned port3200 QA server stopped after verification; owner's port3100 left untouched.

Generated-test self-review: both tests are suitable to retain, use existing fixtures/harness and meaningful negative oracles; they do not prove actual R2 transfer bytes or hosted-provider behavior. Human merge/visual review remains pending rather than falsely recorded as approved.
