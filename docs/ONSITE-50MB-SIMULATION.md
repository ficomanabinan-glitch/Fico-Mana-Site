# 50 MiB onsite RAW upload simulation

Status: passed locally. No real Google Drive file, client record or photo was created or modified.

## Fixture and results

- Filename: `PRO_CAMERA_50MB.CR3`.
- Size: **52,428,800 bytes (50 MiB, approximately 52.43 decimal MB)**.
- Fixture: synthetic bytes with a CR3 file signature, not an actual decodable camera photograph.
- Browser transfer: the real direct-upload client executed against a simulated Google endpoint, with chunks bounded to 4 MiB.
- The receiver first acknowledged only 256 KiB of an attempted chunk. The client resumed from the acknowledged position rather than skipping unsaved bytes.
- The receiver then accepted 2 MiB of another chunk before simulating a dropped connection. The client queried the session and resumed after the final confirmed byte.
- Results: **14 data requests, 1 resume query, 1 upload session**. The reconstructed receiver buffer contained the entire original, with identical SHA-256.
- The first portal confirmation intentionally returned HTTP 503. Retry reused the completed Drive file ID and made no additional image PUTs or upload-session requests.
- Application requests contained small JSON only. The largest in this isolated transport fixture was 132 bytes; this fixture uses a placeholder grant. Real signed grants are larger but are still restricted by the application's 8,000-byte metadata request bound.
- The server completion test separately processed the full 50 MiB buffer through signed permission validation, booking/folder checks, SHA-256, RAW-signature validation, the scanner boundary, promotion and gallery registration. Filename, size and checksum were retained; no RAW conversion or compression occurred.

## Run again

```sh
node --test tests/raw-upload-50mb.test.ts tests/raw-upload-server.test.ts
```

The tests do not establish real network throughput, Google-account quota/permissions, browser CORS behavior, or a real camera file's preview compatibility. Those require deployment and a signed-in smoke test with an actual camera RAW file. The application maximum remains 100 MiB per file.
