-- Distributed fallback for admin-login throttling when Upstash is not configured.
-- This table and its RPCs are service-role only; browser roles cannot inspect or mutate counters.
create table if not exists public.admin_login_rate_limits (
  key_hash text primary key check (char_length(key_hash) = 64),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_login_rate_limits enable row level security;
revoke all on table public.admin_login_rate_limits from anon, authenticated;
grant all on table public.admin_login_rate_limits to service_role;

create or replace function public.check_admin_login_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(attempts integer, blocked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.admin_login_rate_limits%rowtype;
  remaining integer;
begin
  select * into r
  from public.admin_login_rate_limits
  where key_hash = p_key_hash;

  if not found or now() >= r.window_started_at + make_interval(secs => p_window_seconds) then
    return query select 0, false, 0;
    return;
  end if;

  remaining := greatest(
    1,
    ceil(extract(epoch from ((r.window_started_at + make_interval(secs => p_window_seconds)) - now())))::integer
  );

  return query select r.attempt_count, r.attempt_count >= p_limit, remaining;
end;
$$;

create or replace function public.record_admin_login_failure(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(attempts integer, blocked boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.admin_login_rate_limits%rowtype;
  remaining integer;
begin
  insert into public.admin_login_rate_limits as limits (
    key_hash,
    attempt_count,
    window_started_at,
    updated_at
  )
  values (p_key_hash, 1, now(), now())
  on conflict (key_hash) do update
  set
    attempt_count = case
      when now() >= limits.window_started_at + make_interval(secs => p_window_seconds) then 1
      else limits.attempt_count + 1
    end,
    window_started_at = case
      when now() >= limits.window_started_at + make_interval(secs => p_window_seconds) then now()
      else limits.window_started_at
    end,
    updated_at = now()
  returning * into r;

  remaining := greatest(
    1,
    ceil(extract(epoch from ((r.window_started_at + make_interval(secs => p_window_seconds)) - now())))::integer
  );

  return query select r.attempt_count, r.attempt_count >= p_limit, remaining;
end;
$$;

create or replace function public.clear_admin_login_rate_limit(p_key_hash text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.admin_login_rate_limits where key_hash = p_key_hash;
$$;

revoke all on function public.check_admin_login_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.record_admin_login_failure(text, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_admin_login_rate_limit(text) from public, anon, authenticated;

grant execute on function public.check_admin_login_rate_limit(text, integer, integer) to service_role;
grant execute on function public.record_admin_login_failure(text, integer, integer) to service_role;
grant execute on function public.clear_admin_login_rate_limit(text) to service_role;
