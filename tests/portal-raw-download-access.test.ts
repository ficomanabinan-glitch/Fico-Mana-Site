import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const migrationPath = 'supabase/migrations/20260920113000_portal_original_download_access.sql'
const lifetimeMigrationPath = 'supabase/migrations/20260921041745_private_cloudflare_downloads.sql'

test('original downloads use a two-completion portal-lifetime policy', async () => {
  const [migration, policy] = await Promise.all([readFile(lifetimeMigrationPath, 'utf8'), readFile('lib/portal-raw-downloads.ts', 'utf8')])
  assert.match(policy, /PORTAL_RAW_DOWNLOAD_LIMIT = 2/)
  assert.doesNotMatch(migration, /completed_at > clock_timestamp\(\) - interval '7 days'/i)
  assert.match(migration, /completed_count \+ active_count < 2/i)
  assert.match(migration, /status='COMPLETED'/i)
  assert.match(migration, /interval '6 hours'/i)
})

test('download requests require a readable reason and remain duplicate-safe', async () => {
  const [migration, policy] = await Promise.all([readFile(migrationPath, 'utf8'), readFile('lib/portal-raw-downloads.ts', 'utf8')])
  assert.match(policy, /PORTAL_RAW_DOWNLOAD_REASON_MIN = 5/)
  assert.match(policy, /PORTAL_RAW_DOWNLOAD_REASON_MAX = 500/)
  assert.match(migration, /char_length\(btrim\(reason\)\) between 5 and 500/i)
  assert.match(migration, /where status in \('PENDING','GRANTED','RESERVED'\)/i)
  assert.match(migration, /exception when unique_violation/i)
})

test('a staff grant is one-time, workspace-scoped, and audited', async () => {
  const migration = await readFile(migrationPath, 'utf8')
  assert.match(migration, /where id=p_request and workspace_id=p_workspace for update/i)
  assert.match(migration, /if request_row\.status <> 'PENDING'/i)
  assert.match(migration, /RAW_DOWNLOAD_ACCESS_GRANTED/)
  assert.match(migration, /set status=case when p_success then 'CONSUMED' else 'GRANTED'/i)
  assert.match(migration, /revoke all on function public\.grant_portal_raw_download[\s\S]*from public, anon, authenticated/i)
})

test('portal and editor surfaces expose the request and grant workflow', async () => {
  const [portal, panel, dashboard, route, worker] = await Promise.all([
    readFile('components/portal-original-download.tsx', 'utf8'),
    readFile('components/download-requests-panel.tsx', 'utf8'),
    readFile('components/filtering-dashboard.tsx', 'utf8'),
    readFile('app/api/editor-workflow/[...path]/route.ts', 'utf8'),
    readFile('workers/private-downloads/src/index.js', 'utf8'),
  ])
  assert.match(portal, /Request another download access/)
  assert.match(portal, /Tell the studio why you need another download/)
  assert.match(panel, /Client reason/)
  assert.match(panel, /Grant access/)
  assert.match(dashboard, /Download Requests/)
  assert.match(route, /raw-download-request/)
  assert.match(route, /createPortalDownloadRedirect/)
  assert.match(worker, /complete_private_download_manifest/)
})

test('database policy completes two downloads, queues a reason, and consumes one staff grant', async () => {
  const db = new PGlite()
  await db.exec(`
    create schema if not exists auth;
    create role anon; create role authenticated; create role service_role;
    create table public.workspaces(id uuid primary key,slug text not null,status text not null);
    create table public.bookings(id varchar primary key,workspace_id uuid not null references public.workspaces(id),customer_name text,package_name text,booking_date date);
    create table public.client_portals(id uuid primary key,workspace_id uuid not null references public.workspaces(id),booking_id varchar not null references public.bookings(id),public_id uuid not null,status text not null,expires_at timestamptz);
    create table public.photo_selections(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,booking_id varchar not null,status text not null);
    create table public.workflow_audit_logs(id bigint generated always as identity primary key,workspace_id uuid,actor_type text,actor_id text,action text,booking_id varchar,metadata jsonb);
  `)
  await db.exec(await readFile(migrationPath, 'utf8'))
  await db.exec(await readFile(lifetimeMigrationPath, 'utf8'))
  const workspace = '11111111-1111-4111-8111-111111111111'
  const portal = '22222222-2222-4222-8222-222222222222'
  const publicId = '33333333-3333-4333-8333-333333333333'
  const actor = '44444444-4444-4444-8444-444444444444'
  await db.query(`insert into workspaces values($1,'fico-mana','active')`, [workspace])
  await db.query(`insert into bookings values('FM-1',$1,'Client One','MANA','2026-09-20')`, [workspace])
  await db.query(`insert into client_portals values($1,$2,'FM-1',$3,'active',now()+interval '30 days')`, [portal, workspace, publicId])
  await db.query(`insert into photo_selections(workspace_id,booking_id,status) values($1,'FM-1','SUBMITTED')`, [workspace])

  for (let count = 0; count < 2; count++) {
    const started = await db.query<{ result: { attemptId: string } }>(`select begin_portal_raw_download($1,$2) result`, [workspace, publicId])
    await db.query(`select finish_portal_raw_download($1,true)`, [started.rows[0].result.attemptId])
  }
  const limited = await db.query<{ state: { allowed: boolean; completedInWindow: number } }>(`select portal_raw_download_state($1,$2) state`, [workspace, publicId])
  assert.deepEqual(limited.rows[0].state, { ...limited.rows[0].state, allowed: false, completedInWindow: 2, activeDownloads: 0 })
  const requested = await db.query<{ result: { id: string; status: string } }>(`select request_portal_raw_download($1,$2,'Need a replacement backup copy') result`, [workspace, publicId])
  assert.equal(requested.rows[0].result.status, 'PENDING')
  await db.query(`select grant_portal_raw_download($1,$2,$3)`, [workspace, requested.rows[0].result.id, actor])
  const granted = await db.query<{ state: { allowed: boolean; requestStatus: string } }>(`select portal_raw_download_state($1,$2) state`, [workspace, publicId])
  assert.equal(granted.rows[0].state.allowed, true)
  assert.equal(granted.rows[0].state.requestStatus, 'GRANTED')
  const extra = await db.query<{ result: { attemptId: string } }>(`select begin_portal_raw_download($1,$2) result`, [workspace, publicId])
  await db.query(`select finish_portal_raw_download($1,true)`, [extra.rows[0].result.attemptId])
  const consumed = await db.query<{ status: string }>(`select status from portal_raw_download_requests where id=$1`, [requested.rows[0].result.id])
  assert.equal(consumed.rows[0].status, 'CONSUMED')
  const blocked = await db.query<{ state: { allowed: boolean } }>(`select portal_raw_download_state($1,$2) state`, [workspace, publicId])
  assert.equal(blocked.rows[0].state.allowed, false)

  const secondRequest = await db.query<{ result: { id: string } }>(`select request_portal_raw_download($1,$2,'Lost the first copy on my device') result`, [workspace, publicId])
  await db.query(`select grant_portal_raw_download($1,$2,$3)`, [workspace, secondRequest.rows[0].result.id, actor])
  const interrupted = await db.query<{ result: { attemptId: string } }>(`select begin_portal_raw_download($1,$2) result`, [workspace, publicId])
  await db.query(`select finish_portal_raw_download($1,false)`, [interrupted.rows[0].result.attemptId])
  const restored = await db.query<{ state: { allowed: boolean; requestStatus: string } }>(`select portal_raw_download_state($1,$2) state`, [workspace, publicId])
  assert.equal(restored.rows[0].state.allowed, true)
  assert.equal(restored.rows[0].state.requestStatus, 'GRANTED')
  await db.close()
})
