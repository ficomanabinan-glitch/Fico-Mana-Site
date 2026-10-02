# Portal expiry policy save — verified routing defect

Date: 1 October 2026. Status: repaired locally; not deployed.

## Report and production evidence

The owner reported “Settings failed — Could not save storage settings” when saving portal expiry days on `https://editor.ficomana.com/editor/client-portals`.

A read-only request to `https://editor.ficomana.com/api/storage/settings`, with redirects disabled, returned **307**, `Location: /editor/api/storage/settings`, and `Content-Type: text/plain`. The editor-host alias redirected the settings API before its actual handler could run. The page's JSON parsing fallback explains the generic user-facing error. No production PUT was executed to establish this routing defect.

The connected `_FICOMANA` Chrome profile's Supabase account menu confirmed `ficomanabinan@gmail.com`. The dashboard identified production project `ficomana-new2026`, reference `psosdbnemnsspmsligpp`. A read-only SQL inspection confirmed the settings table's expected columns and checks, singleton ID 1, the FICO MANA workspace relationship, expiry 30 days, and signed URL TTL 900 seconds. No client data, policy value, TTL, role, grant, or cloud configuration was changed. The SQL dashboard may retain its automatically saved diagnostic query; that is not a business-data mutation.

## Smallest repair

`lib/supabase/middleware.ts` now passes through the **exact** `/api/storage/settings` path on the editor host alongside the existing Client Portals API paths. It does not open other storage endpoints or change the existing route's administrator authorization, trusted-origin checks, mutation rate limit, validation, or database behavior.

## Regression proof

`tests/storage-settings-routing.test.ts` executes the actual middleware and settings handler with explicit synthetic boundaries:

- GET and PUT no longer redirect to a page alias.
- Other storage paths remain outside the editor-host exception.
- An authorized administrator can persist a valid expiry.
- Signed-out and non-admin callers do not write.
- Invalid values and extra fields do not write.
- Database failure is neither successful nor leaked to the client.

Before the repair: **5 passed, 1 failed**, with the exact unwanted redirect as the failure. After the repair: **6 passed**. Combined with the existing editor queue routing/authorization checks: **11 passed**. TypeScript passed. Subsequent full unit/integration run: **486 passed**, no failed/skipped tests. Full lint: zero errors, 24 warnings. Source security guards and secret scan passed (708 eligible text files); these are not live penetration or RLS proof.

The last complete browser regression was 94/94, followed by two independently passing Download Requests cases. Those tests predate the newest Client Workspace P2 display adjustments and do not establish a successful production policy save.

## Release boundary

The owner's full-brief deployment condition remains active. This local fix must be included in the eventual validated release; no Vercel/GitHub deployment occurred during the investigation. A fresh production route check after deployment must show the endpoint reaches authorization rather than `/editor/api/...`. An authenticated save/readback should use the owner's intended expiry value, not silently change production policy merely to manufacture QA evidence.
