# Shoot storage cleanup

Location: original Admin → System Settings → Production storage → Delete shoots.
This is a Google Drive cleanup, not a database reset or booking deletion.

## Administrator flow

1. Choose **Selected photo files** (the default) or **Entire shoot folder**. Then
   choose Last 7 days, Last month (30 days), or All time. Recent ranges use the
   scheduled shoot date in GMT+8, include today, and exclude future dates. All time
   includes future shoots too.
2. For photo files, check RAW, selected copies, edited photos, and/or deliverables.
   Nothing is selected by default. Entire shoot folder does not use category
   filters: all contents are included, including non-photo files and subfolders.
3. Review files. This lists matching clients, dates, file counts by category and
   sample filenames. Individual shoots can be unchecked. Review performs no
   business-record or Drive-file writes. In folder mode, a client with zero files
   is still selectable because the folder itself is the target. In file mode,
   an empty row explains why it cannot be selected and points to folder mode.
4. Acknowledge the effect on portals and type `DELETE SHOOT FILES` for photo files
   or `DELETE SHOOT FOLDERS` for complete client folders.
5. Move the reviewed files to Trash. Keep the page open. Progress and a per-client
   report show confirmed and unconfirmed results. Stop ends after the current
   request; it does not undo completed chunks. Failures halt further chunks.

## Preserved data and recovery

- In photo-file mode, root, month, day, client, category and nested folders stay.
- In entire-folder mode, only the selected registered client folder is explicitly
  moved to Trash; its contents inherit the trashed state. Main storage root,
  month/day folders and other clients are protected. Shortcut objects inside the
  folder are included, but their external targets are never traversed or modified.
- Bookings, payments, receipts, accounts, selections, print allocations, database
  image indexes/thumbnails and activity history are not deleted or reset. Stored
  photo counts remain historical counts, not a live count of files in Drive.
- Active portals for affected shoots are disabled before their first file is
  moved. Existing portal and QR sessions are checked against that status by the
  existing server authorization. Expired portals are not reactivated.
- Restore the files (or the entire shoot folder, when folder mode was used) in
  Google Drive Trash before manually reactivating a portal.
  Cleanup does not auto-reactivate or rebuild/rewrite historical selections.
- Direct Drive permissions are unchanged. This is not a privacy-erasure tool.
- Trash still consumes Drive storage; Google normally permanently removes these
  files after 30 days. This feature never empties Trash or permanently deletes
  files. See [Google Drive's deletion and recovery guidance](https://support.google.com/drive/answer/2375102?hl=en).

## Safety and architecture

No schema, RLS, authentication, deployment, or existing API contracts change.
The additive endpoint is `/api/admin/shoot-storage`:

- GET lists date-scoped shoots or previews a specific shoot and selected categories.
- POST requires the exact typed confirmation and a server-signed review token.
- Existing canonical admin membership, MFA, mutation-origin checks, shared
  fail-closed limits and private/no-store responses apply.
- Reviews are actor/workspace/booking/root/date scoped, valid for 30 minutes, and
  bind exact file IDs, category paths, names, sizes, MIME, checksum and modified time.
- Every file's current parent chain is verified back to the configured root. The
  file is re-read immediately before its PATCH. Moved/replaced files require a new
  review. New files uploaded after review are not swept into the cleanup.
- Photo-file tokens still reject folders/shortcuts. Entire-folder mode uses a
  separate signature domain, strict folder token and distinct typed confirmation;
  a file token cannot authorize a folder and vice versa. Folder mode validates
  the registered client/day/month/root chain and Drive's `canTrash` capability.
- Folder previews include a fingerprint of every visible, untrashed entry in the
  bounded tree. The full tree, booking date/root and active upload state are
  checked again before audit/portal changes and immediately before the one folder
  Trash request. Added, renamed, replaced, removed or moved entries require a new
  review. Registered folders belonging to any other booking, including other
  workspaces, block cleanup even when nested below the selected folder.
- Legacy photo-file reviews resolve only canonical category names under their
  registered client folder, without creating folders.
- An active indexed editing upload blocks review/execution for that shoot. Staff
  must finish all uploads and avoid concurrent external file changes; Drive and
  the database do not support a shared atomic transaction or cross-app lock.
- Audit intent must succeed, then portal disabling must succeed, before any
  Drive mutation. Outcome failures/unknown responses never become success claims.
- Confirmed chunks and files already in Trash are safe to retry with an unexpired
  review; the UI instead asks for a fresh read-only review after failures.
- Drive permission/scope errors are reported, not bypassed by expanding OAuth
  scopes. Files uploaded outside the app may require cleanup by their owner in Drive.

Work is bounded: 100 shoots per listing page; 5,000 shoots per UI review; 5,000
files, 200 folders and eight nested category levels per shoot; ten files per
execution request. Folder cleanup handles one client folder per request, up to
200 folders and 5,000 files/shortcut objects; each tree pass has a 40-second bound
and the route has a 120-second execution budget for both checks. Oversized,
ambiguous or stale reviews fail closed. Large
cleanups may require reviewing the remaining files again after token expiry.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm security:check`,
`pnpm security:secrets`, and `pnpm security:http`.

Tests use synthetic metadata and injected mutation functions, not live Drive
files. They cover date boundaries, category validation, signed-token tampering,
expiry, actor/workspace boundaries, changed/moved files, non-file targets,
validation/audit/portal failure ordering, partial failures and already-trashed
retries. The HTTP checks cover anonymous access and hostile-origin requests.

Production UI verification is read-only: open the dialog, adjust filters, review
files, and close it. Do not run real cleanup merely to verify deployment.
