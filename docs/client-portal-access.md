# Client portal access and final submission

The unique `/portal/<public UUID>` link can be opened on any device without a staff login, signature query, or remembered-browser cookie. Existing signed links and QR codes remain usable. Treat this URL as a private viewing link: anyone who receives it can see that booking's permitted gallery, payment summary, shared resources, and deliverables.

## Final submission

- After Review, Submit Final Selection opens a final confirmation with package cost, current add-ons, paid amount, total and remaining balance. The last-four-digit PIN is at the end, just above Confirm & Submit. Opening or dismissing this confirmation never submits or clears photo choices.
- The summary/QR sidebar stays sticky on desktop. On mobile a bottom bar shows the live remaining balance and opens the same summary and QR in a scrollable panel. Short screens and phone safe areas are supported.
- The server reads `bookings.customer_phone` within the portal's workspace and booking. It never accepts a phone number from the submission.
- Formatting is removed; leading zeros in the PIN are preserved. A missing/invalid saved phone stops submission and directs the client to contact the studio.
- Verification happens before selection locking, charges, print manifests or Drive copies.
- The PIN is sent only in the same-origin POST body. It is not returned in portal data, included in QR codes, saved with the 15-minute draft, or written to audit events.
- Five PIN submission attempts are allowed per IP address per 15-minute window. Devices and portal links on the same public IP share that quota; different IPs have separate quotas. There is no portal-wide PIN lockout. The existing general submission limit also remains. Production submission fails closed if the limiter is unavailable.
- Wrong PINs show a correction message, preserve photo choices, and clear the PIN field.

## View All Photos

After a successful final submission with the PIN, **View All Photos** opens that booking's current RAW folder in a new Google Drive tab. It does not download files, build an archive, or change originals. The existing edited-deliverables downloads are unchanged.

The link is held only in page memory. When returning to an already-submitted portal in a new visit, the button asks for the saved-phone PIN again using `POST /api/editor-workflow/portal/<public UUID>/drive-photos`. This read-only lookup cannot submit selections, charge add-ons, or modify Drive permissions. Both PIN endpoints share the same IP-only five-attempt budget. URLs and phone/PIN values are never saved in the photo draft.

The server checks the live portal, scoped booking, current storage root, unique CLIENT/RAW mapping, and the RAW folder's actual parent/type/Trash status before returning a URL constructed on `https://drive.google.com/drive/folders/`. Stored web links and client-supplied folder IDs are not trusted. A link lookup failure after final submission returns a warning without turning a saved selection into a failed submission.

Google Drive's sharing rules still apply. The studio must share the RAW folder with the intended client's Google account; no folder is automatically made public. Once a Drive URL has been revealed, portal expiry does not revoke existing Google Drive permissions or make that URL expire. Access must also be removed in Drive if needed. Do not claim that a portal PIN replaces Google's access checks.

## Boundaries retained

Each gallery, file and download request still verifies that the portal exists, is active, has not expired, and belongs to the correct workspace/booking. Cross-client file requests remain blocked. Photo validators still recheck live access before returning 304. API/HTML responses remain private/no-store; image bytes remain private and revalidated. Portal responses prohibit indexing and referrers; there is no public portal-directory endpoint.

The four-digit phone suffix is a lightweight confirmation check, not a strong secret or proof of phone ownership. Someone with both the private URL and the booking phone number can submit. No database migration, new PIN column, separate PIN provisioning or new external service is needed.

## Verification

Run the existing package scripts: `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm security:check`.

Additional coverage includes cookie-free reads, legacy URLs, schema bypasses, missing/wrong/leading-zero PINs, phone changes, no mutations on failed checks, shared same-IP limits, independent different-IP limits, limiter outages, and PIN exclusion from draft storage.

After deployment, open a known active portal in a fresh browser/private window. Check gallery and preview access, then test wrong/correct PINs only on an explicitly authorized test booking. Do not submit a real client's selection merely to test the release.
