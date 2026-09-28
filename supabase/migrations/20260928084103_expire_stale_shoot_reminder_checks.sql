-- pg_net removes HTTP response rows after its retention window. A missing old
-- response is no longer evidence that the reminder service failed.
create or replace function public.get_shoot_reminder_control(p_workspace uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  settings public.shoot_reminder_settings;
  job cron.job;
  probe net._http_response;
  configured boolean;
  probe_status text := 'not_checked';
  problem text;
begin
  perform public.assert_shoot_reminder_admin(p_workspace,p_actor);
  select * into strict settings from public.shoot_reminder_settings where id=1;
  select * into job from cron.job where jobname='fico-shoot-reminders' and username=current_user;
  select * into probe from net._http_response where id=settings.readiness_request_id;
  configured := settings.worker_secret_hash is not null and job.jobid is not null
    and job.schedule='*/5 22-23 * * *' and job.command=public.shoot_reminder_cron_command();
  if settings.readiness_started_at is not null then
    if probe.id is null then
      probe_status := case when settings.readiness_started_at>now()-interval '90 seconds'
        then 'checking' else 'expired' end;
    elsif public.shoot_reminder_probe_ok(probe.status_code,probe.content,probe.error_msg,probe.timed_out) then
      probe_status := case when settings.readiness_started_at>now()-interval '10 minutes'
        then 'ready' else 'expired' end;
    else
      probe_status := 'failed';
      problem := 'The reminder service did not pass its check. Try: Check Reminder Service again; if it still fails, verify the production email configuration.';
    end if;
  end if;
  return jsonb_build_object('enabled',settings.enabled,'configured',configured,
    'schedulerActive',coalesce(job.active,false),'probeStatus',probe_status,
    'checkedAt',settings.readiness_started_at,'lastVerifiedAt',settings.readiness_verified_at,
    'canActivate',configured and probe_status='ready' and settings.readiness_started_at>now()-interval '10 minutes',
    'problem',problem,'lastCompletedAt',settings.last_completed_at,
    'updatedAt',settings.updated_at,'timeZone','Asia/Manila','sendTime','06:00',
    'firstReminderDaysBefore',1,'morningRule','confirmed_or_no_response_after_first_email');
end;
$$;

revoke all on function public.get_shoot_reminder_control(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_shoot_reminder_control(uuid,uuid) to service_role;
