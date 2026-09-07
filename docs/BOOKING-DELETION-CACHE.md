# Deleted bookings remaining on screen

## Confirmed code defect

The booking page sent DELETE directly, invalidated only the sales cache, and
then called `getBookings()`. That helper could return the same 90-second-fresh
localStorage snapshot containing the deleted booking. A subsequent DELETE got
404 and displayed an error without removing the stale row. In-flight list reads
also had no mutation-generation guard.

The server list and delete paths both use the configured booking database;
this change does not migrate data or delete any additional records.

## Changes

- A shared deletion helper removes a row from the browser cache only after a
  successful DELETE or the authenticated route's exact already-missing response.
- The table removes the row immediately, closes its drawer/modal and performs a
  fresh read. Already-deleted rows produce an accurate list-updated message.
- Invalidation/save/deletion increment a request generation. Earlier GET results
  cannot overwrite the current cache, and their completion cannot detach a newer
  in-flight request.
- Empty lists have the same cache lifetime as populated lists, avoiding repeated
  requests after deletion of the last booking.
- Manual refresh, initial booking-page load and returning to a visible tab read
  fresh records. Existing content remains visible during a background refresh.
- Same-origin tabs receive cache updates via the existing auto-sync provider's
  storage listener without writing storage back and creating a refresh loop.
- A definitive missing detail response no longer falls back to its cached row.
- Database read failures throw rather than being reported as a missing booking
  or a successful empty list. Authorization and failed deletion responses are not
  converted into success. Existing API bodies, authentication and schema remain.

## Verification

`node --test tests/booking-deletion-cache.test.ts` executes the actual cache
module with synthetic browser storage and mocked network/database boundaries.
Cases cover successful deletion, final-row deletion, already-deleted rows,
authorization/network/server errors, delayed GET races, request deduplication,
manual refresh, other-tab updates, missing details and database read errors.

No actual client booking was deleted during testing. Authenticated visual QA
remained unavailable while the connected browser timed out.
