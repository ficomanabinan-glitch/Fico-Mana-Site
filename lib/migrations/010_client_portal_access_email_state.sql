alter table public.client_portals
  add column if not exists access_email_sent_at timestamptz null;

create index if not exists client_portals_access_email_pending_idx
  on public.client_portals(booking_id)
  where access_email_sent_at is null;