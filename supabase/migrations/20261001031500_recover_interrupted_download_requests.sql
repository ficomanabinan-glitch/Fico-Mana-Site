begin;

-- A granted transfer can be interrupted without the browser notifying the
-- Worker. Let the client return that reservation to the staff queue instead
-- of being trapped by the one-open-request constraint for six hours.
create or replace function public.request_portal_raw_download(p_workspace uuid, p_public_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  portal public.client_portals%rowtype;
  state jsonb;
  request_row public.portal_raw_download_requests%rowtype;
  attempt_id uuid;
  manifest_id uuid;
  recovering boolean := false;
begin
  if char_length(btrim(coalesce(p_reason,''))) < 5 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason between 5 and 500 characters is required';
  end if;
  select cp.* into portal from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace for update of cp;
  if not found then raise exception 'Portal is unavailable'; end if;

  -- Also validates active status/expiry and releases expired reservations.
  state := public.portal_raw_download_state(p_workspace, p_public_id);
  select * into request_row from public.portal_raw_download_requests
  where portal_id = portal.id and workspace_id = p_workspace
    and status in ('PENDING','GRANTED','RESERVED')
  order by requested_at desc limit 1;

  if found and request_row.status = 'RESERVED' then
    recovering := true;
    -- Match Worker completion's lock order: manifest, then attempt, then
    -- request. Invalidate the old capability before making it reviewable.
    for manifest_id in
      select m.id from public.private_download_manifests m
      join public.portal_raw_download_attempts a on a.id = m.raw_attempt_id
      where a.request_id = request_row.id and a.portal_id = portal.id
        and a.workspace_id = p_workspace and m.workspace_id = p_workspace
        and m.status = 'PENDING'
      order by m.id for update of m
    loop
      update public.private_download_manifests
      set status = 'FAILED', completed_at = null, updated_at = clock_timestamp()
      where id = manifest_id;
    end loop;
    for attempt_id in
      select a.id from public.portal_raw_download_attempts a
      where a.request_id = request_row.id and a.portal_id = portal.id
        and a.workspace_id = p_workspace and a.status = 'STARTED'
      order by a.id
    loop
      perform public.finish_portal_raw_download(attempt_id, false);
    end loop;
    select * into request_row from public.portal_raw_download_requests
    where id = request_row.id and workspace_id = p_workspace for update;
    if request_row.status in ('GRANTED','RESERVED') then
      update public.portal_raw_download_requests
      set status = 'PENDING', reason = btrim(p_reason),
          requested_at = clock_timestamp(), granted_at = null, granted_by = null,
          consumed_at = null, updated_at = clock_timestamp()
      where id = request_row.id returning * into request_row;
      insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
      values (portal.workspace_id,'client',p_public_id::text,'RAW_DOWNLOAD_ACCESS_REQUESTED',portal.booking_id,
        jsonb_build_object('requestId',request_row.id,'reason',request_row.reason,'recoveredReservation',true));
    end if;
  end if;

  -- Repeated submissions confirm the same request; they do not create another
  -- allowance or tell the client that an already granted request is pending.
  if request_row.status in ('PENDING','GRANTED') then
    return jsonb_build_object('id',request_row.id,'status',request_row.status,
      'requestedAt',request_row.requested_at,'existing',not recovering);
  end if;

  -- A concurrent successful completion may have consumed the old request.
  -- Re-read accounting before creating its replacement.
  state := public.portal_raw_download_state(p_workspace, p_public_id);
  if (state->>'completedInWindow')::integer + (state->>'activeDownloads')::integer < (state->>'limit')::integer then
    raise exception 'Download access is still available';
  end if;
  insert into public.portal_raw_download_requests(workspace_id,booking_id,portal_id,reason)
  values (portal.workspace_id,portal.booking_id,portal.id,btrim(p_reason)) returning * into request_row;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
  values (portal.workspace_id,'client',p_public_id::text,'RAW_DOWNLOAD_ACCESS_REQUESTED',portal.booking_id,
    jsonb_build_object('requestId',request_row.id,'reason',request_row.reason));
  return jsonb_build_object('id',request_row.id,'status',request_row.status,
    'requestedAt',request_row.requested_at,'existing',false);
end;
$$;

revoke all on function public.request_portal_raw_download(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.request_portal_raw_download(uuid,uuid,text) to service_role;

commit;
