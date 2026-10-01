import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrations = [
  'supabase/migrations/20260920113000_portal_original_download_access.sql',
  'supabase/migrations/20260921041745_private_cloudflare_downloads.sql',
  'supabase/migrations/20260923030814_retry_interrupted_portal_downloads.sql',
  'supabase/migrations/20260923061614_enforce_weekly_portal_download_slots.sql',
  'supabase/migrations/20260929091741_allow_requests_for_reserved_download_slots.sql',
  'supabase/migrations/20261001031500_recover_interrupted_download_requests.sql',
]

test('two reserved download slots can request staff access before worker completion', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create schema if not exists auth;
      create role anon; create role authenticated; create role service_role;
      create table public.workspaces(id uuid primary key,slug text not null,status text not null);
      create table public.bookings(id varchar primary key,workspace_id uuid not null references public.workspaces(id),customer_name text,package_name text,booking_date date);
      create table public.client_portals(id uuid primary key,workspace_id uuid not null references public.workspaces(id),booking_id varchar not null references public.bookings(id),public_id uuid not null,status text not null,expires_at timestamptz);
      create table public.photo_selections(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,booking_id varchar not null,status text not null);
      create table public.workflow_audit_logs(id bigint generated always as identity primary key,workspace_id uuid,actor_type text,actor_id text,action text,booking_id varchar,metadata jsonb);
    `)
    for (const migration of migrations) {
      await db.exec(await readFile(migration, 'utf8'))
    }
    const workspace = '11111111-1111-4111-8111-111111111111'
    const portal = '22222222-2222-4222-8222-222222222222'
    const publicId = '33333333-3333-4333-8333-333333333333'
    await db.query(`insert into workspaces values($1,'fico-mana','active')`, [workspace])
    await db.query(`insert into bookings values('FM-1',$1,'Client One','MANA','2026-09-29')`, [workspace])
    await db.query(`insert into client_portals values($1,$2,'FM-1',$3,'active',now()+interval '30 days')`, [portal, workspace, publicId])
    await db.query(`insert into photo_selections(workspace_id,booking_id,status) values($1,'FM-1','SUBMITTED')`, [workspace])

    await assert.rejects(
      db.query(`select request_portal_raw_download($1,$2,'Need another copy')`, [workspace, publicId]),
      /Download access is still available/,
    )
    await db.query(`select begin_portal_raw_download($1,$2)`, [workspace, publicId])
    await db.query(`select begin_portal_raw_download($1,$2)`, [workspace, publicId])
    const state = await db.query<{ value: { allowed: boolean; completedInWindow: number; activeDownloads: number } }>(
      `select portal_raw_download_state($1,$2) value`, [workspace, publicId],
    )
    assert.equal(state.rows[0].value.allowed, false)
    assert.equal(state.rows[0].value.completedInWindow, 0)
    assert.equal(state.rows[0].value.activeDownloads, 2)

    const request = await db.query<{ value: { id: string; status: string } }>(
      `select request_portal_raw_download($1,$2,'Previous transfers were interrupted') value`, [workspace, publicId],
    )
    assert.equal(request.rows[0].value.status, 'PENDING')
    const queue = await db.query<{ reason: string }>(`select reason from portal_raw_download_requests where id=$1`, [request.rows[0].value.id])
    assert.equal(queue.rows[0].reason, 'Previous transfers were interrupted')
    const repeated = await db.query<{ value: { id: string; status: string } }>(
      `select request_portal_raw_download($1,$2,'Another request') value`, [workspace, publicId],
    )
    assert.equal(repeated.rows[0].value.id, request.rows[0].value.id)
    assert.equal(repeated.rows[0].value.status, 'PENDING')
    const actor = '44444444-4444-4444-8444-444444444444'
    await db.query(`select grant_portal_raw_download($1,$2,$3)`, [workspace, request.rows[0].value.id, actor])
    const alreadyGranted = await db.query<{ value: { status: string } }>(
      `select request_portal_raw_download($1,$2,'Another request') value`, [workspace, publicId],
    )
    assert.equal(alreadyGranted.rows[0].value.status, 'GRANTED')
    const grantedAttempt = await db.query<{ id: string }>(`select begin_portal_raw_download($1,$2)->>'attemptId' id`, [workspace, publicId])
    const manifestId = '55555555-5555-4555-8555-555555555555'
    const tokenHash = 'a'.repeat(64)
    await db.query(`insert into private_download_manifests(id,workspace_id,portal_id,raw_attempt_id,kind,token_hash,file_name,entries)
      values($1,$2,$3,$4,'PORTAL_ORIGINALS',$5,'Client One - FM-1 - Originals.zip','[{"name":"photo.jpg","key":"synthetic/photo.jpg","size":10}]')`,
    [manifestId, workspace, portal, grantedAttempt.rows[0].id, tokenHash])
    const retried = await db.query<{ value: { id: string; status: string } }>(
      `select request_portal_raw_download($1,$2,'Granted transfer was interrupted') value`, [workspace, publicId],
    )
    assert.equal(retried.rows[0].value.id, request.rows[0].value.id)
    assert.equal(retried.rows[0].value.status, 'PENDING')
    const attempt = await db.query<{ status: string }>(`select status from portal_raw_download_attempts where id=$1`, [grantedAttempt.rows[0].id])
    assert.equal(attempt.rows[0].status, 'FAILED')
    const manifest = await db.query<{ status: string }>(`select status from private_download_manifests where id=$1`, [manifestId])
    assert.equal(manifest.rows[0].status, 'FAILED')
    await assert.rejects(db.query(`select resolve_private_download_manifest($1,$2)`, [manifestId, tokenHash]), /Download link is unavailable/)
    const visible = await db.query<{ reason: string }>(`select reason from portal_raw_download_requests where portal_id=$1 and status='PENDING'`, [portal])
    assert.equal(visible.rows.length, 1)
    assert.equal(visible.rows[0].reason, 'Granted transfer was interrupted')
    const metadata = await db.query<{ granted_at: string | null; granted_by: string | null }>(`select granted_at,granted_by from portal_raw_download_requests where id=$1`, [request.rows[0].value.id])
    assert.equal(metadata.rows[0].granted_at, null)
    assert.equal(metadata.rows[0].granted_by, null)
    // A late completion from the abandoned transfer cannot consume the new request.
    await db.query(`select finish_portal_raw_download($1,true)`, [grantedAttempt.rows[0].id])
    const lateManifest = await db.query<{ result: boolean }>(`select complete_private_download_manifest($1,$2,true) result`, [manifestId, tokenHash])
    assert.equal(lateManifest.rows[0].result, false)
    const afterLateCompletion = await db.query<{ status: string }>(`select status from portal_raw_download_requests where id=$1`, [request.rows[0].value.id])
    assert.equal(afterLateCompletion.rows[0].status, 'PENDING')
    await db.query(`select grant_portal_raw_download($1,$2,$3)`, [workspace, request.rows[0].value.id, actor])
    const replacement = await db.query<{ id: string }>(`select begin_portal_raw_download($1,$2)->>'attemptId' id`, [workspace, publicId])
    assert.notEqual(replacement.rows[0].id, grantedAttempt.rows[0].id)
    await db.query(`select finish_portal_raw_download($1,true)`, [replacement.rows[0].id])
    const completed = await db.query<{ status: string }>(`select status from portal_raw_download_requests where id=$1`, [request.rows[0].value.id])
    assert.equal(completed.rows[0].status, 'CONSUMED')
    await assert.rejects(db.query(`select begin_portal_raw_download($1,$2)`, [workspace, publicId]), /DOWNLOAD_LIMIT_REACHED/)

    const secondRequest = await db.query<{ value: { id: string; status: string } }>(
      `select request_portal_raw_download($1,$2,'Need another copy later') value`, [workspace, publicId],
    )
    assert.notEqual(secondRequest.rows[0].value.id, request.rows[0].value.id)
    assert.equal(secondRequest.rows[0].value.status, 'PENDING')
    await assert.rejects(db.query(`select request_portal_raw_download($1,$2,'tiny')`, [workspace, publicId]), /A reason between 5 and 500/)
    await assert.rejects(db.query(`select request_portal_raw_download($1,$2,$3)`, [workspace, publicId, 'a'.repeat(501)]), /A reason between 5 and 500/)
    await assert.rejects(db.query(`select request_portal_raw_download($1,$2,'Wrong workspace')`, [actor, publicId]), /Portal is unavailable/)
    await assert.rejects(db.query(`select grant_portal_raw_download($1,$2,$3)`, [actor, secondRequest.rows[0].value.id, actor]), /Download request not found/)
    await db.query(`update client_portals set expires_at=now()-interval '1 minute' where id=$1`, [portal])
    await assert.rejects(db.query(`select request_portal_raw_download($1,$2,'Expired access')`, [workspace, publicId]), /Portal is unavailable/)
    await db.query(`update client_portals set expires_at=now()+interval '30 days' where id=$1`, [portal])
    await db.exec(`set role anon`)
    await assert.rejects(db.query(`select request_portal_raw_download($1,$2,'Direct client call')`, [workspace, publicId]), /permission denied/)
    await db.exec(`reset role`)

    // Replacing this function is reversible without touching saved requests.
    // Restore the preceding migration, prove its old behavior, then reapply.
    await db.exec(await readFile('supabase/migrations/20260929091741_allow_requests_for_reserved_download_slots.sql', 'utf8'))
    await assert.rejects(db.query(`select request_portal_raw_download($1,$2,'Duplicate after rollback')`, [workspace, publicId]), /already waiting/)
    await db.exec(await readFile('supabase/migrations/20261001031500_recover_interrupted_download_requests.sql', 'utf8'))
    const restored = await db.query<{ value: { id: string; status: string } }>(
      `select request_portal_raw_download($1,$2,'Duplicate after reapply') value`, [workspace, publicId],
    )
    assert.equal(restored.rows[0].value.id, secondRequest.rows[0].value.id)
    assert.equal(restored.rows[0].value.status, 'PENDING')
    const audit = await db.query<{ count: number }>(`select count(*)::int count from workflow_audit_logs where action='RAW_DOWNLOAD_ACCESS_REQUESTED'`)
    assert.equal(audit.rows[0].count, 3)
  } finally {
    await db.close()
  }
})
