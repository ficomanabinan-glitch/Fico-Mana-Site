# FICO MANA release readiness — 18 September 2026

## Candidate decision

**GO for an isolated Vercel candidate deployment.**

**NO-GO for live client-data deletion until exact counts are presented and confirmed.**

## Required release sequence

- [x] Production build passes.
- [x] Full automated suite passes: 341/341.
- [x] Security, secret, and dependency checks pass.
- [x] Changed-file lint passes.
- [x] Desktop and mobile portal layouts are visually verified.
- [x] Isolated 100-user performance test passes.
- [x] Private-file regression coverage is present.
- [ ] Deploy an isolated Vercel production candidate without moving custom domains.
- [ ] Confirm the candidate reaches READY.
- [ ] Run protection-aware smoke checks on the candidate.
- [ ] Inspect candidate runtime logs for application errors and accidental storage redirects.
- [ ] Promote the exact validated artifact to the production domains.
- [ ] Re-run public, portal, admin, and editor smoke checks on production.
- [ ] Confirm the production File Management address remains on `editor.ficomana.com` while previewing a file.
- [ ] Confirm an unsigned/direct storage request does not expose a private object.
- [ ] Inventory client cleanup counts and request deletion confirmation.
- [ ] After confirmation only: remove client records and their owned R2 objects, preserving accounts and configuration.

## Rollback triggers

Rollback the release if any of the following is observed:

- Portal or File Management media redirects to a storage-host URL.
- A portal can download originals before selection submission.
- Admin/editor authentication or role checks regress.
- Booking creation, receipt upload, onsite upload, or portal submission returns a new 5xx response.
- Candidate logs show repeated unhandled exceptions, storage ownership failures, or database connection exhaustion.
- Production p95 materially exceeds 1.5 seconds during comparable non-media page traffic.
