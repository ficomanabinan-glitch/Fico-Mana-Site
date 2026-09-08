-- Staff review is atomic. Client submission itself never approves an editing job.
create or replace function public.review_portal_selection(
  p_workspace uuid, p_booking varchar, p_actor uuid, p_action text,
  p_submitted_at timestamptz, p_notes text default ''
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.editing_jobs; s public.photo_selections; b public.bookings;
begin
  if p_action not in ('Approve','Reject') or p_action is null or p_submitted_at is null then
    raise exception 'Invalid review request';
  end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace and user_id=p_actor and role in ('owner','admin','editor')) then
    raise exception 'Reviewer is not authorized';
  end if;
  if p_action='Reject' and (length(trim(coalesce(p_notes,'')))=0 or length(p_notes)>2000) then
    raise exception 'A rejection reason is required';
  end if;
  select * into j from public.editing_jobs where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Editing job not found'; end if;
  select * into s from public.photo_selections where workspace_id=p_workspace and booking_id=p_booking for update;
  if not found then raise exception 'Photo selection not found'; end if;
  select * into b from public.bookings where workspace_id=p_workspace and id=p_booking for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.raw_photo_submitted_at is distinct from p_submitted_at then
    raise exception 'Selection changed. Refresh the queue before reviewing';
  end if;
  if (p_action='Approve' and b.raw_photo_status='Approved' and s.status='SUBMITTED')
     or (p_action='Reject' and b.raw_photo_status='Rejected' and s.status='OPEN') then
    return jsonb_build_object('changed',false,'selectionId',s.id,'version',s.version);
  end if;
  if b.raw_photo_status is distinct from 'Pending Review' or s.status is distinct from 'SUBMITTED'
     or s.raw_reset_id is not null then
    raise exception 'Selection is not pending review. Refresh the queue';
  end if;
  if j.status not in ('WAITING_FOR_SELECTION','READY_FOR_EDITING') or j.downloaded_at is not null
     or j.download_lock_expires_at > now() then
    raise exception 'Editing has already started. Refresh the queue';
  end if;
  update public.bookings set raw_photo_status=case when p_action='Approve' then 'Approved' else 'Rejected' end,
    raw_photo_notes=p_notes, raw_photo_approved_at=case when p_action='Approve' then now() else null end
    where id=p_booking and workspace_id=p_workspace;
  update public.editing_jobs set status=case when p_action='Approve' then 'READY_FOR_EDITING' else 'WAITING_FOR_SELECTION' end,
    last_error=null, updated_at=now() where id=j.id;
  if p_action='Reject' then
    update public.photo_selections set status='OPEN',client_status='Selection In Progress',
      no_revision_acknowledged=false,no_revision_acknowledged_at=null,reopened_at=clock_timestamp(),
      version=coalesce(version,1)+1,updated_at=now() where id=s.id returning * into s;
  end if;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
    values(p_workspace,'staff',p_actor::text,case when p_action='Approve' then 'SELECTION_APPROVED' else 'SELECTION_REJECTED' end,
      p_booking,jsonb_build_object('selectionId',s.id,'version',s.version,'submittedAt',p_submitted_at,'notes',p_notes));
  return jsonb_build_object('changed',true,'selectionId',s.id,'version',s.version);
end $$;
revoke all on function public.review_portal_selection(uuid,varchar,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.review_portal_selection(uuid,varchar,uuid,text,timestamptz,text) to service_role;
