# Workspace payment destination — bounded regression plan

2 October 2026. The Client Workspace always labels its payment action “Review payment” and sends it to `/admin/verification?search=FM-...`. Verification intentionally lists only `Pending Verification` bookings. A confirmed/paid client such as the existing synthetic `FM-120001` therefore opens a zero-match queue, despite the workspace showing a verified deposit.

Goal: for a pending receipt, retain the contextual verification link; for a confirmed or other non-pending booking, offer contextual payment history in the booking details rather than a dead-end queue. Keep payment approval in Admin, with no new mutation or public information.

Before editing the UI, add a focused regression against the actual Workspace: confirmed booking must not offer “Review payment” into a pending-only queue; it must offer an accurate contextual payment action for the same FM reference. A pending verification fixture must still offer the exact verification route and preserve the FM reference. Run RED on the existing isolated optimized artifact, make the smallest component change, and run GREEN plus the relevant surrounding workflow tests. Neither test clicks approve or changes customer data.

The same finite evidence pass will inspect the Selection, Editing Batch, Portal Management and Files destination handling of their `search`/`batch`/`booking` parameters. Only an actual context-loss defect merits a code change. Search-count contrast at tablet width is an axe “background undetermined due overlap” incomplete, not a proven violation; inspect the rendered sheet and compute the effective contrast on its documented `#222222` surface before classifying it.
