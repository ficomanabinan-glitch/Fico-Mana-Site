-- Run ONLY after the setup readiness_request_id returned HTTP 200 with
-- {"success":true,"dryRun":true}. This intentionally enables automatic emails.
-- Verify that response in net._http_response by its exact ID before running.
begin;
do $$
begin
  if not exists(select 1 from public.shoot_reminder_settings where id=1 and worker_secret_hash is not null)
    or not exists(select 1 from cron.job where jobname='fico-shoot-reminders') then
    raise exception 'Run shoot-reminders-setup.sql and verify the readiness probe first.';
  end if;
end;
$$;
update public.shoot_reminder_settings set enabled=true where id=1;
select cron.alter_job(jobid,active:=true) from cron.job where jobname='fico-shoot-reminders';
commit;
select jobname,schedule,active from cron.job where jobname='fico-shoot-reminders';
select enabled,last_completed_at from public.shoot_reminder_settings where id=1;
