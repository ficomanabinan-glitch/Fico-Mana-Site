-- Keep one assignment for each standard print category, while allowing the
-- wallet allocation to reference one to four different included photos.
drop index if exists public.print_allocations_selection_category_idx;

create unique index if not exists print_allocations_selection_category_file_idx
  on public.print_allocations(selection_id, category, gallery_file_id);

create unique index if not exists print_allocations_single_standard_category_idx
  on public.print_allocations(selection_id, category)
  where category <> 'WALLET_SIZE';
