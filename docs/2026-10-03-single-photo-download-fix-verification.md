# Individual-photo download fix — local verification

Date: 2026-10-03. Workspace: E:/zzzzFICO LOCAL/Fico-Mana-Staging.

Status: locally ready, not pushed or deployed. Production source remains323ab204ba9933e60efc2bc090f0184571432056. New source and tests staged locally; unrelated previous changes preserved.

## Request / expected behavior

Clicking an individual photo's top-left download icon should prepare that photo, not show “Choose a valid photo.” The icon must remain visible and usable while choosing photos, not only after submission. Individual downloads remain separate from the two weekly bulk allowances.

## Causes / scoped repair

- The single-photo route's UUID expression accepted8-4-4-12 instead of8-4-4-4-12. Standard valid gallery and enhanced file IDs were rejected400. Corrected one expression; did not relax validation to arbitrary paths or storage keys.
- ClientPhotoSelection gated icons on `locked`. Real portals now pass `canDownloadIndividual={!sampleMode}`. Top-left placement,44px targets, visible focus, in-flow errors, keyboard behavior and selection controls remain unchanged. Sample portals cannot download.
- Single-original preparation reused the bulk submission guard. It now starts with portalRecord, preserving portal status/expiry/reset checks, workspace+booking file predicates, available R2 storage, published enhanced files and object-key ownership. Bulk preparation still requires submitted selection and retains its existing quota.

## Reproduction and regression proof

Windows / Node24.20.0 / Next16.3.6, baseSHA323ab204. No known-good single-photo endpoint was supplied, so no destructive checkout/bisect was performed. `git log -S 'Choose a valid photo.'` identifies initial implementation66d2265; inspection confirmed the incomplete pattern existed there.

Minimal reproduction: POST portal single-photo with a standard UUID. Before fix it returned400 “Choose a valid photo.” even for a synthetic owned available file. Before UI fix the open-selection control was absent. The regression was written and failed before application edits.

Regression: `tests/portal-single-photo-route.test.ts`, plus updated `e2e/portal-photo-download-icon.spec.ts`.

- Actual server route and preparation code execute with an isolated in-memory database. Standard UUID returns a one-file private handoff during OPEN selection with zero bulk-quota calls. Bulk originals still reject unsubmitted selection.
- Malformed IDs, foreign booking, unpublished enhanced file and expired portal fail without a handoff. Published enhanced file succeeds. Reset, foreign workspace, unavailable object and foreign object key reject.
- Ten deterministic iterations: removing UUID fix in memory returns400; separately restoring the submission gate returns409; actual fixed source returns200. No working-tree revert or customer records used.
- Browser interception blocks external providers and real file downloads; clock and photo IDs are synthetic. Icon clicks do not alter choices, open preview or submit selection. Preparation failure recovers to an enabled retry.

## Results

- Focused route/button/Worker checks:19/19 passed before the full run.
- Full Node suite:533/533 passed, zero skipped, using `--test-concurrency=2` (63.1s).
- Initial unrestricted parallel run hit local memory exhaustion (PGlite allocation / process-start failures). Lower parallelism resolved it; application behavior was not modified to hide failures.
- Typecheck: passed. Touched-file lint: passed with no output. Security source checks and tracked-file secret scan: passed. `git diff --check`: passed; only existing Windows line-ending notices.
- Isolated optimized build `.next-qa`: compiled5.8s; types10.9s;76 static pages generated successfully. Synthetic credentials only; no hosted schema/environment changes.
- Browser suite:26/26 passed (36.3s), desktop and mobile Chromium projects. Icon geometry at390/901/1440px, open-selection visibility, retry/keyboard/click isolation, PIN correction/submission, bulk-request reason persistence, quota and access-denied clearing covered.
- Visual inspection: desktop and mobile captures confirmed top-left icons, readable filenames, separate selection badge, in-flow errors and no new overflow. Impeccable preserved the incumbent interface while checking actionable loading/error/focus states.
- Owned QA server3200 stopped and no listener remains; owner3100 left unchanged.

## Limits / remaining release step

These results prove local behavior, not a live production download from R2. No real customer photos transferred, no allowance consumed, no migration, deletion, provider configuration or billing changes. No GitHub push or Vercel deployment performed. On explicit deployment authorization, publish the scoped changes, wait for candidate READY, perform protection-aware isolated smoke tests and log checks, promote that exact artifact and verify custom-domain mappings.

Usage rule: checkpoint only at <=10% remaining in the five-hour window; weekly usage does not stop work.
