begin;

-- The portal disables bulk downloads when completed + still-reserved slots
-- reach the weekly limit. Requests must use the same accounting rule, or a
-- stalled Worker transfer leaves the client unable to ask staff for access.
create or replace function public.request_portal_raw_download(p_workspace uuid, p_public_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  portal public.client_portals%rowtype;
  state jsonb;
  created public.portal_raw_download_requests%rowtype;
begin
  if char_length(btrim(coalesce(p_reason,''))) < 5 or char_length(btrim(p_reason)) > 500 then
    raise exception 'A reason between 5 and 500 characters is required';
  end if;
  select cp.* into portal from public.client_portals cp
  join public.bookings b on b.id = cp.booking_id and b.workspace_id = cp.workspace_id
  join public.workspaces w on w.id = cp.workspace_id and w.slug = 'fico-mana' and w.status = 'active'
  where cp.public_id = p_public_id and cp.workspace_id = p_workspace for update of cp;
  if not found then raise exception 'Portal is unavailable'; end if;
  state := public.portal_raw_download_state(p_workspace, p_public_id);
  if (state->>'completedInWindow')::integer + (state->>'activeDownloads')::integer < (state->>'limit')::integer then
    raise exception 'Download access is still available';
  end if;
  insert into public.portal_raw_download_requests(workspace_id,booking_id,portal_id,reason)
  values (portal.workspace_id,portal.booking_id,portal.id,btrim(p_reason)) returning * into created;
  insert into public.workflow_audit_logs(workspace_id,actor_type,actor_id,action,booking_id,metadata)
  values (portal.workspace_id,'client',p_public_id::text,'RAW_DOWNLOAD_ACCESS_REQUESTED',portal.booking_id,
    jsonb_build_object('requestId',created.id,'reason',created.reason));
  return jsonb_build_object('id',created.id,'status',created.status,'requestedAt',created.requested_at);
exception when unique_violation then
  raise exception 'A download request is already waiting for the studio';
end;
$$;

revoke all on function public.request_portal_raw_download(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.request_portal_raw_download(uuid,uuid,text) to service_role;

commit;
