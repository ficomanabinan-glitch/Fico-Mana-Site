# Onsite file picker did not start uploading

The handler reset the file input before copying its FileList. A live FileList
can become empty on that reset, causing the subsequent length check to skip the
upload completely. The fix snapshots File objects before clearing the picker,
retaining same-file retry behavior and the original selected booking ID.

Uploads still use the existing authenticated RAW endpoint and client-folder
mapping. No original photo is resized or changed. Upload progress and retry-only-
failed controls remain in place. Network errors, cancellation and a two-minute
timeout now provide a visible explanation; the last error is retained in the
existing failed-upload panel rather than discarded.

An HTTP 413 has a specific workaround: upload the original to the client's RAW
folder directly in Google Drive, then use Sync Drive. This does not claim that
the current multipart route can bypass the production host's body-size limit.
Replacing that transfer architecture is outside this focused picker fix.

`node --test tests/onsite-upload-selection.test.ts` checks a live FileList that
empties when the input is reset, cancelled selection, selecting the same files
again, the actual XHR target/FormData, progress, success, 413, access/server errors,
network failure, cancellation and timeout using synthetic files only.

No file was uploaded to any real client folder during testing. Authenticated
browser verification remains pending while the browser connection is unavailable.
