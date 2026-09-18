import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  'supabase/migrations/20260918104500_restore_sales_finance_tables.sql',
  'utf8',
)

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.bookings(id varchar primary key);
  `)
  return db
}

test('sales migration restores the tables required by the Admin finance routes', async (t) => {
  const db = await fixture()
  t.after(() => db.close())

  await db.exec(migration)

  const tables = await db.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('sales_expenses', 'sales_settings')
    order by table_name
  `)
  assert.deepEqual(tables.rows.map((row) => row.table_name), ['sales_expenses', 'sales_settings'])

  const settings = await db.query<{ id: string; desired_profit_margin: string }>(`
    select id, desired_profit_margin from public.sales_settings
  `)
  assert.deepEqual(settings.rows, [{ id: 'default', desired_profit_margin: '0.00' }])

  const inserted = await db.query<{ id: string }>(`
    insert into public.sales_expenses (
      expense_type, name, category, amount, expense_date, recurrence
    ) values ('fixed', 'Studio rent', 'Operations', 1750, '2026-09-18', 'monthly')
    returning id
  `)
  assert.match(inserted.rows[0].id, /^[0-9a-f-]{36}$/)
})

test('sales tables reject invalid finance records and direct browser access', async (t) => {
  const db = await fixture()
  t.after(() => db.close())
  await db.exec(migration)

  await assert.rejects(
    db.exec(`insert into public.sales_expenses (
      expense_type, name, amount, expense_date, recurrence
    ) values ('variable', 'Invalid monthly cost', 100, '2026-09-18', 'monthly')`),
    /sales_expenses_monthly_fixed_only/,
  )
  await assert.rejects(
    db.exec(`update public.sales_settings set desired_profit_margin = 101 where id = 'default'`),
    /sales_settings_desired_profit_margin_check/,
  )

  const grants = await db.query<{ grantee: string }>(`
    select grantee
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('sales_expenses', 'sales_settings')
      and grantee in ('anon', 'authenticated')
  `)
  assert.deepEqual(grants.rows, [])
})
