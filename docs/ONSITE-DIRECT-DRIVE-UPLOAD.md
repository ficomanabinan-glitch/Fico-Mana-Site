# Onsite originals upload directly to Google Drive

The old Onsite Upload button posted an entire file to a Vercel-hosted route. Although that route accepted 100 MiB, Vercel rejects request bodies above 4.5 MB before the application code runs. Raising a Next.js body-size setting cannot remove that upstream limit.

The new path is **browser -> Google Drive** for the image upload. There is no Vercel Blob dependency, account, key, bucket or billing step. Originals are not compressed, converted or replaced.

## Requests

- `POST /api/editor-workflow/raw/:bookingId/upload-session`: small JSON `{fileName,fileSize,checksum}`. The server authorizes staff and the graduation booking, resolves its existing Drive mapping, and creates a Drive resumable upload capability. The response includes a one-hour, staff/workspace/booking-bound signed confirmation grant. Tokens and resumable URLs remain in browser memory only.
- The browser PUTs 4 MiB chunks directly to the exact `https://www.googleapis.com/upload/drive/v3/` endpoint. It follows acknowledged `Range` offsets, queries the session after interrupted transfers, and retries transient failures with bounded backoff. App cookies and Google access/refresh tokens are not sent by browser code.
- `POST /api/editor-workflow/raw/:bookingId/complete-file`: small JSON `{grant,driveFileId}`. The server verifies the current booking and folder, original name/size/SHA-256, actual file signatures and the existing optional malware scanner. It then registers the photo using the existing gallery table and reports success.

The 100 MiB application limit remains in force. This removes the Vercel transport bottleneck; it does not remove all upload quotas or Google Drive storage limits.

## Preserved security and recovery

- Both routes use the existing workflow authentication, role checks, administrator MFA rules, origin validation, rate limiter and private/no-store responses. The same staff/workspace raw-upload rate bucket covers session and confirmation requests across clients.
- Files first arrive in `_UPLOADS` inside the client's RAW folder **in Google Drive**. Pending files are excluded from portal indexing, including if they are manually moved to the RAW root. Only a verified new upload is promoted to RAW. No pre-existing original is overwritten or deleted.
- Failed confirmation retries reuse the uploaded Drive file instead of uploading it again. Completed matching uploads can also be rediscovered after a refresh by their server-generated upload key. Interrupted sessions may be retried while the page remains open; discarded/expired sessions start again.
- The current private thumbnail bucket is reused for small JPEG preview derivatives where supported. This does not change the original's bytes or destination. Camera RAW formats can use Google's thumbnails. No Vercel Blob storage is introduced.
- The old multipart route remains available for compatibility. The Onsite Upload component now calls the new direct-upload client. The Upload Photos and Retry Failed controls remain in place, with a verification label and separated failure/solution paragraphs.
- Authentication, tables, policies, Google credentials, package rules, and the existing editing/printing pipeline are not migrated. Existing `SECURITY_HASH_SECRET` signs grants using a distinct `onsite-raw-upload:v1` domain. No new environment variable is required.

## Validation and deployment

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm security:check
pnpm security:http
```

Tests exercise 10 MiB and 50 MiB browser uploads without passing photo bytes to application requests, partial acknowledgments, interrupted connections, expired sessions, confirmation retries, signed grants, foreign clients, signature/size/checksum failures, scanner failures, previews and private HTTP auth/origin responses. They use synthetic data, not a client's files. The 50 MiB test reconstructs every accepted chunk and compares its final SHA-256 with the original; the server also separately verifies and indexes the full-size synthetic CR3 fixture. See [50 MiB simulation results](ONSITE-50MB-SIMULATION.md).

After deployment, refresh the onsite page so it loads the new upload client. Test a supported original larger than 4.5 MB, confirm progress and the final uploaded count, then confirm the original exists in the mapped RAW folder and its gallery preview loads. This real signed-in Google/browser smoke test has not been completed by the local automated tests.

References: [Vercel request-size limit and direct-storage guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions), [Google Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
