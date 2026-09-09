-- Selection IDs only, never public provider URLs. Existing prices, grants and RLS stay unchanged.
alter table public.addon_catalog add column if not exists photo_limit integer
  check (photo_limit between 0 and 4);
update public.addon_catalog set photo_limit = case
  when lower(trim(name)) = 'extra edit' then 0
  when lower(name) like '%wallet%' then 4
  when lower(name) like '%4r%' and lower(name) not like '%frame%' then 2
  when lower(name) like '%frame%' or lower(name) like '%a4%' then 1
  else 0 end;

alter table public.client_addon_orders add column if not exists photo_ids uuid[] not null default '{}'
  check (cardinality(photo_ids) <= 4 and array_position(photo_ids, null) is null);

create or replace function public.validate_addon_photo_assignments()
returns trigger language plpgsql set search_path = public as $$
declare allowed_count integer;
begin
  -- Historical orders are left intact. New assignments must belong to this selection and booking.
  if cardinality(new.photo_ids) = 0 then return new; end if;
  select count(distinct i.gallery_file_id) into allowed_count
  from public.photo_selection_items i
  join public.gallery_files g on g.id = i.gallery_file_id
  where i.selection_id = new.selection_id and g.booking_id = new.booking_id
    and g.workspace_id = new.workspace_id and i.gallery_file_id = any(new.photo_ids);
  if allowed_count <> cardinality(new.photo_ids) then
    raise exception 'Add-on photos must be unique selected photos from the same booking';
  end if;
  return new;
end $$;
drop trigger if exists validate_addon_photo_assignments on public.client_addon_orders;
create trigger validate_addon_photo_assignments before insert or update of photo_ids
on public.client_addon_orders for each row execute function public.validate_addon_photo_assignments();
