import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationPath = 'supabase/migrations/20260921054332_change_raw_retention_to_7_days_after_portal_expiry.sql'
const workspace = '11111111-1111-4111-8111-111111111111'

test('RAW retention waits seven full days after portal expiry', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.workspaces (
      id uuid primary key,
      slug text not null,
      status text not null
    );
    create table public.bookings (
      id varchar primary key,
      workspace_id uuid not null references public.workspaces(id),
      customer_name text,
      booking_date date
    );
    create table public.storage_retention_settings (
      workspace_id uuid primary key references public.workspaces(id),
      retention_days integer not null default 60,
      updated_at timestamptz not null default clock_timestamp()
    );
    create table public.gallery_files (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id),
      booking_id varchar not null references public.bookings(id),
      file_size bigint,
      storage_key text not null,
      preview_reference text,
      thumbnail_reference text,
      storage_status text not null,
      storage_provider text not null,
      created_at timestamptz not null default clock_timestamp()
    );
    create table public.editing_jobs (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id),
      booking_id varchar not null references public.bookings(id),
      status text not null
    );
    create table public.client_portals (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id),
      booking_id varchar not null references public.bookings(id),
      status text not null,
      expires_at timestamptz
    );
    insert into public.workspaces values ('${workspace}', 'fico-mana', 'active');
    insert into public.storage_retention_settings(workspace_id) values ('${workspace}');
  `)
  await db.exec(await readFile(migrationPath, 'utf8'))

  const setting = await db.query<{ retention_days: number }>(
    `select retention_days from public.storage_retention_settings where workspace_id=$1`,
    [workspace],
  )
  assert.equal(setting.rows[0].retention_days, 7)
  await assert.rejects(
    db.query(`update public.storage_retention_settings set retention_days=0 where workspace_id=$1`, [workspace]),
    /storage_retention_settings_retention_days_check/,
  )

  async function seed(
    suffix: number,
    portalAge: string,
    options: { category?: 'raw' | 'enhanced'; jobStatus?: string; fileAge?: string } = {},
  ) {
    const booking = `FM-${suffix}`
    const hex = suffix.toString(16).padStart(12, '0')
    const category = options.category ?? 'raw'
    await db.query(`insert into public.bookings values($1,$2,$3,'2026-09-21')`, [booking, workspace, `Client ${suffix}`])
    await db.query(`insert into public.editing_jobs values($1,$2,$3,$4)`, [
      `20000000-0000-4000-8000-${hex}`, workspace, booking, options.jobStatus ?? 'DELIVERED',
    ])
    await db.query(`insert into public.client_portals values($1,$2,$3,'expired',clock_timestamp()-$4::interval)`, [
      `30000000-0000-4000-8000-${hex}`, workspace, booking, portalAge,
    ])
    await db.query(`insert into public.gallery_files values(
      $1,$2,$3,5000,$4,null,null,'available','r2',clock_timestamp()-$5::interval
    )`, [
      `40000000-0000-4000-8000-${hex}`,
      workspace,
      booking,
      `workspaces/${workspace}/shoots/2026/09/21/${booking}/${category}/photo.jpg`,
      options.fileAge ?? '30 days',
    ])
  }

  await seed(1, '8 days')
  await seed(2, '6 days', { fileAge: '365 days' })
  await seed(3, '8 days', { category: 'enhanced' })
  await seed(4, '8 days', { jobStatus: 'READY_FOR_EDITING' })

  const candidates = await db.query<{ booking_id: string; retention_days: number }>(
    `select booking_id,retention_days from public.private_expired_raw_cleanup_candidates($1) order by booking_id`,
    [workspace],
  )
  assert.deepEqual(candidates.rows, [{ booking_id: 'FM-1', retention_days: 7 }])
})
