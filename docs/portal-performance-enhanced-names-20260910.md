# Portal performance and enhanced upload filenames

Status: implemented and verified locally on September 10, 2026. Not deployed or pushed by this task. No live client data, original photos, Google Drive files, credentials, or environment settings were changed. No database migration is required.

## Changes

- Compact, centered four-step navigation (up to 640px on desktop, 44px minimum button height). Existing colors, rounded corners, mobile sticky header and page layout are retained.
- Enhanced editor uploads receive the server-reserved Drive display name `ENHANCED <number> - <CLIENT NAME><original extension>`. The trusted booking supplies the uppercase name. Natural source-path ordering makes a normal upload deterministic; prior reservations keep their number on retries. Existing verified duplicate files remain unchanged.
- Filename reservation uses the existing booking editing lock and checks paginated history, including more than 1,000 prior upload records. A competing reservation fails with a retry instruction rather than allocating the same number.
- The original source-relative path is retained internally. Print matching uses that path, while uploaded-file verification uses the actual Drive display name. Print output labels and original-photo basenames are unchanged.
- The initial authorized portal snapshot and first 48 gallery metadata records are rendered server-side with a streamed skeleton. Client-side controls retain selection, drafts, pagination, live revisions and downloads without immediately repeating the first full data request. Existing private portal validation and rate limits apply to SSR as well as the API.
- Gallery previews warm in tab memory after the first page load, with two simultaneous requests, a 24-item speculative queue, up to 48 cached previews and a 24MB target memory budget. Each cached response is limited to 4MB. Automatic warming pauses on hidden tabs, data saver and slow connections. Managed gallery previews only: no background original/deliverable downloads or public image cache.
- Requested zoom joins an existing fetch or uses prepared bytes. Open previews are retained during background cache eviction; inactive previews have a two-minute idle lifetime. Portal generation/reopening changes and expiry clear cached previews.
- Images already loaded before React hydration clear their skeleton immediately. Image-shaped skeletons and error handling remain for actual waits and failures.

## Verification

- Full automated suite: **385 passed, 0 failed**.
- Type checking and focused lint of all changed application TypeScript/TSX files: passed.
- Production build: passed with the existing Google Fonts fetched using permitted network access. `/portal/[id]` is marked dynamic/server-rendered in the route output.
- Isolated browser QA: actual portal components with synthetic sample records and generated silhouette photos, using a loopback-only proxy that blocked all unrelated APIs and writes.
- Desktop at 1920 x 1080: zoom used a loaded `blob:` preview; closing and reopening it did not increase that sample image's request count. Loaded first-row photos had no leftover skeleton after hydration.
- Mobile at 390 x 844: compact workflow navigation remained joined to the client header while scrolling.
- Browser checks produced no new application errors after a full reload. A development hot-reload warning occurred while changing a hook dependency list, and disappeared on a fresh load.
- Reservation tests cover retry reuse, concurrent attempts, database-read failure cleanup and history beyond the default database result limit.
- The print workflow test compares every generated print filename before and after enhanced-file renaming; all are identical.

## Cleanup and limits

The temporary QA route and its generated development type references were removed, both local QA servers were stopped, and browser viewport overrides were reset. Existing unrelated working-tree files were preserved.

Production startup in this checkout is intentionally blocked by its test-only service settings. Those safety checks were not relaxed and live service credentials were not substituted. Browser testing therefore verifies the real components against isolated data, not a live end-to-end Google Drive upload. The final production build is clean, but real-service smoke testing remains a deployment-stage check.
