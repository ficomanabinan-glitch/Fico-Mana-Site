alter table public.google_drive_settings
  add column if not exists account_email text null,
  add column if not exists refresh_token_encrypted text null,
  add column if not exists granted_scopes text null,
  add column if not exists connected_at timestamptz null,
  add column if not exists disconnected_at timestamptz null;