# Onsite Upload actions — release notes

## Behavior

- Card action order: Upload Photos, Sync Drive, Delete Files. Separate Refresh Folder/Repair controls are removed from this card only; existing administrator APIs remain available.
- A healthy Sync verifies the current folders and reads Drive without recreating/relinking folders. Only missing/trashed folders, changed roots, or a verifiably stale parent/mapping invoke the existing hierarchy recovery. Permission, quota, and server errors do not trigger repair.
- Sync reconciles missing index records only after a complete authorized Drive listing. It does not delete Drive originals. Incomplete choices are reset when missing originals invalidate the gallery; locked selections/editing history are preserved with a warning instead.
- Delete Files requires confirmation for one booking. It moves current RAW uploads, pending app uploads, and system-generated selected copies/manifests to Drive Trash. It removes this booking's scoped preview objects, indexed gallery and incomplete selection/print/add-on choices. Booking/payment records, folders and edited deliverables remain unchanged.
- Submitted selections, editing/download history, active download locks, deliverables and batch upload records block this onsite reset. An administrator must review these clients rather than bypassing the safeguards.
- Missing originals are tolerated. Originals moved outside the registered folders are not trashed; their obsolete index records are cleared.
- Deletion is resumable and uses upload generations to reject previously issued upload grants and prevent old in-flight app files from returning through Sync. Files restored from Trash are not automatically restored to their previous index or choices; upload the correct photos again through the current workflow.
- Visible client portals check the photo revision every 30 seconds and on focus. During a reset, the old selection UI is removed; after completion, the gallery refreshes and choices use the new revision. Server checks block stale submissions immediately. No PIN, original URL or client record is broadcast or stored by this refresh mechanism.

## Required release order

1. Install `supabase/migrations/20260907170658_onsite_photo_reset.sql` on the intended Fico Mana project using its privileged migration/SQL workflow. The migration is additive and **does not clear any client data just by being installed**.
2. Verify the three new columns, the private reset table, and the service-only functions. A migration file in Git is not proof that it has been installed.
3. Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm security:check`, and `pnpm security:secrets`.
4. Publish the application through the existing Fico Mana GitHub/Vercel production integration. Do not deploy to a different team/project or publish the application before installing the migration.
5. Verify the card through an authenticated onsite-capable account. Confirm healthy Sync does not alter folder mappings. Use a separately authorized disposable booking for an end-to-end destructive test, never an active client booking.

Read-only setup verification:

```sql
select table_name, column_name
from information_schema.columns
where table_schema='public' and
  ((table_name='photo_selections' and column_name in ('raw_reset_id','raw_upload_generation'))
   or (table_name='gallery_files' and column_name='upload_generation'));

select p.oid::regprocedure as procedure,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as member_can_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('begin_onsite_photo_reset','finish_onsite_photo_reset',
   'record_onsite_photo_reset_progress','sync_onsite_photo_index');

select relrowsecurity from pg_class where oid='public.onsite_photo_resets'::regclass;
```

Expect three columns, four functions with public/member execution false and service execution true, and RLS true. Initial implementation/testing used synthetic data only.

Production preparation on 2026-09-08: the migration was installed through the authenticated SQL Editor for project `hrvyxxamxacosmbnkxwd` before publishing the application. Read-only verification confirmed all three columns, all four service-only functions, RLS enabled, and the gallery upload guard enabled. Counts remained unchanged: one booking, one payment, 22 gallery files and one photo selection. No reset was started and the upload generation remained zero. No client files were deleted or synced during release preparation.

## Verification

Tests use isolated in-memory PostgreSQL and mocked provider boundaries. They cover empty/missing originals, preservation of payments/other clients, locked editing, progress retry, generation rejection, incomplete sync refusal, healthy/no-repair behavior, scoped destructive API calls, confirmation/button handlers, and portal background refresh. Desktop/mobile visual checks use the real component and stylesheet with synthetic records; they do not upload or delete production files.

Operational limit: one reset is bounded to 5,000 targets and advances 10 targets per request. Existing rate limits may pause a large reset; saved progress can be resumed when the quota permits. A moved/changed file during deletion stops that target for administrator review rather than silently deleting changed content.
