begin;

alter table public.website_content_settings
  add column if not exists website_copy jsonb not null default '{}'::jsonb;

alter table public.website_content_settings
  add constraint website_content_copy_object check (
    jsonb_typeof(website_copy) = 'object' and octet_length(website_copy::text) <= 250000
  );

-- Preserve contact details, policies, and all existing rows. Empty copy uses
-- the current published wording until an administrator publishes a change.
alter table public.website_content_settings enable row level security;
revoke all on table public.website_content_settings from public, anon, authenticated;
grant all on table public.website_content_settings to service_role;
notify pgrst, 'reload schema';
commit;
