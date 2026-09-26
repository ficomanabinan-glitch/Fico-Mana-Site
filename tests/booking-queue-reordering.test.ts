import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

type QueueRow = { id: string; client_priority: number | null }

async function queue(db: PGlite, date = '2026-09-27') {
  const result = await db.query<QueueRow>(`
    select id, client_priority from public.bookings
    where booking_date = $1 and booking_status not in ('Cancelled', 'Rejected')
    order by client_priority
  `, [date])
  return result.rows
}

test('booking queue migration shifts positions atomically and closes gaps', async (context) => {
  const db = new PGlite()
  context.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.bookings (
      id text primary key,
      booking_date date not null,
      booking_status text not null,
      booking_time text,
      created_at timestamptz not null default now()
    );
  `)
  const migration = await readFile(new URL('../supabase/migrations/20260926175842_booking_queue_reordering.sql', import.meta.url), 'utf8')
  await db.exec(migration)

  for (let index = 1; index <= 5; index += 1) {
    await db.query('insert into public.bookings (id, booking_date, booking_status, booking_time) values ($1, $2, $3, $4)', [
      `CLIENT-${index}`, '2026-09-27', 'Confirmed', `${String(8 + index).padStart(2, '0')}:00 AM`,
    ])
  }
  assert.deepEqual((await queue(db)).map((row) => [row.id, row.client_priority]), [
    ['CLIENT-1', 1], ['CLIENT-2', 2], ['CLIENT-3', 3], ['CLIENT-4', 4], ['CLIENT-5', 5],
  ])

  await db.query("select * from public.set_booking_client_priority('CLIENT-5', 3, 5, null)")
  assert.deepEqual((await queue(db)).map((row) => row.id), ['CLIENT-1', 'CLIENT-2', 'CLIENT-5', 'CLIENT-3', 'CLIENT-4'])

  await db.query("select * from public.set_booking_client_priority('CLIENT-2', 5, 2, null)")
  assert.deepEqual((await queue(db)).map((row) => row.id), ['CLIENT-1', 'CLIENT-5', 'CLIENT-3', 'CLIENT-4', 'CLIENT-2'])

  await db.query("update public.bookings set booking_status = 'Cancelled' where id = 'CLIENT-3'")
  assert.deepEqual((await queue(db)).map((row) => row.client_priority), [1, 2, 3, 4])

  await db.query("insert into public.bookings (id, booking_date, booking_status) values ('CLIENT-6', '2026-09-27', 'Confirmed')")
  const finalQueue = await queue(db)
  assert.equal(finalQueue.at(-1)?.id, 'CLIENT-6')
  assert.deepEqual(finalQueue.map((row) => row.client_priority), [1, 2, 3, 4, 5])

  await assert.rejects(
    db.query("select * from public.set_booking_client_priority('CLIENT-6', 1, 4, null)"),
    /queue changed/i,
  )
})
