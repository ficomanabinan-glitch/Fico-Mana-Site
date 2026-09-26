begin;

create table if not exists public.website_content_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  studio_name text not null default 'FICO MANA',
  phone_number text not null default '+63 49 576 5176',
  public_email text not null default '',
  address_line_1 text not null default 'Cabuyao Retail Plaza',
  address_line_2 text not null default '4025 Cabuyao, Laguna',
  map_embed_url text not null default 'https://maps.google.com/maps?q=Cabuyao%20Retail%20Plaza,%20Laguna&t=&z=14&ie=UTF8&iwloc=&output=embed',
  map_directions_url text not null default 'https://maps.google.com/?q=Cabuyao+Retail+Plaza+Laguna',
  facebook_url text not null default 'https://www.facebook.com/FICOMANA',
  instagram_url text not null default 'https://www.instagram.com/ficomanastudio/',
  tiktok_url text not null default 'https://www.tiktok.com/@ficomanastudio',
  business_hours text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint website_content_studio_name_length check (char_length(studio_name) between 1 and 80),
  constraint website_content_phone_length check (char_length(phone_number) between 7 and 40),
  constraint website_content_address_length check (
    char_length(address_line_1) between 1 and 160 and char_length(address_line_2) <= 160
  )
);

insert into public.website_content_settings (workspace_id)
select id from public.workspaces where slug = 'fico-mana'
on conflict (workspace_id) do nothing;

create or replace function public.set_website_content_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists website_content_set_updated_at on public.website_content_settings;
create trigger website_content_set_updated_at
before update on public.website_content_settings
for each row execute function public.set_website_content_updated_at();

alter table public.website_content_settings enable row level security;
revoke all on table public.website_content_settings from public, anon, authenticated;
grant all on table public.website_content_settings to service_role;
revoke all on function public.set_website_content_updated_at() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
