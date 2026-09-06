-- Dedicated editor portal access, assignment, and download activity tracking.
-- Drive credentials and workflow tables remain service-role only; browser users
-- are authorized by server routes against workspace_members.

alter table public.workspace_members
  add column if not exists display_name text;

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner','admin','editor','onsite','staff'));

alter table public.editing_jobs
  add column if not exists assigned_editor_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_editor_name text,
  add column if not exists claimed_at timestamptz,
  add column if not exists downloaded_by uuid references auth.users(id) on delete set null,
  add column if not exists download_locked_by uuid references auth.users(id) on delete set null,
  add column if not exists download_lock_expires_at timestamptz,
  add column if not exists photographer_name text;

create index if not exists editing_jobs_assigned_editor_idx
  on public.editing_jobs(workspace_id, assigned_editor_id, status);

create index if not exists editing_jobs_download_lock_idx
  on public.editing_jobs(workspace_id, download_lock_expires_at)
  where download_lock_expires_at is not null;

create table if not exists public.workflow_match_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid references public.editing_batches(id) on delete cascade,
  upload_job_id uuid references public.batch_upload_jobs(id) on delete cascade,
  source_folder_name text not null,
  suggested_booking_id varchar references public.bookings(id) on delete set null,
  resolved_booking_id varchar references public.bookings(id) on delete set null,
  status text not null default 'NEEDS_REVIEW'
    check (status in ('NEEDS_REVIEW','RESOLVED','DISMISSED')),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_match_reviews_queue_idx
  on public.workflow_match_reviews(workspace_id, status, created_at desc);

alter table public.workflow_match_reviews enable row level security;
revoke all on table public.workflow_match_reviews from anon, authenticated;
grant all on table public.workflow_match_reviews to service_role;
