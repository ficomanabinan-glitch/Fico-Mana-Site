-- Public booking submissions are rate-limited by a hashed client address.
-- Only the service role can call this function; raw addresses are never stored.
create table if not exists public.inquiry_rate_limits (
  ip_hash text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inquiry_rate_limits enable row level security;

revoke all on table public.inquiry_rate_limits from anon, authenticated;
grant all on table public.inquiry_rate_limits to service_role;

create or replace function public.consume_inquiry_rate_limit(
  p_ip_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  current_row public.inquiry_rate_limits%rowtype;
  safe_limit integer := greatest(p_limit, 1);
  safe_window_seconds integer := greatest(p_window_seconds, 1);
begin
  if p_ip_hash is null or btrim(p_ip_hash) = '' then
    raise exception 'p_ip_hash is required';
  end if;

  insert into public.inquiry_rate_limits (
    ip_hash,
    request_count,
    window_started_at,
    updated_at
  )
  values (p_ip_hash, 0, v_now, v_now)
  on conflict (ip_hash) do nothing;

  select *
    into current_row
    from public.inquiry_rate_limits
   where ip_hash = p_ip_hash
   for update;

  if current_row.window_started_at + make_interval(secs => safe_window_seconds) <= v_now then
    current_row.request_count := 0;
    current_row.window_started_at := v_now;
  end if;

  if current_row.request_count >= safe_limit then
    update public.inquiry_rate_limits
       set request_count = current_row.request_count,
           window_started_at = current_row.window_started_at,
           updated_at = v_now
     where ip_hash = p_ip_hash;

    return query
      select false,
             0,
             current_row.window_started_at + make_interval(secs => safe_window_seconds);
    return;
  end if;

  current_row.request_count := current_row.request_count + 1;

  update public.inquiry_rate_limits
     set request_count = current_row.request_count,
         window_started_at = current_row.window_started_at,
         updated_at = v_now
   where ip_hash = p_ip_hash;

  return query
    select true,
           greatest(safe_limit - current_row.request_count, 0),
           current_row.window_started_at + make_interval(secs => safe_window_seconds);
end;
$$;

revoke all on function public.consume_inquiry_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_inquiry_rate_limit(text, integer, integer) to service_role;

comment on table public.inquiry_rate_limits is
  'Hashed client-address counters used to rate-limit public booking submissions.';

comment on function public.consume_inquiry_rate_limit(text, integer, integer) is
  'Atomically consumes one request from a fixed rate-limit window and returns the remaining quota.';
