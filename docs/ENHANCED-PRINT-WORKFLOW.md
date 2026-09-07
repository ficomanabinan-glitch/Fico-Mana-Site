# Enhanced-photo print workflow

## Behavior

Client submission continues to copy selected originals into the selected-photo folder for the editor. It no longer copies RAW images into free-print category folders. It creates an empty `PRINTS` folder and writes `manifest.json` beside that folder, not inside it.

The selected folder uses `SELECTED N PHOTOS`, where N is the current package selection limit. A legacy `N SELECTED PHOTOS` folder is renamed in place when provisioning next runs, preserving its Drive ID. Existing uploaded originals and existing category folders are not deleted by this change. The RAW, EDITED PHOTOS and DELIVERABLES destinations remain unchanged; moving RAW into the client root is a separate, unexecuted migration requiring a confirmed scope.

Example after a successful editor upload:

```text
Client folder/
  RAW/                       (existing destination, unchanged)
  SELECTED 5 PHOTOS/
    0920.CR3                  (selected original, unchanged)
    ...
    manifest.json
    PRINTS/
      TOGA PICTURE - 0920.JPG
      ALAMBAY BARONG - 0921.JPG
      FRAME - 0922.JPG
      WALLET SIZE 1 - 0923.JPG
      WALLET SIZE 2 - 0923.JPG
      WALLET SIZE 3 - 0923.JPG
      WALLET SIZE 4 - 0923.JPG
  EDITED PHOTOS/              (verified enhanced uploads, unchanged)
  DELIVERABLES/               (existing destination, unchanged)
```

The filename spelling `ALAMBAY BARONG` follows the requested file naming; the existing portal category label and enum remain unchanged. The current portal chooses one photo for the wallet category and quantity four. Four different wallet choices are not silently inferred from filename examples; changing that selection behavior requires a separate confirmed change to its UI and persistence.

## Manifest and upload lifecycle

1. On client submission, saved booking-scoped print allocations generate seven individual pending output slots (1 toga, 1 alampay/barong, 1 frame, 4 wallet). The JSON records source gallery IDs, original filenames, print sizes, copy numbers and output name prefixes. It contains no login credentials or signed portal access links.
2. Batch downloads include the instructions in each existing client entry's additive `print_manifest` field and as `SELECTED/manifest.json`. Existing schema version, batch/client identifiers, `.fico-client.json`, EDITED folder routing, and day/week/month collection contracts remain compatible. A print manifest is not itself an upload-routing manifest.
3. The editor retains the original photo basename when exporting. An extension change such as `0920.CR3` to `0920.JPG` is allowed. Exact full filename matches take precedence; an exact unique basename is the only fallback. No matching by file order, trailing digits, guessed suffixes, or another client's files occurs.
4. The finalizer rebuilds instructions from the database; it never trusts an edited or uploaded manifest to authorize a Drive operation. Eligible enhanced files must belong to this workspace, booking, editing job and successful upload run, with matching path, Drive ID and checksum.
5. Every unique enhanced source is checked for its authorized EDITED folder, booking metadata, filename, MIME, current content hash and size. All names are resolved and verified before the first print is copied.
6. Copies go directly into PRINTS. The original enhanced image's bytes and extension are preserved; neither RAW nor enhanced originals are renamed or modified. The pending manifest becomes ready only after every copy passes verification. It then records enhanced file IDs/checksums, actual output filenames and every print-copy ID.
7. Only after print preparation succeeds does the existing client delivery finalizer mark the job delivered and continue its normal notification flow. Failures keep the upload counts, set the existing failed state, and include a `Try:` solution. Uploaded enhanced files do not need to be manually deleted to retry.

## Retry and safety

- The existing shared editor-work lock serializes print finalization across instances. It is released on normal completion/failure and expires after ten minutes if an invocation is terminated. No schema or RLS change is needed.
- Copies are identified by booking, selection, print category and copy number, plus the enhanced source/checksum. Retries reuse verified matching copies, including four separate wallet copies of one image.
- After a replacement print is verified, only obsolete system-generated copies for that exact print slot are moved to Google Drive Trash. This is recoverable and never targets originals, manually added files, other categories, or another client.
- Existing old-style RAW print category folders are not purged or migrated automatically. Existing selections with no saved print allocations retain their legacy delivery compatibility; partially saved allocation sets fail visibly.
- Missing/ambiguous files or an open selection cannot produce prints. A partial Drive failure leaves the manifest pending and the normal upload report failed, so staff cannot mistake it for a complete print set.
- This is an application upload finalizer, not a Drive watcher. Files manually dropped into Drive do not trigger it by themselves.

## Verification

```sh
pnpm test
pnpm typecheck
pnpm exec eslint lib/print-manifest.ts lib/print-workflow.ts lib/google-drive.ts lib/editor-workflow.ts lib/shoot-storage-cleanup-server.ts tests/print-workflow.test.ts tests/enhanced-print-copy.test.ts tests/security-boundaries.test.ts
pnpm build
pnpm security:check
```

All tests use synthetic files and mocked external services. No real client upload, Drive move, copy, trash operation, or email is needed to execute them. A signed-in staging/production smoke test is still required to verify real Google permissions and a completed client upload.
