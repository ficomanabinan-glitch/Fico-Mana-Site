-- Approved selections may be reopened only before editing or download begins.
-- The review, portal renewal, and audit record are committed as one operation.
create or replace function public.review_portal_selection(
  p_workspace uuid, p_booking varchar, p_actor uuid, p_action text,
  p_submitted_at timestamptz, p_notes text default ''
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  j public.editing_jobs;
  s public.photo_selections;
  b public.bookings;
  portal public.client_portals;
  days integer;
begin
  if p_action not in ('Approve','Reject','Reopen') or p_action is null or p_submitted_at is null then
    raise exception 'Invalid review request';
  end if;
  if not exists(
    select 1 from public.workspace_members
    where workspace_id=p_workspace and user_id=p_actor and role in ('owner','admin','editor')
  ) then
    raise exception 'Reviewer is not authorized';
  end if;
  if p_action='Reject' and (length(trim(coalesce(p_notes,'')))=0 or length(p_notes)>2000) then
    raise exception 'A rejection reason is required';
  end if;

  select * into j from public.editing_jobs
    where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Editing job not found'; end if;
  select * into s from public.photo_selections
    where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Photo selection not found'; end if;
  select * into b from public.bookings
    where workspace_id=p_workspace and id=p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.raw_photo_submitted_at is distinct from p_submitted_at then
    raise exception 'Selection changed. Sync the queue before reviewing';
  end if;

  if (p_action='Approve' and b.raw_photo_status='Approved' and s.status='SUBMITTED')
     or (p_action='Reject' and b.raw_photo_status='Rejected' and s.status='OPEN')
     or (p_action='Reopen' and b.raw_photo_status='Reopened' and s.status='OPEN') then
    return jsonb_build_object('changed',false,'selectionId',s.id,'version',s.version);
  end if;

  if s.raw_reset_id is not null then
    raise exception 'Photos are being updated. Sync the queue';
  end if;
  if p_action in ('Approve','Reject') then
    if b.raw_photo_status is distinct from 'Pending Review' or s.status is distinct from 'SUBMITTED' then
      raise exception 'Selection is not pending review. Sync the queue';
    end if;
  elsif b.raw_photo_status is distinct from 'Approved' or s.status is distinct from 'SUBMITTED' then
    raise exception 'Selection is not approved for reopening. Sync the queue';
  end if;
  if j.status not in ('WAITING_FOR_SELECTION','READY_FOR_EDITING') or j.downloaded_at is not null
     or j.editing_started_at is not null or j.delivered_at is not null
     or j.download_lock_expires_at > now()
     or exists(select 1 from public.deliverable_files f where f.workspace_id=p_workspace and f.booking_id=p_booking)
     or exists(select 1 from public.batch_upload_items i where i.editing_job_id=j.id and i.booking_id=p_booking) then
    raise exception 'Editing has already started. Sync the queue';
  end if;
  if p_action='Reopen' and j.status is distinct from 'READY_FOR_EDITING' then
    raise exception 'Selection is not approved for reopening. Sync the queue';
  end if;

  update public.bookings
  set raw_photo_status=case
        when p_action='Approve' then 'Approved'
        when p_action='Reject' then 'Rejected'
        else 'Reopened'
      end,
      raw_photo_notes=case when p_action='Reopen' then null else p_notes end,
      raw_photo_approved_at=case when p_action='Approve' then now() else null end
  where id=p_booking and workspace_id=p_workspace;

  update public.editing_jobs
  set status=case when p_action='Approve' then 'READY_FOR_EDITING' else 'WAITING_FOR_SELECTION' end,
      last_error=null,
      updated_at=now()
  where id=j.id;

  if p_action in ('Reject','Reopen') then
    update public.photo_selections
    set status='OPEN',
        client_status='Selection In Progress',
        no_revision_acknowledged=false,
        no_revision_acknowledged_at=null,
        reopened_at=clock_timestamp(),
        version=coalesce(version,1)+1,
        updated_at=now()
    where id=s.id
    returning * into s;
  end if;

  if p_action='Reopen' then
    select cp.* into portal
    from public.client_portals cp
    where cp.workspace_id=p_workspace and cp.booking_id=p_booking
    for update of cp;
    if not found then raise exception 'Client Portal not found'; end if;
    if portal.first_download_at is not null then
      raise exception 'Portal download access has already started. Sync the queue';
    end if;
    days := coalesce(
      portal.download_expiry_days,
      (select settings.portal_expiry_days
       from public.google_drive_settings settings
       where settings.workspace_id=p_workspace and settings.id=1),
      30
    );
    if days < 1 or days > 3650 then raise exception 'Portal expiry setting is invalid'; end if;

    update public.client_portals
    set status='active',
        -- Reopening selection must not start the deliverables countdown. The
        -- record_portal_first_download function owns that transition.
        expires_at=null,
        download_expiry_days=days,
        updated_at=clock_timestamp()
    where id=portal.id;
  end if;

  insert into public.workflow_audit_logs(
    workspace_id,actor_type,actor_id,action,booking_id,metadata
  ) values(
    p_workspace,
    'staff',
    p_actor::text,
    case
      when p_action='Approve' then 'SELECTION_APPROVED'
      when p_action='Reject' then 'SELECTION_REJECTED'
      else 'SELECTION_REOPENED'
    end,
    p_booking,
    jsonb_build_object(
      'selectionId',s.id,
      'version',s.version,
      'submittedAt',p_submitted_at,
      'notes',p_notes,
      'portalId',case when p_action='Reopen' then portal.id else null end
    )
  );
  return jsonb_build_object('changed',true,'selectionId',s.id,'version',s.version);
end $$;

revoke all on function public.review_portal_selection(uuid,varchar,uuid,text,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.review_portal_selection(uuid,varchar,uuid,text,timestamptz,text)
  to service_role;
