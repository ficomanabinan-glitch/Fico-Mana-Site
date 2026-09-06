begin;

create table if not exists public.website_media_slots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  slot_key text not null,
  media_type text not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint,
  alt_text text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_media_slots_slot_key_check check (
    slot_key in ('gallery_1', 'gallery_2', 'gallery_3', 'gallery_4', 'gallery_5', 'featured_video')
  ),
  constraint website_media_slots_media_type_check check (
    (slot_key like 'gallery_%' and media_type = 'image') or
    (slot_key = 'featured_video' and media_type = 'video')
  ),
  constraint website_media_slots_file_size_check check (file_size is null or file_size > 0),
  constraint website_media_slots_workspace_slot_unique unique (workspace_id, slot_key)
);

create index if not exists website_media_slots_workspace_idx
  on public.website_media_slots(workspace_id, slot_key);

create or replace function public.set_website_media_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists website_media_slots_set_updated_at on public.website_media_slots;
create trigger website_media_slots_set_updated_at
before update on public.website_media_slots
for each row execute function public.set_website_media_updated_at();

alter table public.website_media_slots enable row level security;
revoke all on table public.website_media_slots from anon, authenticated;
grant all on table public.website_media_slots to service_role;
revoke all on function public.set_website_media_updated_at() from public, anon, authenticated;
grant execute on function public.set_website_media_updated_at() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'website-media',
  'website-media',
  true,
  262144000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
