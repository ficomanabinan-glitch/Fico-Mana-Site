-- Restore the server-only sales finance tables required by the Admin console.
-- This is additive and preserves every existing booking and expense record.

begin;

create table if not exists public.sales_settings (
  id text primary key,
  monthly_revenue_target numeric(12, 2) not null default 0
    check (monthly_revenue_target >= 0),
  desired_monthly_profit numeric(12, 2) not null default 0
    check (desired_monthly_profit >= 0),
  desired_profit_margin numeric(5, 2) not null default 0
    check (desired_profit_margin between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.sales_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_type text not null check (expense_type in ('fixed', 'variable')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text not null default 'Other'
    check (char_length(btrim(category)) between 1 and 100),
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null,
  recurrence text not null default 'one_time'
    check (recurrence in ('one_time', 'monthly')),
  start_date date,
  end_date date,
  booking_id varchar references public.bookings(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_expenses_date_range_valid
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint sales_expenses_monthly_fixed_only
    check (recurrence <> 'monthly' or expense_type = 'fixed')
);

create index if not exists sales_expenses_expense_date_idx
  on public.sales_expenses (expense_date desc, created_at desc);
create index if not exists sales_expenses_active_idx
  on public.sales_expenses (is_active, expense_date desc)
  where is_active;
create index if not exists sales_expenses_booking_id_idx
  on public.sales_expenses (booking_id)
  where booking_id is not null;

insert into public.sales_settings (
  id,
  monthly_revenue_target,
  desired_monthly_profit,
  desired_profit_margin
)
values ('default', 0, 0, 0)
on conflict (id) do nothing;

alter table public.sales_settings enable row level security;
alter table public.sales_expenses enable row level security;

revoke all on table public.sales_settings from public, anon, authenticated;
revoke all on table public.sales_expenses from public, anon, authenticated;
grant all on table public.sales_settings to service_role;
grant all on table public.sales_expenses to service_role;

comment on table public.sales_settings is
  'Server-managed targets used by the Admin sales summary.';
comment on table public.sales_expenses is
  'Server-managed fixed and variable business expenses used by financial reporting.';

commit;
