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
    await assert.rejects(
      db.query(`select request_portal_raw_download($1,$2,'Another request')`, [workspace, publicId]),
      /already waiting/,
    )
  } finally {
    await db.close()
  }
})
